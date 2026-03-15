import { useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { 
  createChat, 
  clearMessages, 
  setError,
  addMessage,
  startStreaming,
  updateStreamingContent,
  updateStreamingReasoningContent,
  endStreaming,
  setActiveChat,
  setAnimatingTitleChatId,
  updateChatTitle,
  updateServerChatTitle,
  deleteMessage,
  startStreamingReasoning,
  updateMessageReasoning,
  endStreamingReasoning,
  editMessage as editMessageAction,
  setMessageStatus,
  Message,
} from '@/redux/slices/chatSlice';
import { useChatListRefresh } from './useChatListRefresh';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import { sendMessageStream, updateMessageDuration } from '@/lib/api/chat';
import { delayedExecution } from '@/lib/utils/retryHelper';
import { generateChatTitle } from '@/lib/api/title';
import { getPreferredModelId } from '@/lib/models/modelPreference';
import { v4 as uuidv4 } from 'uuid';
import { store } from '@/redux/store';

type ChatActionsOptions = {
  onNewChatCreated?: () => void;
  onSendMessageStart?: () => void;
  onStreamEnd?: (chatId: string) => void;
};

const STREAM_SETTLE_DELAY_MS = 300;
const FOLLOW_UP_REQUEST_DELAY_MS = 200;
const TITLE_GENERATION_DELAY_MS = 300;

const shouldGenerateInitialTitle = (messages: Message[]) => {
  const userMessageCount = messages.filter((message) => message.role === 'user').length;
  const assistantMessageCount = messages.filter((message) => message.role === 'assistant').length;

  return userMessageCount === 1 && assistantMessageCount === 1;
};

export const useChatActions = (options: ChatActionsOptions) => {
  const dispatch = useAppDispatch();
  const { triggerRefresh: refreshChatList } = useChatListRefresh();
  const { 
    models, 
    selectedModelId, 
    activeChatId,
    chats,
    reasoningEnabled,
  } = useAppSelector((state) => ({
    models: state.models.models,
    selectedModelId: state.models.selectedModelId,
    activeChatId: state.chat.activeChatId,
    chats: state.chat.chats,
    reasoningEnabled: state.chat.reasoningEnabled,
  }));

  const pendingQuestionRequestRef = useRef<NodeJS.Timeout | null>(null);

  const getBlockedChatModelMessage = useCallback((chatId: string) => {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat?.model) {
      return null;
    }

    const chatModel = models.find((model) => model.id === chat.model);
    if (!chatModel || chatModel.enabled) {
      return null;
    }

    return '当前会话绑定的模型已不可用，请新建会话后切换到可用模型';
  }, [chats, models]);

  const scheduleStreamEnd = useCallback((chatId: string, delayMs: number = FOLLOW_UP_REQUEST_DELAY_MS) => {
    if (pendingQuestionRequestRef.current) {
      clearTimeout(pendingQuestionRequestRef.current);
    }

    pendingQuestionRequestRef.current = setTimeout(() => {
      pendingQuestionRequestRef.current = null;
      options.onStreamEnd?.(chatId);
    }, delayMs);
  }, [options]);

  const scheduleInitialTitleGeneration = useCallback((chatId: string) => {
    setTimeout(async () => {
      try {
        const generatedTitle = await generateChatTitle(chatId, undefined, { max_length: 20 });
        dispatch(setAnimatingTitleChatId(chatId));
        dispatch(updateChatTitle({ chatId, title: generatedTitle }));
        dispatch(updateServerChatTitle({ chatId, title: generatedTitle }));
        refreshChatList();
        setTimeout(() => dispatch(setAnimatingTitleChatId(null)), generatedTitle.length * 200 + 1000);
      } catch {
      }
    }, TITLE_GENERATION_DELAY_MS);
  }, [dispatch, refreshChatList]);

  const cleanupStreamingFailure = useCallback((chatId: string) => {
    const { streamingMessageId } = store.getState().chat;
    if (streamingMessageId) {
      dispatch(deleteMessage({ chatId, messageId: streamingMessageId }));
    }
    dispatch(endStreamingReasoning());
    dispatch(endStreaming());
  }, [dispatch]);

  /**
   * Creates a new chat session or reuses existing empty chat.
   */
  const newChat = useCallback(() => {
    const modelToUse = getPreferredModelId(models, selectedModelId);
    if (!modelToUse) {
      dispatch(setError('没有可用的模型，无法创建对话'));
      return;
    }

    // 首先检查是否已经存在空对话（没有消息的对话）
    const existingEmptyChat = chats.find(chat => chat.messages.length === 0);
    
    if (existingEmptyChat) {
      // 如果已经有空对话，直接激活它，不创建新的
      if (existingEmptyChat.id !== activeChatId) {
        dispatch(setActiveChat(existingEmptyChat.id));
      }
      // 调用回调，让页面处理UI状态
      options.onNewChatCreated?.();
      return;
    }

    const selectedModel = models.find(m => m.id === modelToUse);
    const providerToUse = selectedModel?.provider;

    try {
      // 只有当没有空对话时，才创建新对话
      dispatch(createChat({ model: modelToUse, provider: providerToUse, title: '' }));
      
      options.onNewChatCreated?.();

    } catch (error) {
      dispatch(setError('创建对话失败，请重试'));
    }
  }, [selectedModelId, models, dispatch, options, chats, activeChatId]);

  /**
   * Clears all messages from the currently active chat.
   */
  const clearCurrentChat = useCallback(() => {
    if (!activeChatId) return;
    dispatch(clearMessages(activeChatId));
  }, [dispatch, activeChatId]);

  const sendMessage = useCallback(async (content: string, files?: FileWithPreview[]) => {
    if ((!content.trim() && (!files || files.length === 0)) || !selectedModelId) return;

    options.onSendMessageStart?.();
    
    let currentActiveChatId = activeChatId;

    if (!currentActiveChatId) {
      // 先检查是否有空对话可以复用
      const existingEmptyChat = chats.find(chat => chat.messages.length === 0);
      
      if (existingEmptyChat) {
        // 复用已存在的空对话
        currentActiveChatId = existingEmptyChat.id;
        // 如果空对话不是当前激活的，激活它
        if (existingEmptyChat.id !== activeChatId) {
          dispatch(setActiveChat(existingEmptyChat.id));
        }
        // 使用短暂延迟，让状态更新生效
        await new Promise(resolve => setTimeout(resolve, 50));
      } else {
        // 没有空对话，创建新的
        const newChatId = uuidv4();
        const selectedModel = models.find(m => m.id === selectedModelId);
        const providerToUse = selectedModel?.provider;
        
        dispatch(
          createChat({
            id: newChatId,
            model: selectedModelId,
            provider: providerToUse,
            title: content.substring(0, 30),
          })
        );
        currentActiveChatId = newChatId;
        // 使用短暂延迟，让状态更新生效
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    if (!currentActiveChatId) {
      dispatch(setError("无法创建或找到对话。"));
      return;
    }

    const blockedChatModelMessage = getBlockedChatModelMessage(currentActiveChatId);
    if (blockedChatModelMessage) {
      dispatch(setError(blockedChatModelMessage));
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: content.trim(),
      status: 'pending',
      timestamp: Date.now(),
      id: uuidv4(),
    };
    
    // 如果当前聊天标题为空，使用用户消息的前30个字符作为临时标题
    const currentChat = chats.find(c => c.id === currentActiveChatId);
    if (currentChat && !currentChat.title) {
      const tempTitle = content.substring(0, 30);
      dispatch(updateChatTitle({ chatId: currentActiveChatId, title: tempTitle }));
    }
    
    dispatch(addMessage({
      chatId: currentActiveChatId,
      message: userMessage
    }));
    
    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    dispatch(startStreaming(currentActiveChatId));

    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    try {
      await sendMessageStream({
        provider: selectedModel.provider,
        model: selectedModel.id,
        message: content.trim(),
        conversation_id: currentActiveChatId,
        stream: true,
        options: {
          use_reasoning: useReasoning,
        }
      },
        (content, done, conversationId, reasoning) => {
          if (!done) {
            dispatch(updateStreamingContent({ chatId: currentActiveChatId, content }));
            if (reasoning) {
              dispatch(updateStreamingReasoningContent(reasoning));
            }
          } else {
            dispatch(updateStreamingContent({ chatId: currentActiveChatId, content }));

            // 保存思考内容到消息的reasoning字段
            setTimeout(() => {
              const stateBeforeEnd = store.getState().chat;
              const messageIdToUpdate = stateBeforeEnd.streamingMessageId;
              const finalChatId = conversationId || currentActiveChatId;

              if (reasoning && reasoning.trim()) {
                if (messageIdToUpdate) {
                  dispatch(updateMessageReasoning({ 
                    chatId: currentActiveChatId, 
                    messageId: messageIdToUpdate, 
                    reasoning: reasoning, 
                    isVisible: true // 默认显示，用户可以手动隐藏
                  }));
                }
                if (!stateBeforeEnd.isThinkingPhaseComplete) {
                  dispatch(endStreamingReasoning());
                }
              }
              
              const finalState = store.getState().chat;
              const { streamingReasoningMessageId, streamingReasoningStartTime, streamingReasoningEndTime } = finalState;

              // 所有收尾工作完成后，最后再结束流式状态
              dispatch(endStreaming());

              // 异步更新消息时长，避免阻塞UI
              if (streamingReasoningMessageId && streamingReasoningStartTime && streamingReasoningEndTime) {
                const duration = streamingReasoningEndTime - streamingReasoningStartTime;
                if (duration > 0) {
                  // 使用延迟执行工具，确保服务端已保存消息
                  delayedExecution(
                    () => updateMessageDuration(currentActiveChatId, streamingReasoningMessageId, duration),
                    3000 // 3秒延迟，给服务端充足的保存时间
                  );
                }
              }
              
              scheduleStreamEnd(finalChatId);

              const finalChat = store.getState().chat.chats.find(c => c.id === finalChatId);
              if (finalChat && shouldGenerateInitialTitle(finalChat.messages)) {
                scheduleInitialTitleGeneration(finalChatId);
              }
            }, STREAM_SETTLE_DELAY_MS);

            if (conversationId && conversationId !== currentActiveChatId) {
              dispatch(setActiveChat(conversationId));
              // 只有在对话ID发生变化时才刷新列表（说明服务端创建了新对话）
              setTimeout(refreshChatList, 1000);
            }
            // 不再在每次消息发送后都刷新列表，避免过度同步
          }
        });
    } catch (error) {
      console.error('发送消息失败:', error);
      dispatch(setError(error instanceof Error ? error.message : '发送消息失败'));
      dispatch(setMessageStatus({ chatId: currentActiveChatId, messageId: userMessage.id, status: 'failed' }));
      cleanupStreamingFailure(currentActiveChatId);
    }
  }, [activeChatId, selectedModelId, models, dispatch, reasoningEnabled, scheduleInitialTitleGeneration, scheduleStreamEnd, refreshChatList, cleanupStreamingFailure, getBlockedChatModelMessage, chats]);


  const retryMessage = useCallback(async (messageId: string) => {
    if (!activeChatId || !selectedModelId) return;

    const blockedChatModelMessage = getBlockedChatModelMessage(activeChatId);
    if (blockedChatModelMessage) {
      dispatch(setError(blockedChatModelMessage));
      return;
    }

    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    const message = chat.messages.find(m => m.id === messageId);
    if (!message) return;

    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    const resendMessage = async (userMessage: Message) => {
      dispatch(setMessageStatus({ chatId: activeChatId, messageId: userMessage.id, status: 'pending' }));
      dispatch(startStreaming(activeChatId));
      if (useReasoning) dispatch(startStreamingReasoning());

      try {
        await sendMessageStream({
          provider: selectedModel.provider,
          model: selectedModel.id,
          message: userMessage.content.trim(),
          conversation_id: activeChatId,
          stream: true,
          options: { use_reasoning: useReasoning }
        },
          (content, done, _conversationId, reasoning) => {
            if (!done) {
              dispatch(updateStreamingContent({ chatId: activeChatId, content }));
              if (reasoning) dispatch(updateStreamingReasoningContent(reasoning));
              return;
            }

            dispatch(updateStreamingContent({ chatId: activeChatId, content }));
            dispatch(setMessageStatus({ chatId: activeChatId, messageId: userMessage.id, status: null }));

            setTimeout(() => {
              if (reasoning && reasoning.trim()) {
                const streamingMessageId = store.getState().chat.streamingMessageId;
                if (streamingMessageId) {
                  dispatch(updateMessageReasoning({
                    chatId: activeChatId,
                    messageId: streamingMessageId,
                    reasoning,
                    isVisible: true,
                  }));
                }
                if (!store.getState().chat.isThinkingPhaseComplete) {
                  dispatch(endStreamingReasoning());
                }
              }
              dispatch(endStreaming());
            }, STREAM_SETTLE_DELAY_MS);

            const currentRetryChatId = store.getState().chat.activeChatId;
            if (currentRetryChatId) {
              scheduleStreamEnd(currentRetryChatId);
            }
          });
      } catch (error) {
        dispatch(setMessageStatus({ chatId: activeChatId, messageId: userMessage.id, status: 'failed' }));
        dispatch(setError('重新生成失败，请检查网络连接'));
        cleanupStreamingFailure(activeChatId);
      }
    };

    if (message.role === 'user') {
      await resendMessage(message);
      return;
    }

    if (message.role === 'assistant') {
      let userMessageIndex = chat.messages.findIndex(m => m.id === messageId) - 1;
      while (userMessageIndex >= 0 && chat.messages[userMessageIndex].role !== 'user') {
        userMessageIndex--;
      }

      if (userMessageIndex < 0) return;
      const userMessage = chat.messages[userMessageIndex];

      dispatch(deleteMessage({ chatId: activeChatId, messageId: message.id }));

      await resendMessage(userMessage);
    }
  }, [activeChatId, selectedModelId, chats, models, dispatch, reasoningEnabled, scheduleStreamEnd, cleanupStreamingFailure, getBlockedChatModelMessage]);


  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!activeChatId || !selectedModelId) return;

    const blockedChatModelMessage = getBlockedChatModelMessage(activeChatId);
    if (blockedChatModelMessage) {
      dispatch(setError(blockedChatModelMessage));
      return;
    }

    dispatch(editMessageAction({ chatId: activeChatId, messageId, content: newContent }));

    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    const messageIndex = chat.messages.findIndex(m => m.id === messageId);
    if (messageIndex < 0) return;

    if (messageIndex < chat.messages.length - 1 && chat.messages[messageIndex + 1].role === 'assistant') {
      const nextMessage = chat.messages[messageIndex + 1];
      dispatch(deleteMessage({ chatId: activeChatId, messageId: nextMessage.id }));
    }

    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    dispatch(setMessageStatus({ chatId: activeChatId, messageId, status: 'pending' }));

    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;
    dispatch(startStreaming(activeChatId));
    if (useReasoning) dispatch(startStreamingReasoning());

    try {
      await sendMessageStream({
        provider: selectedModel.provider,
        model: selectedModel.id,
        message: newContent.trim(),
        conversation_id: activeChatId,
        stream: true,
        options: { use_reasoning: useReasoning }
      },
        (content, done, conversationId, reasoning) => {
          if (!done) {
            dispatch(updateStreamingContent({ chatId: activeChatId, content }));
            if (reasoning) dispatch(updateStreamingReasoningContent(reasoning));
          } else {
            dispatch(updateStreamingContent({ chatId: activeChatId, content: content }));
            dispatch(setMessageStatus({ chatId: activeChatId, messageId, status: null }));

            setTimeout(() => {
              if (reasoning && reasoning.trim()) {
                const streamingMessageId = store.getState().chat.streamingMessageId;
                if (streamingMessageId) {
                  dispatch(updateMessageReasoning({ chatId: activeChatId, messageId: streamingMessageId, reasoning: reasoning, isVisible: true }));
                }
                if (!store.getState().chat.isThinkingPhaseComplete) dispatch(endStreamingReasoning());
              }
              dispatch(endStreaming());
            }, STREAM_SETTLE_DELAY_MS);

            const currentEditedChatId = store.getState().chat.activeChatId;
            if (currentEditedChatId) {
              scheduleStreamEnd(currentEditedChatId);
            }
          }
        });
    } catch (error) {
      console.error('发送编辑后的消息失败:', error);
      dispatch(setMessageStatus({ chatId: activeChatId, messageId, status: 'failed' }));
      dispatch(setError('发送编辑后的消息失败，请重试'));
      cleanupStreamingFailure(activeChatId);
    }
  }, [activeChatId, selectedModelId, chats, models, dispatch, reasoningEnabled, scheduleStreamEnd, cleanupStreamingFailure, getBlockedChatModelMessage]);

  return { newChat, clearCurrentChat, sendMessage, retryMessage, editMessage };
}; 
