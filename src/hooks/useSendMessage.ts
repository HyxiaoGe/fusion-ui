import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { useStore } from 'react-redux';
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
  advanceTypewriter,
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  migrateStreamConversation,
  selectFullStreamContentBlocks,
  selectStreamContentBlocks,
  startStream,
} from '@/redux/slices/streamSlice';
import { sendMessageStream } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import type { Message, Usage } from '@/types/conversation';

// 打字机参数
const TYPEWRITER_CHARS_PER_TICK = 4;
const TYPEWRITER_TICK_MS = 30;

type SendMessageOptions = {
  conversationId: string | null;
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
  const typewriterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStreaming = useCallback(() => {
    const convId = activeConvIdRef.current;
    const userMsgId = userMessageIdRef.current;
    const assistantMsgId = assistantMessageIdRef.current;
    const hasContent = assistantHasContentRef.current;

    if (typewriterIntervalRef.current !== null) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }

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

    if (convId && assistantMsgId) {
      if (hasContent) {
        // 把流里已有的内容写回消息，防止 endStream 清空后丢失
        const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
        const partialBlocks = selectFullStreamContentBlocks(streamState);
        dispatch(updateMessage({
          conversationId: convId,
          messageId: assistantMsgId,
          patch: { content: partialBlocks },
        }));
      } else {
        dispatch(removeMessage({ conversationId: convId, messageId: assistantMsgId }));
      }
    }

    dispatch(endStream());
    activeConvIdRef.current = null;
    userMessageIdRef.current = null;
    assistantMessageIdRef.current = null;
    assistantHasContentRef.current = false;
  }, [dispatch, store]);

  const sendMessage = useCallback(
    async (content: string, options: SendMessageOptions, files?: File[]) => {
      if (!content.trim() && (!files || files.length === 0)) return;

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

      const isDraft = options.conversationId === null;
      const tempConvId = isDraft ? uuidv4() : options.conversationId!;

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

      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: [{ type: 'text', id: `blk_${userMessageId.slice(0, 12)}`, text: content.trim() }],
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
      let networkDone = false;
      let donePayload: { incomingConvId: string; usage: Usage | null } | null = null;

      const materializeIfNeeded = (incomingConvId?: string) => {
        if (!isDraft || !incomingConvId || materializedOnce) return;

        materializedOnce = true;
        serverConvId = incomingConvId;
        activeConvIdRef.current = incomingConvId;
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
        void postStreamActions(finalConvId, dispatch);
      };

      // 打字机：通过 dispatch advanceTypewriter 推进 displayedTextLength，
      // selectStreamContentBlocks 会按该长度截断 text blocks
      const startTypewriter = () => {
        if (typewriterIntervalRef.current !== null) return;

        typewriterIntervalRef.current = setInterval(() => {
          const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
          if (streamState.displayedTextLength < streamState.totalTextLength) {
            dispatch(advanceTypewriter(TYPEWRITER_CHARS_PER_TICK));
          }

          const updatedState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
          if (networkDone && updatedState.displayedTextLength >= updatedState.totalTextLength && donePayload) {
            clearInterval(typewriterIntervalRef.current!);
            typewriterIntervalRef.current = null;
            doCompleteStream(donePayload);
          }
        }, TYPEWRITER_TICK_MS);
      };

      try {
        await sendMessageStream(
          {
            model_id: enabledModel.id,
            message: content.trim(),
            conversation_id: isDraft ? undefined : options.conversationId!,
            stream: true,
            options: { use_reasoning: useReasoning },
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
              startTypewriter();
            },

            onThinkingDelta: (delta, blockId) => {
              if (!activeConvIdRef.current) return;
              dispatch(appendThinkingDelta({ blockId, delta }));
            },

            onDone: (_messageId, incomingConvId, usage) => {
              networkDone = true;
              donePayload = { incomingConvId, usage };

              const streamState = (store.getState() as { stream: import('@/redux/slices/streamSlice').StreamState }).stream;
              if (streamState.displayedTextLength >= streamState.totalTextLength) {
                if (typewriterIntervalRef.current !== null) {
                  clearInterval(typewriterIntervalRef.current);
                  typewriterIntervalRef.current = null;
                }
                doCompleteStream(donePayload);
              }
            },

            onError: (message) => {
              dispatch(setGlobalError(message));
            },
          },
          controller.signal
        );
      } catch (error) {
        if (typewriterIntervalRef.current !== null) {
          clearInterval(typewriterIntervalRef.current);
          typewriterIntervalRef.current = null;
        }
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

  const retryMessage = useCallback(
    async (messageId: string, conversationId: string) => {
      const state = store.getState() as { conversation: { byId: Record<string, import('@/types/conversation').Conversation> } };
      const conversation = state.conversation.byId[conversationId];
      if (!conversation) return;

      const messages = conversation.messages;
      const targetIndex = messages.findIndex((m) => m.id === messageId);
      if (targetIndex === -1) return;

      const targetMsg = messages[targetIndex];

      if (targetMsg.role === 'assistant') {
        // 重新生成：向上找 user 消息，删除 assistant 后重发
        let userMessage: import('@/types/conversation').Message | null = null;
        for (let i = targetIndex - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            userMessage = messages[i];
            break;
          }
        }
        if (!userMessage) return;

        dispatch(removeMessage({ conversationId, messageId }));

        const userText = userMessage.content
          .filter((b): b is import('@/types/conversation').TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');

        if (userText) {
          await sendMessage(userText, { conversationId });
        }
      } else if (targetMsg.role === 'user') {
        // 重新发送用户消息：删除该 user 消息及其后面紧跟的 assistant 消息，然后重发
        const nextMsg = messages[targetIndex + 1];
        if (nextMsg && nextMsg.role === 'assistant') {
          dispatch(removeMessage({ conversationId, messageId: nextMsg.id }));
        }
        dispatch(removeMessage({ conversationId, messageId }));

        const userText = targetMsg.content
          .filter((b): b is import('@/types/conversation').TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');

        if (userText) {
          await sendMessage(userText, { conversationId });
        }
      }
    },
    [dispatch, sendMessage, store]
  );

  return { sendMessage, stopStreaming, retryMessage };
}
