import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
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
  completeThinkingPhase,
  endStream,
  migrateStreamConversation,
  startStream,
  startStreamingReasoning,
  updateStreamContent,
  updateStreamReasoning,
} from '@/redux/slices/streamSlice';
import { sendMessageStream } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import type { Message } from '@/types/conversation';

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
  const models = useAppSelector((state) => state.models.models);
  const selectedModelId = useAppSelector((state) => state.models.selectedModelId);
  const reasoningEnabled = useAppSelector((state) => state.conversation.reasoningEnabled);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const userMessageIdRef = useRef<string | null>(null);
  const assistantMessageIdRef = useRef<string | null>(null);
  const assistantHasContentRef = useRef(false);

  const stopStreaming = useCallback(() => {
    const convId = activeConvIdRef.current;
    const userMsgId = userMessageIdRef.current;
    const assistantMsgId = assistantMessageIdRef.current;
    const hasContent = assistantHasContentRef.current;

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

    if (convId && assistantMsgId && !hasContent) {
      dispatch(removeMessage({ conversationId: convId, messageId: assistantMsgId }));
    }

    dispatch(endStream());
    activeConvIdRef.current = null;
    userMessageIdRef.current = null;
    assistantMessageIdRef.current = null;
    assistantHasContentRef.current = false;
  }, [dispatch]);

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
            model: enabledModel.id,
            provider: enabledModel.provider,
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
        content: content.trim(),
        status: 'pending',
        timestamp: Date.now(),
      };

      const assistantPlaceholder: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
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
      let localContent = '';
      let localReasoning = '';

      try {
        await sendMessageStream(
          {
            provider: enabledModel.provider,
            model: enabledModel.id,
            message: content.trim(),
            conversation_id: isDraft ? undefined : options.conversationId!,
            stream: true,
            options: { use_reasoning: useReasoning },
          },
          {
            onContent: (delta) => {
              localContent += delta;
              const effectiveConvId = activeConvIdRef.current;
              if (!effectiveConvId) return;
              assistantHasContentRef.current = assistantHasContentRef.current || Boolean(delta);
              dispatch(updateStreamContent(localContent));
              dispatch(
                updateMessage({
                  conversationId: effectiveConvId,
                  messageId: assistantMessageId,
                  patch: { content: localContent },
                })
              );
            },
            onReasoning: (delta) => {
              localReasoning += delta;
              const effectiveConvId = activeConvIdRef.current;
              if (!effectiveConvId) return;
              dispatch(startStreamingReasoning());
              dispatch(updateStreamReasoning(localReasoning));
            },
            onDone: (messageId, incomingConvId, accumulatedContent, accumulatedReasoning) => {
              if (isDraft && incomingConvId && !materializedOnce) {
                materializedOnce = true;
                serverConvId = incomingConvId;
                activeConvIdRef.current = incomingConvId;
                dispatch(
                  materializeConversation({
                    pendingId: tempConvId,
                    serverConversation: {
                      id: incomingConvId,
                      title: content.substring(0, 30),
                      model: enabledModel.id,
                      provider: enabledModel.provider,
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
              }

              const effectiveConvId = activeConvIdRef.current;
              if (!effectiveConvId) return;

              const finalConvId = serverConvId ?? incomingConvId ?? effectiveConvId;
              if (accumulatedReasoning.trim()) {
                dispatch(completeThinkingPhase());
              }
              dispatch(
                updateMessage({
                  conversationId: finalConvId,
                  messageId: messageId || assistantMessageId,
                  patch: {
                    content: accumulatedContent,
                    reasoning: accumulatedReasoning.trim() ? accumulatedReasoning : null,
                    ...(accumulatedReasoning.trim()
                      ? {
                          isReasoningVisible: false,
                          reasoningEndTime: Date.now(),
                        }
                      : {}),
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
            },
            onError: (message) => {
              dispatch(setGlobalError(message));
            },
          },
          controller.signal
        );
      } catch (error) {
        if (controller.signal.aborted) return;

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
    [dispatch, models, reasoningEnabled, selectedModelId, stopStreaming]
  );

  return { sendMessage, stopStreaming };
}
