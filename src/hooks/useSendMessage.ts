import { useCallback, useRef } from 'react';
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
  agentLimitReached,
  agentStepEnd,
  agentStepStart,
  agentToolCallComplete,
  agentToolCallStart,
  appendTextDelta,
  appendThinkingDelta,
  completeSearch,
  completeThinkingPhase,
  completeUrlRead,
  endStream,
  migrateStreamConversation,
  selectFullStreamContentBlocks,
  selectStreamContentBlocks,
  startSearch,
  startStream,
  startUrlRead,
} from '@/redux/slices/streamSlice';
import { sendMessageStream, getConversation, fetchSuggestedQuestions as fetchSuggestApi } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import type { Message, ContentBlock, Usage } from '@/types/conversation';
import type { FileAttachment } from '@/lib/utils/fileHelpers';
import { useTypewriter } from './useTypewriter';
import { useRetryMessage } from './useRetryMessage';

type SendMessageOptions = {
  conversationId: string | null;
  /** 标记为新对话（即使提供了 conversationId，也当作草稿处理）。用于首页上传文件后发送的场景 */
  isDraft?: boolean;
  onMaterialized?: (serverConversationId: string) => void;
  onStreamEnd?: (conversationId: string) => void;
};

async function postStreamActions(conversationId: string, dispatch: ReturnType<typeof useAppDispatch>) {
  try {
    const title = await generateChatTitle(conversationId, undefined, { max_length: 20 });
    dispatch(updateConversationTitle({ id: conversationId, title }));
    dispatch(setAnimatingTitleId(conversationId));
    setTimeout(() => dispatch(setAnimatingTitleId(null)), title.length * 200 + 1000);
  } catch {
    // ignore title failures
  }
  dispatch(requestConversationListRefresh());
}

export function useSendMessage() {
  const dispatch = useAppDispatch();
  const store = useStore();
  const models = useAppSelector((state) => state.models.models);
  const selectedModelId = useAppSelector((state) => state.models.selectedModelId);
  const reasoningEnabled = useAppSelector((state) => state.conversation.reasoningEnabled);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const userMessageIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const assistantHasContentRef = useRef(false);
  const typewriter = useTypewriter();

  // 获取当前流式会话 ID：优先用 ref（sendMessage 设置），fallback 到 Redux（reconnect 设置）
  const getStreamingConvId = useCallback(() => {
    return activeConvIdRef.current
      || (store.getState() as { stream: { conversationId: string | null } }).stream.conversationId;
  }, [store]);

  const stopStreaming = useCallback(async () => {
    const convId = getStreamingConvId();
    const userMsgId = userMessageIdRef.current;
    const assistantMsgId = assistantMessageIdRef.current;

    typewriter.stop();

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

    // 通知后端取消后台任务，传 messageId 防止误杀新一轮的流
    if (convId) {
      const streamState = (store.getState() as { stream: { messageId: string | null } }).stream;
      const { stopStream } = await import('@/lib/api/chat');
      await stopStream(convId, streamState.messageId || assistantMsgId || undefined);
    }

    dispatch(endStream());
    activeConvIdRef.current = null;
    userMessageIdRef.current = null;
    assistantMessageIdRef.current = null;
    assistantHasContentRef.current = false;
  }, [dispatch, store, getStreamingConvId]);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions, attachments?: FileAttachment[]) => {
      if (!content.trim() && (!attachments || attachments.length === 0)) return;

      if (abortControllerRef.current) {
        stopStreaming();
      }

      const enabledModel =
        models.find((model) => model.id === selectedModelId && model.enabled) ??
        models.find((model) => model.enabled);

      if (!enabledModel) {
        dispatch(setGlobalError('没有可用的模型，请先在设置中启用一个模型'));
        return;
      }

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
      const supportsReasoning = enabledModel.capabilities?.deepThinking ?? false;
      const useReasoning = reasoningEnabled && supportsReasoning;
      let serverConvId: string | null = null;
      let materializedOnce = false;
      let donePayload: { incomingConvId: string; usage: Usage | null } | null = null;

      const materializeIfNeeded = (incomingConvId?: string) => {
        if (!isDraft || !incomingConvId || materializedOnce) return;

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

      const doCompleteStream = (payload: NonNullable<typeof donePayload>) => {
        const { incomingConvId, usage } = payload;
        materializeIfNeeded(incomingConvId);

        const effectiveConvId = activeConvIdRef.current;
        if (!effectiveConvId) return;
        const finalConvId = serverConvId ?? incomingConvId ?? effectiveConvId;

        // 从 streamSlice 组装最终 content blocks
        const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
        const isAgentMode = streamState.agentSteps.length > 0;
        const finalBlocks = selectFullStreamContentBlocks(streamState);
        const hasThinking = finalBlocks.some(b => b.type === 'thinking');

        dispatch(
          updateMessage({
            conversationId: finalConvId,
            messageId: assistantMessageId,
            patch: {
              content: finalBlocks,
              model_id: enabledModel.id,
              usage: usage ?? undefined,
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
        abortControllerRef.current = null;
        activeConvIdRef.current = null;
        userMessageIdRef.current = null;
        assistantMessageIdRef.current = null;
        assistantHasContentRef.current = false;
        options.onStreamEnd?.(finalConvId);
        // 仅新对话的第一轮生成标题，后续轮次不再更新
        if (isDraft) {
          void postStreamActions(finalConvId, dispatch);
        } else {
          dispatch(requestConversationListRefresh());
        }

        // Agent 模式：streamSlice 无法完整跟踪多步数据，从 DB 重新拉取完整消息内容
        // 同时直接调 API 生成推荐问题（绕过 onStreamEnd 的闭包过期问题）
        if (isAgentMode) {
          void (async () => {
            try {
              const conv = await getConversation(finalConvId) as any;
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
                      content: lastAssistant.content,
                      usage: lastAssistant.usage ?? undefined,
                      isReasoningVisible: lastAssistant.content.some((b: any) => b.type === 'thinking') ? false : undefined,
                    },
                  })
                );
              }

              // 直接调 API 生成推荐问题
              const { questions } = await fetchSuggestApi(finalConvId, {});
              if (questions?.length > 0 && lastAssistant) {
                dispatch(
                  updateMessage({
                    conversationId: finalConvId,
                    messageId: assistantMessageId,
                    patch: { suggestedQuestions: questions },
                  })
                );
              }
            } catch {
              // 静默处理，刷新页面也能看到正确数据
            }
          })();
        }
      };

      try {
        await sendMessageStream(
          {
            model_id: enabledModel.id,
            message: content.trim(),
            conversation_id: tempConvId,
            stream: true,
            options: { use_reasoning: useReasoning },
            file_ids: fileIds,
          },
          {
            onReady: ({ conversationId: incomingConvId }) => {
              materializeIfNeeded(incomingConvId);
            },

            onTextDelta: (delta, blockId) => {
              if (!activeConvIdRef.current) return;
              // 收到第一个 text delta 且还在推理阶段 → 标记推理结束
              const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
              if (streamState.isStreamingReasoning) {
                dispatch(completeThinkingPhase());
              }
              assistantHasContentRef.current = true;
              dispatch(appendTextDelta({ blockId, delta }));
              typewriter.start(() => {
                if (donePayload) doCompleteStream(donePayload);
              });
            },

            onThinkingDelta: (delta, blockId) => {
              if (!activeConvIdRef.current) return;
              dispatch(appendThinkingDelta({ blockId, delta }));
            },

            onSearchStart: (query, _meta, toolCallId) => {
              if (!activeConvIdRef.current) return;
              dispatch(startSearch({ query }));
              if (toolCallId) {
                dispatch(agentToolCallStart({ toolCallId, toolName: 'web_search', query }));
              }
            },

            onSearchComplete: (sources, _meta, toolCallId) => {
              if (!activeConvIdRef.current) return;
              dispatch(completeSearch({ sources }));
              if (toolCallId) {
                dispatch(agentToolCallComplete({ toolCallId, status: 'completed' }));
              }
            },

            onUrlReadStart: (url: string, _source: string, toolCallId?: string) => {
              if (!activeConvIdRef.current) return;
              dispatch(startUrlRead({ url }));
              if (toolCallId) {
                dispatch(agentToolCallStart({ toolCallId, toolName: 'url_read', query: url }));
              }
            },

            onUrlReadComplete: (result: { url: string; title?: string; favicon?: string; status: string }, toolCallId?: string) => {
              if (!activeConvIdRef.current) return;
              dispatch(completeUrlRead(result));
              if (toolCallId) {
                dispatch(agentToolCallComplete({ toolCallId, status: result.status === 'success' ? 'completed' : 'failed' }));
              }
            },

            onAgentStepStart: (step, maxSteps, toolCount) => {
              if (!activeConvIdRef.current) return;
              dispatch(agentStepStart({ step, maxSteps, toolCount }));
            },

            onAgentStepEnd: (step) => {
              if (!activeConvIdRef.current) return;
              dispatch(agentStepEnd({ step }));
            },

            onAgentLimitReached: () => {
              if (!activeConvIdRef.current) return;
              dispatch(agentLimitReached());
            },

            onDone: (_messageId, incomingConvId, usage) => {
              donePayload = { incomingConvId, usage };
              if (!assistantHasContentRef.current) {
                // 没有文本内容，直接完成（打字机从未启动）
                doCompleteStream(donePayload);
              } else {
                typewriter.markNetworkDone();
              }
            },

            // TODO: 遗漏1 — 网络抖动自动重连。当前网络断开直接报错，
            // 后续加 retry 计数器，失败 N 次内自动调 reconnectStream，超出则报错
            onError: (message) => {
              dispatch(setGlobalError(message));
            },
          },
          controller.signal
        );
      } catch (error) {
        typewriter.stop();
        if (controller.signal.aborted) return;

        const effectiveConvIdOnError = activeConvIdRef.current ?? tempConvId;
        if ((materializedOnce || !isDraft) && assistantHasContentRef.current) {
          // 保留已有的 stream content blocks
          const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
          const partialBlocks = selectStreamContentBlocks(streamState);
          dispatch(
            updateMessage({
              conversationId: effectiveConvIdOnError,
              messageId: assistantMessageId,
              patch: { content: partialBlocks },
            })
          );
        }

        if (isDraft && serverConvId && !materializedOnce) {
          materializedOnce = true;
        }
        const effectiveConvId = activeConvIdRef.current ?? tempConvId;
        if (materializedOnce || !isDraft) {
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
        abortControllerRef.current = null;
        activeConvIdRef.current = null;
        userMessageIdRef.current = null;
        assistantMessageIdRef.current = null;
        assistantHasContentRef.current = false;
        const message = error instanceof Error ? error.message : '发送失败，请重试';
        dispatch(setGlobalError(message));
      }
    },
    [dispatch, models, reasoningEnabled, selectedModelId, stopStreaming, store]
  );

  const retryMessage = useRetryMessage(sendMessage);

  return { sendMessage, stopStreaming, retryMessage };
}
