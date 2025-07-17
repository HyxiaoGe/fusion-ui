import { useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { 
  createChat, 
  clearMessages, 
  clearChatFunctionCallOutput, 
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
import { v4 as uuidv4 } from 'uuid';
import { store } from '@/redux/store';
import { fetchEnhancedContext } from '@/redux/slices/searchSlice';

type ChatActionsOptions = {
  onNewChatCreated?: () => void;
  onSendMessageStart?: () => void;
  onStreamEnd?: (chatId: string) => void;
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
    webSearchEnabled,
    functionCallEnabled,
    searchEnabled,
    contextEnhancementEnabled,
  } = useAppSelector((state) => ({
    models: state.models.models,
    selectedModelId: state.models.selectedModelId,
    activeChatId: state.chat.activeChatId,
    chats: state.chat.chats,
    reasoningEnabled: state.chat.reasoningEnabled,
    webSearchEnabled: state.chat.webSearchEnabled,
    functionCallEnabled: state.chat.functionCallEnabled,
    searchEnabled: state.search.searchEnabled,
    contextEnhancementEnabled: state.search.contextEnhancementEnabled,
  }));

  const pendingQuestionRequestRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Creates a new chat session.
   */
  const newChat = useCallback(() => {
    const modelToUse = selectedModelId || (models.length > 0 ? models[0].id : null);
    if (!modelToUse) {
      console.error('没有可用的模型，无法创建对话');
      dispatch(setError('没有可用的模型，无法创建对话'));
      return;
    }

    const selectedModel = models.find(m => m.id === modelToUse);
    const providerToUse = selectedModel?.provider;

    try {
      // 创建新对话时暂时不设置标题，等用户输入消息后再设置
      dispatch(createChat({ model: modelToUse, provider: providerToUse, title: '' }));
      
      setTimeout(() => {
        refreshChatList();
      }, 100);
      
      options.onNewChatCreated?.();

    } catch (error) {
      console.error('创建对话失败:', error);
      dispatch(setError('创建对话失败，请重试'));
    }
  }, [selectedModelId, models, dispatch, refreshChatList, options]);

  /**
   * Clears all messages from the currently active chat.
   */
  const clearCurrentChat = useCallback(() => {
    if (!activeChatId) return;
    dispatch(clearMessages(activeChatId));
    dispatch(clearChatFunctionCallOutput({ chatId: activeChatId }));
  }, [dispatch, activeChatId]);

  const sendMessage = useCallback(async (content: string, files?: FileWithPreview[]) => {
    if ((!content.trim() && (!files || files.length === 0)) || !selectedModelId) return;

    options.onSendMessageStart?.();
    
    let currentActiveChatId = activeChatId;

    if (!currentActiveChatId) {
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
    }
    
    if (!currentActiveChatId) {
      dispatch(setError("无法创建或找到对话。"));
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
    
    if (searchEnabled && contextEnhancementEnabled) {
      dispatch(fetchEnhancedContext({ query: content, conversationId: currentActiveChatId }));
    }

    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;
    const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
    const useWebSearch = webSearchEnabled && supportsWebSearch;
    const supportsFunctionCall = selectedModel.capabilities?.functionCalling || false;
    const useFunctionCall = functionCallEnabled && supportsFunctionCall;

    try {
      await sendMessageStream({
        provider: selectedModel.provider,
        model: selectedModel.id,
        message: content.trim(),
        conversation_id: currentActiveChatId,
        stream: true,
        options: {
          use_reasoning: useReasoning,
          use_web_search: useWebSearch,
          use_function_call: useFunctionCall
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
            }, 1000);

            if (conversationId && conversationId !== currentActiveChatId) {
              dispatch(setActiveChat(conversationId));
              setTimeout(refreshChatList, 1000);
            } else {
              setTimeout(refreshChatList, 1000);
            }
            
            if (pendingQuestionRequestRef.current) clearTimeout(pendingQuestionRequestRef.current);
            pendingQuestionRequestRef.current = setTimeout(() => {
              pendingQuestionRequestRef.current = null;
              const finalChatId = conversationId || currentActiveChatId;
              if (finalChatId) {
                options.onStreamEnd?.(finalChatId);
              }
            }, 1500);
          }

          const finalChatId = conversationId || currentActiveChatId;
          const chat = store.getState().chat.chats.find(c => c.id === finalChatId);
          if (done && chat && chat.messages.length === 2) {
            setTimeout(async () => {
              try {
                const generatedTitle = await generateChatTitle(finalChatId, undefined, { max_length: 20 });
                dispatch(setAnimatingTitleChatId(finalChatId));
                dispatch(updateChatTitle({ chatId: finalChatId, title: generatedTitle }));
                dispatch(updateServerChatTitle({ chatId: finalChatId, title: generatedTitle }));
                refreshChatList();
                setTimeout(() => dispatch(setAnimatingTitleChatId(null)), generatedTitle.length * 200 + 1000);
              } catch (error) {
                console.error('生成标题失败:', error);
              }
            }, 1000);
          }
        });
    } catch (error) {
      console.error('发送消息失败:', error);
      dispatch(setError(error instanceof Error ? error.message : '发送消息失败'));
      dispatch(endStreaming());
      
      const chat = store.getState().chat.chats.find(c => c.id === currentActiveChatId);
      if (chat && chat.messages.length > 0) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        if (lastMessage.role === 'user') {
          dispatch(setMessageStatus({ chatId: currentActiveChatId, messageId: lastMessage.id, status: 'failed' }));
        }
      }
    }
  }, [activeChatId, selectedModelId, models, dispatch, searchEnabled, contextEnhancementEnabled, reasoningEnabled, webSearchEnabled, functionCallEnabled, options, refreshChatList]);


  const retryMessage = useCallback(async (messageId: string) => {
    if (!activeChatId || !selectedModelId) return;

    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    const message = chat.messages.find(m => m.id === messageId);
    if (!message) return;

    if (message.role === 'assistant') {
      let userMessageIndex = chat.messages.findIndex(m => m.id === messageId) - 1;
      while (userMessageIndex >= 0 && chat.messages[userMessageIndex].role !== 'user') {
        userMessageIndex--;
      }

      if (userMessageIndex < 0) return;
      const userMessage = chat.messages[userMessageIndex];

      dispatch(deleteMessage({ chatId: activeChatId, messageId: message.id }));

      const selectedModel = models.find(m => m.id === selectedModelId);
      if (!selectedModel) {
        dispatch(setError('找不到选中的模型信息'));
        return;
      }

      const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
      const useReasoning = reasoningEnabled && supportsReasoning;
      const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
      const useWebSearch = webSearchEnabled && supportsWebSearch;
      const useFunctionCall = selectedModel.capabilities?.functionCalling || false;

      dispatch(startStreaming(activeChatId));
      if (useReasoning) dispatch(startStreamingReasoning());

      try {
        await sendMessageStream({
          provider: selectedModel.provider,
          model: selectedModel.id,
          message: userMessage.content.trim(),
          conversation_id: activeChatId,
          stream: true,
          options: { use_reasoning: useReasoning, use_web_search: useWebSearch, use_function_call: useFunctionCall }
        },
          (content, done, conversationId, reasoning) => {
            if (!done) {
              dispatch(updateStreamingContent({ chatId: activeChatId, content }));
              if (reasoning) dispatch(updateStreamingReasoningContent(reasoning));
            } else {
              dispatch(updateStreamingContent({ chatId: activeChatId, content: content }));

              setTimeout(() => {
                if (reasoning && reasoning.trim()) {
                  const streamingMessageId = store.getState().chat.streamingMessageId;
                  if (streamingMessageId) {
                    dispatch(updateMessageReasoning({ chatId: activeChatId, messageId: streamingMessageId, reasoning: reasoning, isVisible: true }));
                  }
                  if (!store.getState().chat.isThinkingPhaseComplete) dispatch(endStreamingReasoning());
                }
                dispatch(endStreaming());
              }, 1000);

              if (pendingQuestionRequestRef.current) clearTimeout(pendingQuestionRequestRef.current);
              pendingQuestionRequestRef.current = setTimeout(() => {
                pendingQuestionRequestRef.current = null;
                const currentActiveChatId = store.getState().chat.activeChatId;
                if (currentActiveChatId) {
                  options.onStreamEnd?.(currentActiveChatId);
                }
              }, 1500);
            }
          });
      } catch (error) {
        console.error('重新生成回复失败:', error);
        dispatch(setError('重新生成失败，请检查网络连接'));
        dispatch(endStreamingReasoning());
        dispatch(endStreaming());
      }
    }
  }, [activeChatId, selectedModelId, chats, models, dispatch, reasoningEnabled, webSearchEnabled, options]);


  const editMessage = useCallback(async (messageId: string, newContent: string) => {
    if (!activeChatId || !selectedModelId) return;

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
    const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
    const useWebSearch = webSearchEnabled && supportsWebSearch;
    const useFunctionCall = selectedModel.capabilities?.functionCalling || false;

    dispatch(startStreaming(activeChatId));
    if (useReasoning) dispatch(startStreamingReasoning());

    try {
      await sendMessageStream({
        provider: selectedModel.provider,
        model: selectedModel.id,
        message: newContent.trim(),
        conversation_id: activeChatId,
        stream: true,
        options: { use_reasoning: useReasoning, use_web_search: useWebSearch, use_function_call: useFunctionCall }
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
            }, 1000);

            if (pendingQuestionRequestRef.current) clearTimeout(pendingQuestionRequestRef.current);
            pendingQuestionRequestRef.current = setTimeout(() => {
              pendingQuestionRequestRef.current = null;
              const currentActiveChatId = store.getState().chat.activeChatId;
              if (currentActiveChatId) {
                options.onStreamEnd?.(currentActiveChatId);
              }
            }, 1500);
          }
        });
    } catch (error) {
      console.error('发送编辑后的消息失败:', error);
      dispatch(setMessageStatus({ chatId: activeChatId, messageId, status: 'failed' }));
      dispatch(setError('发送编辑后的消息失败，请重试'));
      dispatch(endStreamingReasoning());
      dispatch(endStreaming());
    }
  }, [activeChatId, selectedModelId, chats, models, dispatch, reasoningEnabled, webSearchEnabled, functionCallEnabled, options]);

  return { newChat, clearCurrentChat, sendMessage, retryMessage, editMessage };
}; 