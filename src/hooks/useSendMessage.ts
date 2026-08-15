import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { useStore } from 'react-redux';
// localStorage 标记已移除，完全依赖后端 stream-status 判断是否重连
import {
  applySuggestedQuestionsPending,
  appendMessage,
  materializeConversation,
  mergeHydratedConversation,
  removeConversation,
  removeMessage,
  requestConversationListRefresh,
  requestSuggestedQuestionsObservation,
  setAnimatingTitleId,
  setGlobalError,
  setHydrationStatus,
  setPendingConversationId,
  updateConversationTitle,
  updateConversationKnowledgeBaseIds,
  updateMessage,
  upsertConversation,
} from '@/redux/slices/conversationSlice';
import { resolveComposerAgentMode } from '@/lib/agent/composerAgentMode';
import {
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  finalizeRun,
  migrateStreamConversation,
  selectFullStreamContentBlocks,
  selectStreamContentBlocks,
  setStreamError,
  setStreamStatus,
  startStream,
} from '@/redux/slices/streamSlice';
import {
  getChatCapabilities,
  isRecoverableStreamError,
  reconnectStream,
  sendMessageStream,
} from '@/lib/api/chat';
import type { StreamCallbacks } from '@/lib/api/chat';
import { runResumableStream } from '@/lib/api/resumableStream';
import { generateChatTitle } from '@/lib/api/title';
import { createAgentStreamEventHandlers } from '@/lib/agent/streamEventHandlers';
import {
  recoverReasoningOnlyFinalBlocks,
  shouldRecoverReasoningOnlyFinalBlocks,
} from '@/lib/chat/contentBlocks';
import {
  getConversationDetailRequestMetadata,
  invalidateConversationDetail,
  isStaleConversationDetailRequestError,
  loadConversationDetail,
} from '@/lib/chat/conversationDetailResource';
import {
  getConversationHydrationMetadata,
  getProtectedHydrationMessageIds,
} from '@/lib/chat/conversationHydrationMerge';
import {
  getSendModelErrorMessage,
  isModelAvailableForSending,
  resolveSendModel,
} from '@/lib/chat/sendModelResolution';
import {
  clearFirstTurnContextState,
  moveFirstTurnContextState,
} from '@/lib/chat/contextStatusPersistence';
import { hasFormalTextContent } from '@/lib/chat/suggestedQuestionState';
import type { Message, ContentBlock } from '@/types/conversation';
import type { FileAttachment } from '@/lib/utils/fileHelpers';
import { selectAuthSessionKey } from '@/redux/selectors';
import { useTypewriter } from './useTypewriter';
import { useRetryMessage } from './useRetryMessage';
import type { RootState } from '@/redux/store';

type SendMessageOptions = {
  conversationId: string | null;
  /** 重试在删除原消息前已经验证过的会话模型，避免删除后被误判成新对话。 */
  resolvedModelId?: string;
  /** 标记为新对话（即使提供了 conversationId，也当作草稿处理）。用于首页上传文件后发送的场景 */
  isDraft?: boolean;
  /** 本地草稿会话已创建，可用于先进入会话页，不必等待服务端 materialize */
  onDraftCreated?: (draftConversationId: string) => void;
  onMaterialized?: (serverConversationId: string) => void;
  onStreamEnd?: (conversationId: string) => void;
  /** undefined=保持，[]=清空，非空数组按服务端能力上限替换会话知识库选择。 */
  knowledgeBaseIds?: string[];
  /** 发送尚未被本地消息队列接收时通知输入区保留草稿。 */
  onRejectedBeforeSend?: () => void;
  /** 本地消息与流控制器均已建立，可以提交输入区清理或重试替换。 */
  onAccepted?: () => void;
};

const STOP_BEFORE_READY_RETRY_DELAYS_MS = [50, 150] as const;
const STOP_OPERATION_TIMEOUT_MS = 500;
const INTERRUPTED_HYDRATION_RETRY_MS = 300;
const activeSendPreparations = new Set<string>();

interface SendSessionContext {
  authSessionKey: string;
  conversationEpoch: number;
  generation: number;
}

function captureSendSessionContext(
  state: RootState,
  generation: number
): SendSessionContext | null {
  const authSessionKey = selectAuthSessionKey(state);
  if (!authSessionKey) return null;
  return {
    authSessionKey,
    conversationEpoch: state.conversation.conversationListEpoch,
    generation,
  };
}

function isSendSessionCurrent(state: RootState, context: SendSessionContext): boolean {
  return (
    selectAuthSessionKey(state) === context.authSessionKey &&
    state.conversation.conversationListEpoch === context.conversationEpoch
  );
}

function stopAbortError(): Error {
  const error = new Error('停止请求已超时');
  error.name = 'AbortError';
  return error;
}

async function waitForStopRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw stopAbortError();
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(stopAbortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const IMAGE_DIMENSION_ERROR_MESSAGE = '图片尺寸过小，当前模型要求宽高都大于 10 像素，请换一张更大的图片后重试';

function normalizeSendErrorMessage(message: string): string {
  if (
    message.includes('image length and width do not meet the model restrictions') ||
    message.includes('height:2 or width:2 must be larger than 10') ||
    (message.includes('InternalError.Algo.InvalidParameter') && message.includes('image'))
  ) {
    return IMAGE_DIMENSION_ERROR_MESSAGE;
  }

  return message;
}

function isInterruptedStreamSignal(value: unknown): boolean {
  const candidate = (
    typeof value === 'object' && value !== null
      ? value as { code?: unknown; message?: unknown }
      : {}
  );
  return (
    candidate.code === 'stream_interrupted' ||
    (
      candidate.code === 'stream_error' &&
      candidate.message === '用户中止'
    )
  );
}

function hasEmptyKnowledgeEvidence(blocks: ContentBlock[]): boolean {
  return blocks.some(
    (block) => block.type === 'knowledge_evidence' && block.status === 'empty',
  );
}

async function postStreamActions(
  conversationId: string,
  dispatch: ReturnType<typeof useAppDispatch>,
  isSessionCurrent: () => boolean,
  skipTitleGeneration = false,
) {
  if (!isSessionCurrent()) return;
  try {
    if (!skipTitleGeneration) {
      const title = await generateChatTitle(conversationId, undefined, { max_length: 20 });
      if (!isSessionCurrent()) return;
      dispatch(updateConversationTitle({ id: conversationId, title }));
      dispatch(setAnimatingTitleId(conversationId));
      setTimeout(() => {
        if (isSessionCurrent()) {
          dispatch(setAnimatingTitleId(null));
        }
      }, title.length * 200 + 1000);
    }
  } catch (error) {
    if (isSessionCurrent()) {
      console.warn('自动生成会话标题失败', error);
    }
  } finally {
    if (isSessionCurrent()) {
      dispatch(requestConversationListRefresh(conversationId));
    }
  }
}

export function useSendMessage() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const reasoningEnabled = useAppSelector((state) => state.conversation.reasoningEnabled);
  const composerAgentMode = useAppSelector((state) => state.conversation.composerAgentMode);
  const authSessionKey = useAppSelector(selectAuthSessionKey);
  const conversationEpoch = useAppSelector(
    (state) => state.conversation.conversationListEpoch
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const stopInFlightPromiseRef = useRef<Promise<void> | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const userMessageIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  // BE 在 run_started/onReady 给的真实 assistant message_id，stop 时校验用。
  // 不复用 assistantMessageIdRef（那是 placeholder，streaming 期渲染匹配仍要用）
  const serverMessageIdRef = useRef<string | null>(null);
  const assistantHasContentRef = useRef(false);
  const sendGenerationRef = useRef(0);
  const activeSendContextRef = useRef<SendSessionContext | null>(null);
  const typewriter = useTypewriter();
  const typewriterRef = useRef(typewriter);
  typewriterRef.current = typewriter;
  const sendBoundaryRef = useRef({ authSessionKey, conversationEpoch });

  const hydrateAuthoritativeConversation = useCallback(
    async (conversationId: string, isSessionCurrent: () => boolean) => {
      if (!isSessionCurrent()) return;

      // SSE 完成后必须绕过发送前可能已挂起的详情请求，以“完成时”的本地消息
      // 作为合并基线重新取一次服务端快照。旧 API 若忽略客户端消息 ID，服务端
      // 快照会替换本地乐观副本；新 API 则会用同 ID 补齐 sequence / usage。
      invalidateConversationDetail(conversationId);
      const request = loadConversationDetail(conversationId, {
        requestMetadata: getConversationHydrationMetadata(store.getState(), conversationId),
      });
      const requestMetadata = getConversationDetailRequestMetadata(request);
      dispatch(setHydrationStatus({ id: conversationId, status: 'loading' }));

      try {
        const serverConversation = await request;
        if (!isSessionCurrent()) return;
        const state = store.getState();
        dispatch(mergeHydratedConversation({
          conversation: serverConversation,
          preserveMessageIds: getProtectedHydrationMessageIds(
            state,
            conversationId,
            requestMetadata,
          ),
          requestMetadata,
        }));
      } catch (error) {
        if (isStaleConversationDetailRequestError(error) || !isSessionCurrent()) {
          return;
        }
        // 流式结果已经可用，权威快照刷新失败不应把正常完成的发送 UI 变成错误态。
        dispatch(setHydrationStatus({ id: conversationId, status: 'done' }));
      }
    },
    [dispatch, store]
  );

  const invalidateFrontendSend = useCallback(() => {
    sendGenerationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    typewriterRef.current.stop();
    stopInFlightPromiseRef.current = null;
    activeConvIdRef.current = null;
    userMessageIdRef.current = null;
    assistantMessageIdRef.current = null;
    serverMessageIdRef.current = null;
    assistantHasContentRef.current = false;
    activeSendContextRef.current = null;
    dispatch(endStream());
  }, [dispatch]);

  useEffect(() => {
    const previousBoundary = sendBoundaryRef.current;
    sendBoundaryRef.current = { authSessionKey, conversationEpoch };
    if (
      previousBoundary.authSessionKey !== authSessionKey ||
      previousBoundary.conversationEpoch !== conversationEpoch
    ) {
      invalidateFrontendSend();
    }
  }, [authSessionKey, conversationEpoch, invalidateFrontendSend]);

  useEffect(() => {
    return () => {
      const activeSendContext = activeSendContextRef.current;
      if (
        activeSendContext &&
        !isSendSessionCurrent(store.getState(), activeSendContext)
      ) {
        invalidateFrontendSend();
      }
    };
  }, [invalidateFrontendSend, store]);

  // 获取当前流式会话 ID：优先用 ref（sendMessage 设置），fallback 到 Redux（reconnect 设置）
  const getStreamingConvId = useCallback(() => {
    return activeConvIdRef.current
      || (store.getState() as { stream: { conversationId: string | null } }).stream.conversationId;
  }, [store]);

  const stopStreaming = useCallback((): Promise<void> => {
    if (stopInFlightPromiseRef.current) {
      return stopInFlightPromiseRef.current;
    }

    const stopOperation = (async () => {
      const convId = getStreamingConvId();
      const userMsgId = userMessageIdRef.current;
      const assistantMsgId = assistantMessageIdRef.current;
      const serverMsgId = serverMessageIdRef.current;
      const pendingConversationId = (
        store.getState() as { conversation: { pendingConversationId: string | null } }
      ).conversation.pendingConversationId;
      const shouldDiscardPendingDraft = Boolean(
        convId && pendingConversationId === convId
      );

      typewriterRef.current.stop();

      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      if (convId && userMsgId) {
        dispatch(
          updateMessage({
            conversationId: convId,
            messageId: userMsgId,
            patch: { status: null },
          })
        );
      }

      // 把 streamSlice 已有内容写回 assistant 消息，防止 endStream 清空后丢失
      if (convId && assistantMsgId) {
        const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
        const partialBlocks = selectFullStreamContentBlocks(streamState);
        if (partialBlocks.length > 0) {
          dispatch(updateMessage({
            conversationId: convId,
            messageId: assistantMsgId,
            patch: { content: partialBlocks },
          }));
        }
      }

      if (shouldDiscardPendingDraft && convId) {
        dispatch(removeConversation(convId));
        dispatch(setPendingConversationId(null));
      }

      if (convId) clearFirstTurnContextState(convId);
      dispatch(endStream());
      sendGenerationRef.current += 1;
      activeSendContextRef.current = null;
      activeConvIdRef.current = null;
      userMessageIdRef.current = null;
      assistantMessageIdRef.current = null;
      serverMessageIdRef.current = null;
      assistantHasContentRef.current = false;

      // 本地先完成停止；远端按真实服务端 message_id 精确取消。
      // run_started 尚未到达时不传 placeholder，允许 Redis 按 conversation 跨 worker 取消。
      if (convId) {
        const stopController = new AbortController();
        const stopTimeout = setTimeout(
          () => stopController.abort(),
          STOP_OPERATION_TIMEOUT_MS
        );
        try {
          const { stopStream } = await import('@/lib/api/chat');
          let cancelled = await stopStream(
            convId,
            serverMsgId || undefined,
            stopController.signal
          );
          if (!serverMsgId) {
            for (const delayMs of STOP_BEFORE_READY_RETRY_DELAYS_MS) {
              if (cancelled) break;
              await waitForStopRetry(delayMs, stopController.signal);
              cancelled = await stopStream(convId, undefined, stopController.signal);
            }
          }
        } catch (error) {
          if (!stopController.signal.aborted) {
            console.warn('停止后台生成失败，已完成本地停止', error);
          }
        } finally {
          clearTimeout(stopTimeout);
        }
      }
    })();

    stopInFlightPromiseRef.current = stopOperation;
    void stopOperation.then(
      () => {
        if (stopInFlightPromiseRef.current === stopOperation) {
          stopInFlightPromiseRef.current = null;
        }
      },
      () => {
        if (stopInFlightPromiseRef.current === stopOperation) {
          stopInFlightPromiseRef.current = null;
        }
      }
    );
    return stopOperation;
  }, [dispatch, store, getStreamingConvId]);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions, attachments?: FileAttachment[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;
      const preparationContext = captureSendSessionContext(
        store.getState(),
        sendGenerationRef.current,
      );
      if (!preparationContext) {
        options.onRejectedBeforeSend?.();
        return;
      }
      const sendSessionKey = preparationContext.authSessionKey;
      const streamIsOwnedByAnotherComposer = Boolean(
        store.getState().stream.isStreaming && !abortControllerRef.current,
      );
      if (
        activeSendPreparations.has(sendSessionKey)
        || streamIsOwnedByAnotherComposer
      ) {
        options.onRejectedBeforeSend?.();
        return;
      }
      activeSendPreparations.add(sendSessionKey);
      let preparationReleased = false;
      const releaseSendPreparation = () => {
        if (preparationReleased) return;
        preparationReleased = true;
        activeSendPreparations.delete(sendSessionKey);
      };
      const rejectStalePreparation = () => {
        if (isSendSessionCurrent(store.getState(), preparationContext)) return false;
        releaseSendPreparation();
        options.onRejectedBeforeSend?.();
        return true;
      };

      try {
        if (stopInFlightPromiseRef.current) {
          await stopInFlightPromiseRef.current;
          if (rejectStalePreparation()) return;
        }

        if (abortControllerRef.current) {
          await stopStreaming();
          if (rejectStalePreparation()) return;
        }
      } catch (error) {
        releaseSendPreparation();
        throw error;
      }

      const isDraft = options.isDraft ?? (options.conversationId === null);
      const currentState = store.getState();
      const useResolvedModel = Boolean(
        options.resolvedModelId
        && !isDraft
        && options.conversationId,
      );
      const prevalidatedModel = useResolvedModel
        ? currentState.models.models.find((model) => (
            model.id === options.resolvedModelId
            && isModelAvailableForSending(model)
          ))
        : null;
      const modelResolution = prevalidatedModel
        ? { status: 'ready' as const, model: prevalidatedModel }
        : useResolvedModel
          ? { status: 'conversation_model_unavailable' as const }
          : resolveSendModel(
              currentState,
              isDraft ? null : options.conversationId,
            );
      if (modelResolution.status !== 'ready') {
        dispatch(setGlobalError(getSendModelErrorMessage(modelResolution)));
        releaseSendPreparation();
        options.onRejectedBeforeSend?.();
        return;
      }
      const enabledModel = modelResolution.model;
      const effectiveKnowledgeBaseIds = options.knowledgeBaseIds ?? (
        !isDraft && options.conversationId
          ? currentState.conversation.byId[options.conversationId]?.knowledge_base_ids
          : undefined
      );
      const strictKnowledgeMode = Boolean(effectiveKnowledgeBaseIds?.length);
      if (strictKnowledgeMode) {
        let capabilities: Awaited<ReturnType<typeof getChatCapabilities>>;
        try {
          capabilities = await getChatCapabilities();
        } catch {
          dispatch(setGlobalError('知识库问答当前不可用，请刷新页面后重试'));
          releaseSendPreparation();
          options.onRejectedBeforeSend?.();
          return;
        }
        if (rejectStalePreparation()) return;
        const maxKnowledgeBases = capabilities.knowledge_grounding_max_bases;
        if (
          !capabilities.knowledge_grounding_v1
          || !Number.isSafeInteger(maxKnowledgeBases)
          || maxKnowledgeBases < 1
        ) {
          dispatch(setGlobalError('知识库问答当前不可用，请刷新页面后重试'));
          releaseSendPreparation();
          options.onRejectedBeforeSend?.();
          return;
        }
        if ((effectiveKnowledgeBaseIds?.length ?? 0) > maxKnowledgeBases) {
          dispatch(setGlobalError(`最多只能选择 ${maxKnowledgeBases} 个知识库`));
          releaseSendPreparation();
          options.onRejectedBeforeSend?.();
          return;
        }
      }
      const agentModeResolution = resolveComposerAgentMode(
        strictKnowledgeMode ? 'auto' : composerAgentMode,
        enabledModel.capabilities,
      );

      const nextGeneration = sendGenerationRef.current + 1;
      const sendContext = captureSendSessionContext(store.getState(), nextGeneration);
      if (!sendContext) {
        releaseSendPreparation();
        options.onRejectedBeforeSend?.();
        return;
      }
      sendGenerationRef.current = nextGeneration;
      activeSendContextRef.current = sendContext;
      const isSessionCurrent = () => isSendSessionCurrent(store.getState(), sendContext);
      const isActiveSendCurrent = () => (
        sendGenerationRef.current === sendContext.generation &&
        isSessionCurrent()
      );

      const tempConvId = isDraft && !options.conversationId ? uuidv4() : options.conversationId!;
      const previousKnowledgeSelection = (
        !isDraft
        && options.knowledgeBaseIds !== undefined
        && currentState.conversation.byId[tempConvId]
      )
        ? {
            knowledgeBaseIds: currentState.conversation.byId[tempConvId].knowledge_base_ids,
            updatedAt: currentState.conversation.byId[tempConvId].updatedAt,
          }
        : null;

      // 发送开始后，发送前发出的详情 GET 已不再能代表当前会话。立即让它失效，
      // 并结束其 loading 状态，避免迟到快照覆盖本轮乐观消息或永久停在加载态。
      invalidateConversationDetail(tempConvId);
      if (options.conversationId) {
        dispatch(setHydrationStatus({ id: tempConvId, status: 'done' }));
      }

      if (isDraft) {
        dispatch(setPendingConversationId(tempConvId));
        dispatch(
          upsertConversation({
            id: tempConvId,
            title: content.substring(0, 30),
            model_id: enabledModel.id,
            knowledge_base_ids: options.knowledgeBaseIds ?? [],
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        );
      }

      if (!isDraft && options.knowledgeBaseIds !== undefined) {
        dispatch(updateConversationKnowledgeBaseIds({
          id: tempConvId,
          knowledgeBaseIds: options.knowledgeBaseIds,
        }));
      }

      activeConvIdRef.current = tempConvId;
      assistantHasContentRef.current = false;

      const userMessageId = uuidv4();
      const assistantMessageId = uuidv4();
      userMessageIdRef.current = userMessageId;
      assistantMessageIdRef.current = assistantMessageId;
      // 清理上一轮残留的 server message id，等本轮 onReady 重新写入
      serverMessageIdRef.current = null;

      // 构建用户消息 content blocks（文本 + 文件）
      const contentBlocks: ContentBlock[] = [
        { type: 'text', id: `blk_${userMessageId.slice(0, 12)}`, text: content.trim() },
      ];
      if (attachments) {
        for (const att of attachments) {
          contentBlocks.push({
            type: 'file',
            id: `blk_${uuidv4().slice(0, 12)}`,
            file_id: att.fileId,
            filename: att.filename,
            mime_type: att.mimeType,
            // 图片文件用本地 previewUrl 作为即时缩略图，后端持久化的 thumbnail_url 在刷新后生效
            thumbnail_url: att.mimeType.startsWith('image/') ? att.previewUrl : undefined,
          });
        }
      }

      const fileIds = attachments?.map((a) => a.fileId);

      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: contentBlocks,
        status: 'pending',
        timestamp: Date.now(),
      };

      const assistantPlaceholder: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: [],
        timestamp: Date.now(),
      };

      dispatch(appendMessage({ conversationId: tempConvId, message: userMessage }));
      dispatch(appendMessage({ conversationId: tempConvId, message: assistantPlaceholder }));
      dispatch(startStream({ conversationId: tempConvId, messageId: assistantMessageId }));

      const controller = new AbortController();
      abortControllerRef.current = controller;
      releaseSendPreparation();
      options.onAccepted?.();
      if (isDraft && isActiveSendCurrent()) {
        options.onDraftCreated?.(tempConvId);
      }
      const supportsReasoning = enabledModel.capabilities?.deepThinking ?? false;
      const useReasoning = reasoningEnabled && supportsReasoning;
      let serverConvId: string | null = null;
      let materializedOnce = false;
      let postStreamActionsStarted = false;
      // usage 不再随 done 事件下发（spec 缺口，未来可能扩 RunCompleted.usage）；
      // 当前路径：agent 模式从 GET conversation 拉，普通模式暂留 undefined
      let donePayload: { incomingConvId: string } | null = null;

      const materializeIfNeeded = (incomingConvId?: string) => {
        if (
          !isActiveSendCurrent() ||
          !isDraft ||
          !incomingConvId ||
          materializedOnce
        ) return;

        materializedOnce = true;
        serverConvId = incomingConvId;
        activeConvIdRef.current = incomingConvId;
        // 首页会在物化后重挂输入区，必须先把首轮上下文偏好迁移到服务端会话 ID。
        moveFirstTurnContextState(tempConvId, incomingConvId);
        // 迁移流标记：tempConvId → serverConvId
        dispatch(
          materializeConversation({
            pendingId: tempConvId,
            serverConversation: {
              id: incomingConvId,
              title: content.substring(0, 30),
              model_id: enabledModel.id,
              knowledge_base_ids: options.knowledgeBaseIds ?? [],
              messages: [
                { ...userMessage, chatId: incomingConvId },
                { ...assistantPlaceholder, chatId: incomingConvId },
              ],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          })
        );
        dispatch(migrateStreamConversation(incomingConvId));
        options.onMaterialized?.(incomingConvId);
      };

      const startPostStreamActions = (
        conversationId: string,
        skipTitleGeneration = false,
      ) => {
        if (!isDraft || postStreamActionsStarted || !isSessionCurrent()) return;
        postStreamActionsStarted = true;
        void postStreamActions(
          conversationId,
          dispatch,
          isSessionCurrent,
          skipTitleGeneration,
        );
      };

      const doCompleteStream = (payload: NonNullable<typeof donePayload>) => {
        if (!isActiveSendCurrent()) return;
        const { incomingConvId } = payload;
        materializeIfNeeded(incomingConvId);
        if (!isActiveSendCurrent()) return;

        const effectiveConvId = activeConvIdRef.current;
        if (!effectiveConvId) return;
        const finalConvId = serverConvId ?? incomingConvId ?? effectiveConvId;

        // 从 streamSlice 组装最终 content blocks
        const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
        const rawFinalBlocks = selectFullStreamContentBlocks(streamState);
        const finalBlocks = shouldRecoverReasoningOnlyFinalBlocks({
          runStatus: streamState.currentRun?.status,
          messageMatches: streamState.currentRun?.messageId === assistantMessageId,
        })
          ? recoverReasoningOnlyFinalBlocks(rawFinalBlocks)
          : rawFinalBlocks;
        const hasThinking = finalBlocks.some(b => b.type === 'thinking');

        dispatch(
          updateMessage({
            conversationId: finalConvId,
            messageId: assistantMessageId,
            patch: {
              content: finalBlocks,
              model_id: enabledModel.id,
              timestamp: Date.now(),
              // usage：当前 done 事件不再携带；agent 模式由后续 GET conversation 拉取覆盖
              isReasoningVisible: hasThinking ? false : undefined,
            },
          })
        );
        if (hasFormalTextContent(rawFinalBlocks)) {
          dispatch(requestSuggestedQuestionsObservation({
            conversationId: finalConvId,
            messageIds: [
              assistantMessageId,
              serverMessageIdRef.current,
            ].filter((messageId): messageId is string => Boolean(messageId)),
          }));
        }
        dispatch(
          updateMessage({
            conversationId: finalConvId,
            messageId: userMessageId,
            patch: { status: null },
          })
        );
        dispatch(endStream());
        sendGenerationRef.current += 1;
        activeSendContextRef.current = null;
        abortControllerRef.current = null;
        activeConvIdRef.current = null;
        userMessageIdRef.current = null;
        assistantMessageIdRef.current = null;
        serverMessageIdRef.current = null;
        assistantHasContentRef.current = false;
        options.onStreamEnd?.(finalConvId);
        void hydrateAuthoritativeConversation(finalConvId, isSessionCurrent);
        // 仅新对话的第一轮生成标题，后续轮次不再更新
        if (isDraft) {
          startPostStreamActions(finalConvId, hasEmptyKnowledgeEvidence(rawFinalBlocks));
        } else {
          if (isSessionCurrent()) {
            dispatch(requestConversationListRefresh(finalConvId));
          }
        }
      };

      const streamCallbacks: StreamCallbacks = {
            onReady: ({ messageId: incomingMessageId, conversationId: incomingConvId }) => {
              if (!isActiveSendCurrent()) return;
              // 记录 BE 真实 message_id 供 stop 用（不污染 assistantMessageIdRef，
              // streaming 期渲染匹配仍然依赖本地 placeholder）
              serverMessageIdRef.current = incomingMessageId;
              materializeIfNeeded(incomingConvId);
            },

            onAnswering: (payload) => {
              if (!isActiveSendCurrent() || !activeConvIdRef.current) return;
              // 收到第一个 text delta 且还在推理阶段 → 标记推理结束
              const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
              if (streamState.isStreamingReasoning) {
                dispatch(completeThinkingPhase());
              }
              assistantHasContentRef.current = true;
              dispatch(appendTextDelta({
                blockId: payload.block_id,
                delta: payload.delta,
                runId: payload.run_id,
                stepId: payload.step_id,
              }));
              typewriterRef.current.start(() => {
                if (donePayload && isActiveSendCurrent()) doCompleteStream(donePayload);
              });
            },

            onReasoning: (payload) => {
              if (!isActiveSendCurrent() || !activeConvIdRef.current) return;
              dispatch(appendThinkingDelta({
                blockId: payload.block_id,
                delta: payload.delta,
                runId: payload.run_id,
                stepId: payload.step_id,
              }));
            },

            ...createAgentStreamEventHandlers({
              dispatch,
              isActive: () => Boolean(activeConvIdRef.current) && isActiveSendCurrent(),
              // 优先本地 placeholder（streaming 期 message.id 是它），ref 为 null 时兜底用后端 ID。
              resolveMessageId: ev => assistantMessageIdRef.current ?? ev.message_id,
              setServerMessageId: messageId => {
                if (isActiveSendCurrent()) {
                  serverMessageIdRef.current = messageId;
                }
              },
              resolveConversationId: () => activeConvIdRef.current,
            }),

            onSuggestedQuestionsPending: ev => {
              if (!isActiveSendCurrent() || !activeConvIdRef.current) return;
              const localMessageId = assistantMessageIdRef.current;
              const knownServerMessageId = serverMessageIdRef.current;
              const activeConversation = (
                store.getState() as RootState
              ).conversation.byId[activeConvIdRef.current];
              const hasDirectMessage = activeConversation?.messages.some(
                message => message.id === ev.message_id && message.role === 'assistant',
              );
              if (
                !hasDirectMessage
                && (!localMessageId || knownServerMessageId !== ev.message_id)
              ) {
                return;
              }
              dispatch(applySuggestedQuestionsPending({
                conversationId: activeConvIdRef.current,
                messageId: ev.message_id,
                localMessageId: knownServerMessageId === ev.message_id
                  ? localMessageId
                  : undefined,
                revision: ev.revision,
              }));
            },

            onDone: ({ conversationId: incomingConvId }) => {
              if (!isActiveSendCurrent()) return;
              donePayload = { incomingConvId };
              // 标题生成只依赖后端已完成首轮持久化，不应等待视觉打字机排空。
              // 这里先确保草稿已 materialize，再启动独立于 send generation 的一次性任务。
              materializeIfNeeded(incomingConvId);
              const titleConversationId = serverConvId ?? incomingConvId ?? activeConvIdRef.current;
              if (titleConversationId) {
                const streamState = (
                  store.getState() as {
                    stream: import('@/redux/slices/streamSlice').StreamState;
                  }
                ).stream;
                startPostStreamActions(
                  titleConversationId,
                  hasEmptyKnowledgeEvidence(selectFullStreamContentBlocks(streamState)),
                );
              }
              if (!assistantHasContentRef.current) {
                // 没有文本内容，直接完成（打字机从未启动）
                doCompleteStream(donePayload);
              } else {
                typewriterRef.current.markNetworkDone();
              }
            },

            onError: (message, payload) => {
              if (!isActiveSendCurrent()) return;
              // 没有结构化 payload 的 error 来自 EOF/网络传输层，会进入有限自动续传；
              // 续传成功前不向用户闪现全局错误。
              if (!payload) return;
              // stream_interrupted 是后端确认停止后的终态，由外层 catch 走
              // “生成已停止 + 权威水合”路径，不应短暂闪现错误提示。
              if (isInterruptedStreamSignal(payload)) return;
              const readableMessage = normalizeSendErrorMessage(message);
              dispatch(setGlobalError(readableMessage));
              dispatch(setStreamError({ message: readableMessage, code: payload?.code, data: payload?.data }));
            },
          };

      try {
        await runResumableStream({
          callbacks: streamCallbacks,
          signal: controller.signal,
          openInitial: (wrappedCallbacks, signal) => sendMessageStream(
            {
              model_id: enabledModel.id,
              message: content.trim(),
              conversation_id: tempConvId,
              user_message_id: userMessageId,
              assistant_message_id: assistantMessageId,
              stream: true,
              options: {
                use_reasoning: useReasoning,
                plan_mode: agentModeResolution.planMode,
                task_mode: agentModeResolution.taskMode,
              },
              file_ids: fileIds,
              knowledge_base_ids: options.knowledgeBaseIds,
            },
            wrappedCallbacks,
            signal,
          ),
          openReconnect: async (lastEntryId, wrappedCallbacks, signal) => {
            await reconnectStream(
              activeConvIdRef.current ?? tempConvId,
              lastEntryId,
              wrappedCallbacks,
              signal,
            );
          },
          onPhaseChange: phase => {
            if (!isActiveSendCurrent()) return;
            dispatch(setStreamStatus(phase));
          },
        });
        return;
      } catch (error) {
        typewriterRef.current.stop();
        if (controller.signal.aborted || !isActiveSendCurrent()) return;

        const effectiveConvIdOnError = activeConvIdRef.current ?? tempConvId;
        if (isInterruptedStreamSignal(error)) {
          clearFirstTurnContextState(effectiveConvIdOnError);
          // 用户可能从导航后的 ChatPage 实例发起停止，原始发送实例无法共享
          // AbortController，只会收到后端持久化后的 stream_interrupted 终态。
          // 这代表“生成已停止”，不是“用户消息发送失败”。
          const streamState = (
            store.getState() as {
              stream: import('@/redux/slices/streamSlice').StreamState;
            }
          ).stream;
          const partialBlocks = selectFullStreamContentBlocks(streamState);
          if (partialBlocks.length > 0) {
            dispatch(
              updateMessage({
                conversationId: effectiveConvIdOnError,
                messageId: assistantMessageId,
                patch: { content: partialBlocks },
              })
            );
          }
          if (streamState.currentRun?.status === 'running') {
            dispatch(
              finalizeRun({
                runId: streamState.currentRun.runId,
                status: 'interrupted',
                reason: 'user_cancelled',
                sequence: streamState.currentRun.lastSequence + 1,
              })
            );
          }
          dispatch(
            updateMessage({
              conversationId: effectiveConvIdOnError,
              messageId: userMessageId,
              patch: { status: null },
            })
          );
          dispatch(endStream());
          sendGenerationRef.current += 1;
          activeSendContextRef.current = null;
          abortControllerRef.current = null;
          activeConvIdRef.current = null;
          userMessageIdRef.current = null;
          assistantMessageIdRef.current = null;
          serverMessageIdRef.current = null;
          assistantHasContentRef.current = false;
          dispatch(requestConversationListRefresh(effectiveConvIdOnError));
          void hydrateAuthoritativeConversation(
            effectiveConvIdOnError,
            isSessionCurrent
          );
          // /stop 先完成跨 worker 的 Redis CAS，再由被取消任务异步把
          // Agent run 落为 interrupted。第一次详情读取可能恰好读到 running；
          // 短暂等待后再取一次，避免必须刷新页面才能看到“计划已停止”。
          setTimeout(() => {
            if (!isSessionCurrent()) return;
            void hydrateAuthoritativeConversation(
              effectiveConvIdOnError,
              isSessionCurrent
            );
          }, INTERRUPTED_HYDRATION_RETRY_MS);
          return;
        }

        clearFirstTurnContextState(effectiveConvIdOnError);
        const reconnectRetriesExhausted = isRecoverableStreamError(error);
        const requestAccepted = materializedOnce || Boolean(serverMessageIdRef.current);

        if (!requestAccepted && previousKnowledgeSelection) {
          dispatch(updateConversationKnowledgeBaseIds({
            id: tempConvId,
            knowledgeBaseIds: previousKnowledgeSelection.knowledgeBaseIds,
            updatedAt: previousKnowledgeSelection.updatedAt,
          }));
        }

        if (assistantHasContentRef.current) {
          // 保留已有的 stream content blocks
          const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
          const partialBlocks = reconnectRetriesExhausted
            ? selectFullStreamContentBlocks(streamState)
            : selectStreamContentBlocks(streamState);
          dispatch(
            updateMessage({
              conversationId: effectiveConvIdOnError,
              messageId: assistantMessageId,
              patch: { content: partialBlocks },
            })
          );
        }

        const preservePartialResponse = requestAccepted
          || (reconnectRetriesExhausted && assistantHasContentRef.current);
        if (isDraft && serverConvId && !materializedOnce) {
          materializedOnce = true;
        }
        const effectiveConvId = activeConvIdRef.current ?? tempConvId;
        if (preservePartialResponse) {
          dispatch(
            updateMessage({
              conversationId: effectiveConvId,
              messageId: userMessageId,
              patch: { status: null },
            }),
          );
          if (requestAccepted) {
            void hydrateAuthoritativeConversation(effectiveConvId, isSessionCurrent);
          }
        } else if (materializedOnce || !isDraft) {
          dispatch(
            updateMessage({
              conversationId: effectiveConvId,
              messageId: userMessageId,
              patch: { status: 'failed' },
            })
          );
          dispatch(
            removeMessage({ conversationId: effectiveConvId, messageId: assistantMessageId })
          );
        } else {
          dispatch(removeConversation(tempConvId));
          dispatch(setPendingConversationId(null));
        }
        dispatch(endStream());
        sendGenerationRef.current += 1;
        activeSendContextRef.current = null;
        abortControllerRef.current = null;
        activeConvIdRef.current = null;
        userMessageIdRef.current = null;
        assistantMessageIdRef.current = null;
        serverMessageIdRef.current = null;
        assistantHasContentRef.current = false;
        const message = normalizeSendErrorMessage(error instanceof Error ? error.message : '发送失败，请重试');
        dispatch(setGlobalError(message));
        if (reconnectRetriesExhausted) {
          dispatch(setStreamError({ message }));
        }
      }
    },
    [
      dispatch,
      composerAgentMode,
      hydrateAuthoritativeConversation,
      reasoningEnabled,
      stopStreaming,
      store,
    ]
  );

  const retryMessage = useRetryMessage(sendMessage);

  return { sendMessage, stopStreaming, retryMessage };
}
