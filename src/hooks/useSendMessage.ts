import { useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { useStore } from 'react-redux';
// localStorage 标记已移除，完全依赖后端 stream-status 判断是否重连
import {
  appendMessage,
  materializeConversation,
  removeConversation,
  removeMessage,
  requestConversationListRefresh,
  setAnimatingTitleId,
  setGlobalError,
  setPendingConversationId,
  updateConversationTitle,
  updateMessage,
  upsertConversation,
} from '@/redux/slices/conversationSlice';
import {
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  migrateStreamConversation,
  selectFullStreamContentBlocks,
  selectStreamContentBlocks,
  setStreamError,
  setStreamStatus,
  startStream,
} from '@/redux/slices/streamSlice';
import {
  getConversation,
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
import type { Message, ContentBlock } from '@/types/conversation';
import type { FileAttachment } from '@/lib/utils/fileHelpers';
import { useTypewriter } from './useTypewriter';
import { useRetryMessage } from './useRetryMessage';
import type { RootState } from '@/redux/store';

type SendMessageOptions = {
  conversationId: string | null;
  /** 标记为新对话（即使提供了 conversationId，也当作草稿处理）。用于首页上传文件后发送的场景 */
  isDraft?: boolean;
  /** 本地草稿会话已创建，可用于先进入会话页，不必等待服务端 materialize */
  onDraftCreated?: (draftConversationId: string) => void;
  onMaterialized?: (serverConversationId: string) => void;
  onStreamEnd?: (conversationId: string) => void;
};

const STOP_BEFORE_READY_RETRY_DELAYS_MS = [50, 150] as const;
const STOP_OPERATION_TIMEOUT_MS = 500;

interface SendSessionContext {
  authSessionKey: string;
  conversationEpoch: number;
  generation: number;
}

function selectAuthSessionKey(state: RootState): string | null {
  if (!state.auth.isAuthenticated) return null;
  return state.auth.user?.id ?? state.auth.token ?? null;
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

async function postStreamActions(
  conversationId: string,
  dispatch: ReturnType<typeof useAppDispatch>,
  isSessionCurrent: () => boolean
) {
  if (!isSessionCurrent()) return;
  try {
    const title = await generateChatTitle(conversationId, undefined, { max_length: 20 });
    if (!isSessionCurrent()) return;
    dispatch(updateConversationTitle({ id: conversationId, title }));
    dispatch(setAnimatingTitleId(conversationId));
    setTimeout(() => {
      if (isSessionCurrent()) {
        dispatch(setAnimatingTitleId(null));
      }
    }, title.length * 200 + 1000);
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
  const models = useAppSelector((state) => state.models.models);
  const selectedModelId = useAppSelector((state) => state.models.selectedModelId);
  const reasoningEnabled = useAppSelector((state) => state.conversation.reasoningEnabled);
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

      if (stopInFlightPromiseRef.current) {
        await stopInFlightPromiseRef.current;
      }

      if (abortControllerRef.current) {
        await stopStreaming();
      }

      const enabledModel =
        models.find((model) => model.id === selectedModelId && model.enabled) ??
        models.find((model) => model.enabled);

      if (!enabledModel) {
        dispatch(setGlobalError('没有可用的模型，请先在设置中启用一个模型'));
        return;
      }

      const nextGeneration = sendGenerationRef.current + 1;
      const sendContext = captureSendSessionContext(store.getState(), nextGeneration);
      if (!sendContext) return;
      sendGenerationRef.current = nextGeneration;
      activeSendContextRef.current = sendContext;
      const isSessionCurrent = () => isSendSessionCurrent(store.getState(), sendContext);
      const isActiveSendCurrent = () => (
        sendGenerationRef.current === sendContext.generation &&
        isSessionCurrent()
      );

      const isDraft = options.isDraft ?? (options.conversationId === null);
      const tempConvId = isDraft && !options.conversationId ? uuidv4() : options.conversationId!;

      if (isDraft) {
        dispatch(setPendingConversationId(tempConvId));
        dispatch(
          upsertConversation({
            id: tempConvId,
            title: content.substring(0, 30),
            model_id: enabledModel.id,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          })
        );
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
      if (isDraft && isActiveSendCurrent()) {
        options.onDraftCreated?.(tempConvId);
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
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
        // 迁移流标记：tempConvId → serverConvId
        dispatch(
          materializeConversation({
            pendingId: tempConvId,
            serverConversation: {
              id: incomingConvId,
              title: content.substring(0, 30),
              model_id: enabledModel.id,
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

      const startPostStreamActions = (conversationId: string) => {
        if (!isDraft || postStreamActionsStarted || !isSessionCurrent()) return;
        postStreamActionsStarted = true;
        void postStreamActions(conversationId, dispatch, isSessionCurrent);
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
        // 方案 A 后 endStream 保留 currentRun，仅靠 !!currentRun 判断会误把
        // 任何走过 onRunStarted 的简单问答当 agent 模式触发 GET /conversations/{id}，
        // 可能覆盖流式内容。精确判断当前 message 的 currentRun 且确实调过工具。
        const isAgentMode =
          streamState.currentRun?.messageId === assistantMessageId &&
          (streamState.currentRun?.totalToolCalls ?? 0) > 0;
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
        // 仅新对话的第一轮生成标题，后续轮次不再更新
        if (isDraft) {
          startPostStreamActions(finalConvId);
        } else {
          if (isSessionCurrent()) {
            dispatch(requestConversationListRefresh(finalConvId));
          }
        }

        // Agent 模式：streamSlice 无法完整跟踪多步数据，从 DB 重新拉取完整消息内容
        if (isAgentMode) {
          void (async () => {
            try {
              if (!isSessionCurrent()) return;
              const conv = await getConversation(finalConvId) as any;
              if (!isSessionCurrent()) return;
              const dbMessages = conv?.messages;
              if (!dbMessages) return;

              // 用最后一条 assistant 消息（前后端 ID 不同，不能用 assistantMessageId 匹配）
              const lastAssistant = dbMessages
                .filter((m: any) => m.role === 'assistant' && m.content?.length > 0)
                .at(-1);
              if (lastAssistant?.content) {
                dispatch(
                  updateMessage({
                    conversationId: finalConvId,
                    messageId: assistantMessageId,
                    patch: {
                      id: lastAssistant.id,
                      content: lastAssistant.content,
                      model_id: lastAssistant.model_id ?? enabledModel.id,
                      usage: lastAssistant.usage ?? undefined,
                      isReasoningVisible: lastAssistant.content.some((b: any) => b.type === 'thinking') ? false : undefined,
                    },
                  })
                );
              }
            } catch {
              // 静默处理，刷新页面也能看到正确数据
            }
          })();
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

            onDone: ({ conversationId: incomingConvId }) => {
              if (!isActiveSendCurrent()) return;
              donePayload = { incomingConvId };
              // 标题生成只依赖后端已完成首轮持久化，不应等待视觉打字机排空。
              // 这里先确保草稿已 materialize，再启动独立于 send generation 的一次性任务。
              materializeIfNeeded(incomingConvId);
              const titleConversationId = serverConvId ?? incomingConvId ?? activeConvIdRef.current;
              if (titleConversationId) {
                startPostStreamActions(titleConversationId);
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
              stream: true,
              options: { use_reasoning: useReasoning },
              file_ids: fileIds,
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

        const reconnectRetriesExhausted = isRecoverableStreamError(error);

        const effectiveConvIdOnError = activeConvIdRef.current ?? tempConvId;
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

        const preservePartialResponse = reconnectRetriesExhausted && assistantHasContentRef.current;
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
    [dispatch, models, reasoningEnabled, selectedModelId, stopStreaming, store]
  );

  const retryMessage = useRetryMessage(sendMessage);

  return { sendMessage, stopStreaming, retryMessage };
}
