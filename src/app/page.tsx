'use client';

import ChatInput from '@/components/chat/ChatInput';
import { 
  ChatMessageListLazy, 
  ChatSidebarLazy, 
  ModelSelectorLazy, 
  RelatedDiscussionsLazy, 
  HomePageLazy,
  FunctionCallDisplayLazy
} from '@/components/lazy/LazyComponents';
import MainLayout from '@/components/layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { sendMessageStream, fetchSuggestedQuestions  } from '@/lib/api/chat';
import { generateChatTitle } from '@/lib/api/title';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  addMessage,
  clearMessages,
  createChat,
  deleteMessage,
  editMessage,
  endStreaming,
  endStreamingReasoning,
  setActiveChat,
  setError,
  setMessageStatus,
  startStreaming,
  startStreamingReasoning,
  updateChatTitle,
  updateServerChatTitle,
  updateMessageReasoning,
  updateStreamingContent,
  updateStreamingReasoningContent,
  setAnimatingTitleChatId,
  clearFunctionCallData,
  resetFunctionCallProgress,
  clearChatFunctionCallOutput,
  Message,
  Chat,
} from '@/redux/slices/chatSlice';
import { fetchEnhancedContext } from '@/redux/slices/searchSlice';
import { store } from '@/redux/store';
import { HomeIcon, SettingsIcon } from 'lucide-react';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import FunctionCallDisplay from '@/components/chat/FunctionCallDisplay';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { useChatListRefresh } from '@/hooks/useChatListRefresh';
import { useToast } from '@/components/ui/toast';
import { usePathname, useSearchParams } from 'next/navigation';
import TypingTitle from '@/components/ui/TypingTitle';
import { getAndSetSuggestedQuestions } from '@/lib/chat/suggestedQuestions';

export default function Home() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { triggerRefresh: refreshChatList } = useChatListRefresh();

  const [inputKey, setInputKey] = useState(Date.now());
  const [showHomePage, setShowHomePage] = useState(false);

  // 优化：合并状态选择器，减少重渲染
  const {
    // Chat 状态
    loading, 
    isStreaming,
    error,
    animatingTitleChatId,
    isFunctionCallInProgress: globalIsFunctionCallInProgress,
    functionCallType: globalFunctionCallType,
    chats: localChats,
    activeChatId,
    isLoadingServerChat,
    // Models 状态
    models,
    selectedModelId
  } = useAppSelector((state) => ({
    // Chat 状态
    loading: state.chat.loading,
    isStreaming: state.chat.isStreaming,
    error: state.chat.error,
    animatingTitleChatId: state.chat.animatingTitleChatId,
    isFunctionCallInProgress: state.chat.isFunctionCallInProgress,
    functionCallType: state.chat.functionCallType,
    chats: state.chat.chats,
    activeChatId: state.chat.activeChatId,
    isLoadingServerChat: state.chat.isLoadingServerChat,
    // Models 状态
    models: state.models.models,
    selectedModelId: state.models.selectedModelId
  }));

  // 使用useMemo优化activeChat计算
  const activeChat: Chat | null = useMemo(() => {
    return activeChatId ? localChats.find(c => c.id === activeChatId) || null : null;
  }, [activeChatId, localChats]);

  // 使用本地Redux状态数据
  const chats = localChats;

  // 添加用于标题动画的状态
  const [isTypingTitle, setIsTypingTitle] = useState(false);
  const [typingTitle, setTypingTitle] = useState("");
  const [fullTitle, setFullTitle] = useState("");
  const [typingSpeed] = useState({ min: 150, max: 300 }); // 大幅降低打字速度

  // 添加用于确认对话框的状态
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  // 判断是否显示欢迎页面
  const shouldShowWelcome = !activeChatId || chats.length === 0;
  
  // 根据当前状态决定是否显示主页
  useEffect(() => {
    if (shouldShowWelcome) {
      setShowHomePage(true);
    } else if (activeChatId) {
      // 检查当前活动对话是否是新建的空对话
      const isNewEmptyChat = activeChat && activeChat.messages.length === 0;
      if (isNewEmptyChat) {
        // 新建的空对话应该显示示例页面
        setShowHomePage(true);
      } else {
        // 有内容的对话不显示示例页面
        setShowHomePage(false);
      }
    }
  }, [shouldShowWelcome, activeChatId, activeChat]);

  const [currentUserQuery, setCurrentUserQuery] = useState('');

  // 添加用于建议问题的状态
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  // 添加问题请求队列引用
  const pendingQuestionRequestRef = useRef<NodeJS.Timeout | null>(null);

  const chatInputRef = useRef<HTMLDivElement>(null);

  // 监听activeChatId变化，强制重新挂载输入组件
  useEffect(() => {
    setInputKey(Date.now());
    // 切换活动聊天时，清除全局的函数调用指示状态
    if (activeChatId) {
      dispatch(clearFunctionCallData());
    }
  }, [activeChatId, dispatch]);

  // 监听活动聊天变化
  useEffect(() => {
    // 切换会话时，清空推荐问题
    setSuggestedQuestions([]);
  }, [activeChatId]);

  // 添加新的状态变量来跟踪聊天中是否有消息
  const [hasMessages, setHasMessages] = useState(false);

  // 在useEffect中检测活动对话是否有消息
  useEffect(() => {
    if (activeChat && activeChat.messages && activeChat.messages.length > 0) {
      setHasMessages(true);
      setFullTitle(activeChat.title);
      setTypingTitle(activeChat.title);
    } else {
      setHasMessages(false);
    }
  }, [activeChat]);

  // 添加状态跟踪标题动画
  const [titleToAnimate, setTitleToAnimate] = useState<string | null>(null);

  // 在activeChatId变更时重置标题动画
  useEffect(() => {
    setTitleToAnimate(null);
  }, [activeChatId]);

  // 当有activeChatId但还没有messages时的处理，或者正在加载服务端聊天时
  const shouldShowLoadingChat = activeChatId && (!hasMessages || isLoadingServerChat) && !showHomePage && !error;
  
  // 当选择对话时，立即关闭首页显示（仅对有内容的对话）
  useEffect(() => {
    if (activeChatId && showHomePage) {
      // 检查是否是有内容的对话
      const hasContent = activeChat && activeChat.messages.length > 0;
      if (hasContent) {
        setShowHomePage(false);
      }
    }
  }, [activeChatId, showHomePage, activeChat]);

  // 创建新对话
  const handleNewChat = useCallback(() => {

    // 确保有选中的模型ID
    const modelToUse = selectedModelId || (models.length > 0 ? models[0].id : null);

    if (!modelToUse) {
      console.error('没有可用的模型，无法创建对话');
      dispatch(setError('没有可用的模型，无法创建对话'));
      return;
    }

    try {
      // 创建对话时传入当前选择的模型ID
      dispatch(createChat({ modelId: modelToUse }));
      // 创建新对话时显示示例页面，让用户选择话题或输入问题
      setShowHomePage(true);
      
      // 刷新对话列表，确保新对话显示在左侧面板
      setTimeout(() => {
        refreshChatList();
      }, 100);
      
      // 使用setTimeout确保状态已更新
      setTimeout(() => {
        // 确保聊天界面已加载，再重置焦点
        if (chatInputRef.current) {
          chatInputRef.current.click();
        }
      }, 100);
      
    } catch (error) {
      console.error('创建对话失败:', error);
      dispatch(setError('创建对话失败，请重试'));
    }
  }, [selectedModelId, models, dispatch, refreshChatList]);

  // 跳转到首页
  const handleGoToHome = useCallback(() => {
    setShowHomePage(true);
  }, []);

  // 当显示聊天界面时，关闭首页
  const handleChatSelected = useCallback(() => {
    if (showHomePage) {
      setShowHomePage(false);
    }
  }, [showHomePage]);

  // 获取推荐问题函数
  const handleSelectQuestion = useCallback((question: string) => {
    if (!activeChatId) return;
    
    // 清空推荐问题
    setSuggestedQuestions([]);
    
    // 发送问题
    handleSendMessage(question);
  }, [activeChatId]);

  const handleRefreshQuestions = useCallback(async () => {
    if (!activeChatId) return;
    
    setSuggestedQuestions([]);
    setIsLoadingQuestions(true);
    
    await getAndSetSuggestedQuestions(activeChatId, true, setIsLoadingQuestions, setSuggestedQuestions);
  }, [activeChatId]);

  // 发送消息
  const handleSendMessage = async (content: string, files?: FileWithPreview[], fileIds?: string[]) => {
    if ((!content.trim() && (!files || files.length === 0)) || !selectedModelId) return;

    if (showHomePage) {
      setShowHomePage(false);
    }
    
    let currentActiveChatId = activeChatId;

    if (!currentActiveChatId) {
      const newChatId = uuidv4();
      dispatch(
        createChat({
          id: newChatId,
          modelId: selectedModelId,
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
    
    dispatch(addMessage({
      chatId: currentActiveChatId,
      message: userMessage
    }));
    
    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    // 开始流式输出
    dispatch(startStreaming(currentActiveChatId));
    
    const { reasoningEnabled, webSearchEnabled } = store.getState().chat;

    // 检查是否启用向量搜索和上下文增强
    const { searchEnabled, contextEnhancementEnabled } = store.getState().search;

    // 如果启用了向量搜索和上下文增强，获取相关上下文
    if (searchEnabled && contextEnhancementEnabled) {
      dispatch(fetchEnhancedContext({ query: content, conversationId: currentActiveChatId }));
    }

    const messageId = uuidv4();

    const fileInfo = files && files.length > 0 ? [{
      name: files[0].name,
      size: files[0].size,
      type: files[0].type,
      previewUrl: files[0].preview,
      fileId: (files[0] as any).fileId
    }] : undefined;

    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    // 检查是否启用网络搜索
    const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
    const useWebSearch = webSearchEnabled && supportsWebSearch;

    // 检查是否启用函数调用
    const { functionCallEnabled } = store.getState().chat;
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
            dispatch(updateStreamingContent({
              chatId: currentActiveChatId,
              content
            }));

            if (reasoning) {
              dispatch(updateStreamingReasoningContent(reasoning));
            }
          } else {
            dispatch(updateStreamingContent({
              chatId: currentActiveChatId,
              content: content
            }));

            dispatch(endStreaming());

            // 如果返回了新的对话ID，更新Redux状态
            if (conversationId && conversationId !== currentActiveChatId) {
              console.log(`收到新的对话ID: ${conversationId}，当前ID: ${currentActiveChatId}`);
              dispatch(setActiveChat(conversationId));
              
              // 刷新对话列表以显示新创建的对话
              setTimeout(() => {
                refreshChatList();
              }, 1000);
            } else {
              // 如果是第一条消息且没有返回新的conversationId，也尝试刷新列表
              setTimeout(() => {
                refreshChatList();
              }, 1000);
            }
            
            // 流式输出结束后获取推荐问题
            // 如果已有正在等待执行的请求，取消它
            if (pendingQuestionRequestRef.current) {
              clearTimeout(pendingQuestionRequestRef.current);
            }
            
            // 延迟获取推荐问题
            pendingQuestionRequestRef.current = setTimeout(() => {
              pendingQuestionRequestRef.current = null;
              
              const finalChatId = conversationId || currentActiveChatId;
              console.log(`[handleSendMessage] Complete. Scheduling getSuggestedQuestions for chatId: ${finalChatId}`);
              if (finalChatId) {
                // 每次对话后强制刷新推荐问题，确保为最新对话内容生成问题
                getAndSetSuggestedQuestions(finalChatId, true, setIsLoadingQuestions, setSuggestedQuestions);
              }
            }, 1500);
          }

          // 在消息流结束(done=true)且是第一条消息时生成标题
          const finalChatId = conversationId || currentActiveChatId;
          const chat = store.getState().chat.chats.find(c => c.id === finalChatId);
          if (done && chat && chat.messages.length === 2) {
            // 延迟一小段时间确保服务器已处理完毕
            setTimeout(async () => {
              try {
                const generatedTitle = await generateChatTitle(
                  finalChatId,
                  undefined, // 不传具体消息，让后端从对话ID获取完整消息链
                  { max_length: 20 }
                );
                
                // 设置要动画的标题Chat ID
                dispatch(setAnimatingTitleChatId(finalChatId));
                
                // 更新Redux中的标题
                dispatch(updateChatTitle({
                  chatId: finalChatId,
                  title: generatedTitle
                }));
                
                // 同时更新服务端列表中的标题
                dispatch(updateServerChatTitle({
                  chatId: finalChatId,
                  title: generatedTitle
                }));
                
                // 标题生成后也刷新对话列表，确保显示新标题
                refreshChatList();
                
                // 设置自动清除动画效果的定时器
                setTimeout(() => {
                  dispatch(setAnimatingTitleChatId(null));
                }, generatedTitle.length * 200 + 1000); // 字符数*200ms + 额外1000ms
              } catch (error) {
                console.error('生成标题失败:', error);
              }
            }, 1000); // 延迟1秒确保服务器已处理
          }
        });
    } catch (error) {
      console.error('发送消息失败:', error);
      dispatch(setError(error instanceof Error ? error.message : '发送消息失败'));
      dispatch(endStreaming());
      
      // 更新用户消息状态为失败
      const chat = chats.find(c => c.id === currentActiveChatId);
      if (chat && chat.messages.length > 0) {
        const lastMessage = chat.messages[chat.messages.length - 1];
        if (lastMessage.role === 'user') {
          dispatch(setMessageStatus({
            chatId: currentActiveChatId,
            messageId: lastMessage.id,
            status: 'failed'
          }));
        }
      }
    }
  };

  // 重试发送消息
  const handleRetryMessage = async (messageId: string) => {
    if (!activeChatId || !selectedModelId) return;

    // 查找需要重试的消息
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    const message = chat.messages.find(m => m.id === messageId);
    if (!message) return;

    // 对于AI消息的重新生成，我们需要找到前一条用户消息
    if (message.role === 'assistant') {
      // 找到前面的用户消息
      const messageIndex = chat.messages.findIndex(m => m.id === messageId);
      if (messageIndex <= 0) return; // 如果是第一条消息或找不到索引，直接返回

      // 假设用户消息在AI消息之前
      let userMessageIndex = messageIndex - 1;
      // 寻找最近的用户消息
      while (userMessageIndex >= 0 && chat.messages[userMessageIndex].role !== 'user') {
        userMessageIndex--;
      }

      if (userMessageIndex >= 0) {
        const userMessage = chat.messages[userMessageIndex];

        // 删除当前的AI回复
        dispatch(deleteMessage({
          chatId: activeChatId,
          messageId: message.id
        }));

        const selectedModel = models.find(m => m.id === selectedModelId);
        if (!selectedModel) {
          dispatch(setError('找不到选中的模型信息'));
          return;
        }

        // 检查推理功能
        const { reasoningEnabled } = store.getState().chat;
        const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
        const useReasoning = reasoningEnabled && supportsReasoning;

        // 添加网络搜索功能检查
        const { webSearchEnabled } = store.getState().chat;
        const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
        const useWebSearch = webSearchEnabled && supportsWebSearch;

        const useFunctionCall = selectedModel.capabilities?.functionCalling || false;

        // 使用用户消息内容重新生成
        dispatch(startStreaming(activeChatId));
        if (useReasoning) {
          dispatch(startStreamingReasoning())
        }

        try {
          await sendMessageStream({
            provider: selectedModel.provider,
            model: selectedModel.id,
            message: userMessage.content.trim(),
            conversation_id: activeChatId,
            stream: true,
            options: {
              use_reasoning: useReasoning,
              use_web_search: useWebSearch,
              use_function_call: useFunctionCall
            }
          },
            (content, done, conversationId, reasoning) => {
              if (!done) {
                dispatch(updateStreamingContent({
                  chatId: activeChatId,
                  content
                }));

                if (reasoning) {
                  dispatch(updateStreamingReasoningContent(reasoning))
                }
              } else {
                dispatch(updateStreamingContent({
                  chatId: activeChatId,
                  content: content
                }));

                setTimeout(() => {
                  if (reasoning && reasoning.trim()) {
                    const streamingMessageId = store.getState().chat.streamingMessageId;
                    if (streamingMessageId) {
                      dispatch(updateMessageReasoning({
                        chatId: activeChatId,
                        messageId: streamingMessageId,
                        reasoning: reasoning,
                        isVisible: true
                      }));
                    }
                    // 此时不再调用endStreamingReasoning，因为推理阶段已在接收到[REASONING_COMPLETE]标记时结束
                    // 如果推理还没结束（可能没有收到完整标记），则在这里结束
                    if (!store.getState().chat.isThinkingPhaseComplete) {
                      dispatch(endStreamingReasoning());
                    }
                  }
                  dispatch(endStreaming());
                }, 1000);
                
                // 流式输出结束后获取推荐问题
                // 如果已有正在等待执行的请求，取消它
                if (pendingQuestionRequestRef.current) {
                  clearTimeout(pendingQuestionRequestRef.current);
                }
                
                // 延迟获取推荐问题
                pendingQuestionRequestRef.current = setTimeout(() => {
                  pendingQuestionRequestRef.current = null;
                  
                  // 确保当前会话有AI消息才获取推荐问题
                  const currentActiveChatId = store.getState().chat.activeChatId;
                  if (currentActiveChatId) {
                    // 每次对话后强制刷新推荐问题，确保为最新对话内容生成问题
                    // 清除缓存并获取新的推荐问题
                    getAndSetSuggestedQuestions(currentActiveChatId, true, setIsLoadingQuestions, setSuggestedQuestions);
                  }
                }, 1500);
              }
            });
        } catch (error) {
          console.error('重新生成回复失败:', error);
          dispatch(setError('重新生成失败，请检查网络连接'));
          dispatch(endStreamingReasoning())
          dispatch(endStreaming());
        }
      }
      return;
    }
  };

  // 编辑消息
  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeChatId || !selectedModelId) return;

    // 更新消息内容
    dispatch(editMessage({
      chatId: activeChatId,
      messageId,
      content: newContent
    }));

    // 找到消息在数组中的位置
    const chat = chats.find(c => c.id === activeChatId);
    if (!chat) return;

    const messageIndex = chat.messages.findIndex(m => m.id === messageId);
    if (messageIndex < 0) return;

    // 如果后面有AI回复，需要删除
    if (messageIndex < chat.messages.length - 1 &&
      chat.messages[messageIndex + 1].role === 'assistant') {
      const nextMessage = chat.messages[messageIndex + 1];
      dispatch(deleteMessage({
        chatId: activeChatId,
        messageId: nextMessage.id
      }));
    }

    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    // 设置消息状态为发送中
    dispatch(setMessageStatus({
      chatId: activeChatId,
      messageId,
      status: 'pending'
    }));

    // 检查推理功能
    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    // 添加网络搜索功能检查
    const { webSearchEnabled } = store.getState().chat;
    const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
    const useWebSearch = webSearchEnabled && supportsWebSearch;

    const useFunctionCall = selectedModel.capabilities?.functionCalling || false;

    // 开始流式输出
    dispatch(startStreaming(activeChatId));
    if (useReasoning) {
      dispatch(startStreamingReasoning());
    }

    // 重新发送编辑后的消息
    try {

      await sendMessageStream({
        provider: selectedModel.provider,
        model: selectedModel.id,
        message: newContent.trim(),
        conversation_id: activeChatId,
        stream: true,
        options: {
          use_reasoning: useReasoning,
          use_web_search: useWebSearch,
          use_function_call: useFunctionCall
        }
      },
        (content, done, conversationId, reasoning) => {
          // 处理流式回复...
          if (!done) {
            dispatch(updateStreamingContent({
              chatId: activeChatId,
              content
            }));

            if (reasoning) {
              dispatch(updateStreamingReasoningContent(reasoning));
            }
          } else {
            dispatch(updateStreamingContent({
              chatId: activeChatId,
              content: content
            }));

            // 编辑发送成功，清除消息状态
            dispatch(setMessageStatus({
              chatId: activeChatId,
              messageId,
              status: null
            }));

            setTimeout(() => {
              if (reasoning && reasoning.trim()) {
                const streamingMessageId = store.getState().chat.streamingMessageId;
                if (streamingMessageId) {
                  dispatch(updateMessageReasoning({
                    chatId: activeChatId,
                    messageId: streamingMessageId,
                    reasoning: reasoning,
                    isVisible: true
                  }));
                }
                // 此时不再调用endStreamingReasoning，因为推理阶段已在接收到[REASONING_COMPLETE]标记时结束
                // 如果推理还没结束（可能没有收到完整标记），则在这里结束
                if (!store.getState().chat.isThinkingPhaseComplete) {
                  dispatch(endStreamingReasoning());
                }
              }
              dispatch(endStreaming());
            }, 1000);
            
            // 流式输出结束后获取推荐问题
            // 如果已有正在等待执行的请求，取消它
            if (pendingQuestionRequestRef.current) {
              clearTimeout(pendingQuestionRequestRef.current);
            }
            
            // 延迟获取推荐问题
            pendingQuestionRequestRef.current = setTimeout(() => {
              pendingQuestionRequestRef.current = null;
              
              // 确保当前会话有AI消息才获取推荐问题
              const currentActiveChatId = store.getState().chat.activeChatId;
              if (currentActiveChatId) {
                // 每次对话后强制刷新推荐问题，确保为最新对话内容生成问题
                // 清除缓存并获取新的推荐问题
                getAndSetSuggestedQuestions(currentActiveChatId, true, setIsLoadingQuestions, setSuggestedQuestions);
              }
            }, 1500);
          }
        });
    } catch (error) {
      console.error('发送编辑后的消息失败:', error);

      // 标记消息发送失败
      dispatch(setMessageStatus({
        chatId: activeChatId,
        messageId,
        status: 'failed'
      }));

      dispatch(setError('发送编辑后的消息失败，请重试'));
      dispatch(endStreamingReasoning())
      dispatch(endStreaming());
    }
  };

  const handleClearChat = () => {
    if (!activeChatId) return;

    // 显示确认对话框
    setConfirmDialogOpen(true);
  };

  // 执行清空聊天的操作
  const confirmClearChat = () => {
    if (!activeChatId) return;
    // 清空聊天消息
    dispatch(clearMessages(activeChatId));
    // 清除该聊天的函数调用输出
    dispatch(clearChatFunctionCallOutput({ chatId: activeChatId }));
  };

  // 打字机效果的实现
  useEffect(() => {
    if (isTypingTitle && fullTitle) {
      if (typingTitle.length < fullTitle.length) {
        // 添加随机延迟，使打字效果更自然
        const randomDelay = Math.floor(
          Math.random() * (typingSpeed.max - typingSpeed.min) + typingSpeed.min
        );
        
        const timer = setTimeout(() => {
          setTypingTitle(fullTitle.slice(0, typingTitle.length + 1));
        }, randomDelay);
        
        return () => clearTimeout(timer);
      } else {
        // 打字完成，稍微延迟后结束动画状态
        const finishTimer = setTimeout(() => {
          setIsTypingTitle(false);
        }, 1500);
        
        return () => clearTimeout(finishTimer);
      }
    }
  }, [isTypingTitle, typingTitle, fullTitle, typingSpeed]);

  // 获取当前对话的标题
  const getChatTitle = () => {
    return activeChat?.title || "AI 聊天";
  };

  // Determine if the right panel should be shown
  const shouldShowRightPanel = activeChatId && (globalIsFunctionCallInProgress || activeChat?.functionCallOutput);

  // 渲染界面
  return (
    <MainLayout
      sidebar={
        <ChatSidebarLazy onNewChat={handleNewChat} />
      }
      header={
        <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm bg-background">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold flex items-center mr-6">
              <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
            </Link>
          </div>

          {/* 中间部分：显示当前对话标题和模型选择器 */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-4">
            {animatingTitleChatId === activeChatId ? (
              <TypingTitle 
                title={getChatTitle()} 
                className="font-medium text-base"
                onAnimationComplete={() => {}}
              />
            ) : (
              <div className="font-medium text-base px-3 py-1">
                {getChatTitle()}
              </div>
            )}
            <ModelSelectorLazy onChange={() => {
              // 当模型变更时，清空当前会话的问题缓存
              if (activeChatId) {
                setSuggestedQuestions([]);
              }
            }} />
          </div>

          <div className="flex items-center gap-3">
            <Button 
              variant={!showHomePage ? "default" : "ghost"} 
              size="icon" 
              className={cn(
                "h-9 w-9 rounded-full shadow-sm transition-all duration-300 hover:scale-110 hover:shadow-md",
                !showHomePage ? "bg-primary text-primary-foreground" : "text-foreground"
              )}
              aria-label="首页"
              onClick={handleGoToHome}
            >
              <HomeIcon className="h-4 w-4 transition-transform" />
            </Button>
            
            <Link href="/settings" passHref>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 rounded-full shadow-sm transition-all duration-300 hover:scale-110 hover:shadow-md"
                aria-label="设置"
              >
                <SettingsIcon className="h-4 w-4 transition-transform" />
              </Button>
            </Link>
            
            {/* 主题切换按钮 */}
            <ThemeToggle />
          </div>
        </header>
      }
      rightPanel={ (
        // Only render FunctionCallDisplay if conditions are met
        shouldShowRightPanel && activeChatId
          ? <FunctionCallDisplayLazy chatId={activeChatId} /> 
          : (activeChatId && currentUserQuery && currentUserQuery.length > 0 && !showHomePage
            ? <RelatedDiscussionsLazy currentQuery={currentUserQuery} chatId={activeChatId} />
            : null)
      )}
    >
      <div className="h-full flex flex-col relative">
        {showHomePage ? (
          <div className="flex-1 overflow-y-auto">
            <HomePageLazy onSendMessage={handleSendMessage} onNewChat={handleNewChat} onChatSelected={handleChatSelected} />
          </div>
        ) : shouldShowLoadingChat ? (
          <div className="flex-1 overflow-y-auto px-4 pt-4 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">
                {isLoadingServerChat ? '正在加载对话内容...' : '正在加载对话...'}
              </p>
            </div>
          </div>
        ) : error && activeChatId && !hasMessages ? (
          <div className="flex-1 overflow-y-auto px-4 pt-4 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-red-500 text-2xl">⚠️</div>
              <p className="text-muted-foreground">
                加载对话失败，请重试
              </p>
              <p className="text-sm text-red-500">{error}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            <ChatMessageListLazy
              messages={activeChat?.messages || []}
              loading={loading}
              isStreaming={isStreaming}
              onRetry={handleRetryMessage}
              onEdit={handleEditMessage}
              suggestedQuestions={suggestedQuestions}
              isLoadingQuestions={isLoadingQuestions}
              onSelectQuestion={handleSelectQuestion}
              onRefreshQuestions={handleRefreshQuestions}
            />
          </div>
        )}
        <div 
          ref={chatInputRef} 
          tabIndex={-1} 
          className="flex-shrink-0 p-4"
        >
          <ChatInput
            key={inputKey}
            onSendMessage={handleSendMessage}
            onClearMessage={handleClearChat}
          />
        </div>
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={confirmClearChat}
        title="确认清空聊天"
        description="您确定要清空当前聊天内容吗？此操作不可恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        variant="destructive"
      />
    </MainLayout>
  );
}