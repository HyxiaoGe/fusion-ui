'use client';

import ChatInput from '@/components/chat/ChatInput';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatSidebar from '@/components/chat/ChatSidebar';
import HomePage from '@/components/home/HomePage';
import MainLayout from '@/components/layouts/MainLayout';
import ModelSelector from '@/components/models/ModelSelector';
import RelatedDiscussions from '@/components/search/RelatedDiscussions';
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
  setAllChats,
  setError,
  setMessageStatus,
  startStreaming,
  startStreamingReasoning,
  updateChatTitle,
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
import { HomeIcon, ChevronRightIcon, SettingsIcon } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import FunctionCallDisplay from '@/components/chat/FunctionCallDisplay';
import ConfirmDialog from '@/components/ui/confirm-dialog';

// 添加标题动画组件
const TypingTitle = ({ title, className, onAnimationComplete }: { title: string; className?: string; onAnimationComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  useEffect(() => {
    if (!title) return;
    
    // 重置动画状态
    setDisplayedText('');
    setIsTyping(true);
    
    let index = 0;
    
    // 开始字符动画
    const intervalId = setInterval(() => {
      if (index < title.length) {
        setDisplayedText(title.substring(0, index + 1));
        index++;
      } else {
        clearInterval(intervalId);
        // 保持光标显示一段时间后完成动画
        setTimeout(() => {
          setIsTyping(false);
          // 通知动画完成
          if (onAnimationComplete) {
            onAnimationComplete();
          }
        }, 1000);
      }
    }, 200); // 固定速度，确保足够慢以便观察
    
    return () => clearInterval(intervalId);
  }, [title, onAnimationComplete]);
  
  return (
    <div 
      className={cn(
        "inline-block relative px-3 py-1 rounded-md",
        isTyping && "bg-primary/5 ring-1 ring-primary/20",
        className
      )}
    >
      {displayedText}
      {isTyping && (
        <>
          <span className="inline-block ml-0.5 w-[2px] h-[1.2em] bg-primary animate-blink" />
          <span className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/15 to-primary/0 animate-shine bg-[length:200%_100%]" />
        </>
      )}
    </div>
  );
};

export default function Home() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [inputKey, setInputKey] = useState(Date.now());
  const [showHomePage, setShowHomePage] = useState(false);

  const { 
    loading, 
    isStreaming, 
    animatingTitleChatId,
    isFunctionCallInProgress: globalIsFunctionCallInProgress,
    functionCallType: globalFunctionCallType,
    chats: localChats,
    activeChatId
  } = useAppSelector((state) => state.chat);

  // 使用本地Redux状态数据（暂时保持原有逻辑，之后再逐步切换到服务端）
  const chats = localChats;
  const activeChat: Chat | null = activeChatId ? chats.find(c => c.id === activeChatId) || null : null;

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
      setShowHomePage(false);
    }
  }, [shouldShowWelcome, activeChatId]);

  const { models, selectedModelId } = useAppSelector((state) => state.models);
  const [currentUserQuery, setCurrentUserQuery] = useState('');

  // 添加用于建议问题的状态
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  // 添加缓存状态
  const [questionCache, setQuestionCache] = useState<Record<string, string[]>>({});
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
    // 处理会话切换时的推荐问题
    if (activeChatId) {
      // 检查当前会话是否有AI回复
      const hasAIMessage = activeChat?.messages.some(msg => msg.role === 'assistant');
      
      // 只有在有AI回复的情况下才处理推荐问题
      if (hasAIMessage) {
        // 检查是否有缓存的推荐问题
        if (questionCache[activeChatId] && questionCache[activeChatId].length > 0) {
          // 使用缓存的推荐问题
          setSuggestedQuestions(questionCache[activeChatId]);
        } else {
          // 如果没有缓存，清空当前显示的推荐问题
          setSuggestedQuestions([]);
          
          // 延迟200ms获取推荐问题，避免在快速切换会话时触发不必要的请求
          const delay = setTimeout(() => {
            // 确认仍然是同一个活动会话
            if (activeChatId === store.getState().chat.activeChatId) {
              getSuggestedQuestions(activeChatId);
            }
          }, 200);
          
          return () => clearTimeout(delay);
        }
      } else {
        // 没有AI回复时清空推荐问题
        setSuggestedQuestions([]);
      }
    } else {
      // 无活动会话时清空推荐问题
      setSuggestedQuestions([]);
    }
  }, [activeChatId, questionCache, activeChat]);

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

  // 创建新对话
  const handleNewChat = () => {
    // TODO: 需要改为调用服务端API创建新对话
    // 目前暂时使用本地创建，后续需要实现服务端创建API

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
      setShowHomePage(false); // 创建新对话后显示聊天界面
      
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
  };

  // 跳转到首页
  const handleGoToHome = () => {
    setShowHomePage(true);
  };

  // 当显示聊天界面时，关闭首页
  const handleChatSelected = () => {
    if (showHomePage) {
      setShowHomePage(false);
    }
  };

  // 获取推荐问题函数
  const getSuggestedQuestions = async (chatId: string, forceRefresh: boolean = false) => {
    if (!chatId) return;
    
    // 检查是否有AI消息存在
    const chat = chats.find(c => c.id === chatId);
    const hasAIMessage = chat?.messages.some(msg => msg.role === 'assistant');
    
    // 如果没有AI消息，不获取推荐问题
    if (!hasAIMessage) {
      return;
    }
    
    setIsLoadingQuestions(true);
    try {
      const { questions } = await fetchSuggestedQuestions(chatId, {}, forceRefresh);
      // 更新当前显示的推荐问题
      setSuggestedQuestions(questions);
      // 同时更新缓存
      setQuestionCache(prev => ({
        ...prev,
        [chatId]: questions
      }));
    } catch (error) {
      console.error('获取推荐问题错误:', error);
      setSuggestedQuestions([]);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  // 处理选择推荐问题
  const handleSelectQuestion = (question: string) => {
    // 直接发送所选问题
    handleSendMessage(question);
    // 清空当前会话的缓存和显示的推荐问题，避免重复点击
    if (activeChatId) {
      setQuestionCache(prev => ({
        ...prev,
        [activeChatId]: []
      }));
      setSuggestedQuestions([]);
    }
  };

  const handleRefreshQuestions = async () => {
    if (!activeChatId) return;
    
    // 重置当前的推荐问题，以便显示加载状态
    setSuggestedQuestions([]);
    
    // 强制刷新获取新的推荐问题
    await getSuggestedQuestions(activeChatId, true);
  };

  // 发送消息
  const handleSendMessage = async (content: string, files?: FileWithPreview[], fileIds?: string[]) => {
    if ((!content.trim() && (!files || files.length === 0)) || !activeChatId || !selectedModelId) return;


    dispatch(resetFunctionCallProgress());

    // 如果当前在首页，切换到聊天界面
    if (showHomePage) {
      setShowHomePage(false);
    }

    setCurrentUserQuery(content); // 保存当前查询用于相关推荐

    const selectedModel = models.find(m => m.id === selectedModelId);
    if (!selectedModel) {
      dispatch(setError('找不到选中的模型信息'));
      return;
    }

    const currentChatBeforeAdd = chats.find(chat => chat.id === activeChatId);
    const isFirstMessage = currentChatBeforeAdd &&
      currentChatBeforeAdd.messages.filter(msg => msg.role === 'user').length === 0 &&
      currentChatBeforeAdd.title === '新对话';

    const messageId = uuidv4();

    const fileInfo = files && files.length > 0 ? [{
      name: files[0].name,
      size: files[0].size,
      type: files[0].type,
      previewUrl: files[0].preview,
      fileId: (files[0] as any).fileId
    }] : undefined;

    // 添加用户消息
    dispatch(addMessage({
      chatId: activeChatId,
      message: {
        role: 'user',
        content: content.trim(),
        status: 'pending',
        fileInfo: fileInfo
      }
    }));

    // 检查是否启用向量搜索和上下文增强
    const { searchEnabled, contextEnhancementEnabled } = store.getState().search;

    // 如果启用了向量搜索和上下文增强，获取相关上下文
    if (searchEnabled && contextEnhancementEnabled) {
      dispatch(fetchEnhancedContext({ query: content, conversationId: activeChatId }));
    }

    const { reasoningEnabled } = store.getState().chat;
    const supportsReasoning = selectedModel.capabilities?.deepThinking || false;
    const useReasoning = reasoningEnabled && supportsReasoning;

    // 添加网络搜索功能检查
    const { webSearchEnabled } = store.getState().chat;
    const supportsWebSearch = selectedModel.capabilities?.webSearch || false;
    const useWebSearch = webSearchEnabled && supportsWebSearch;

    const useFunctionCall = selectedModel.capabilities?.functionCalling || false;


    setTimeout(() => {
      dispatch(startStreaming(activeChatId));
      
      if (useReasoning) {
        dispatch(startStreamingReasoning())
        dispatch(updateStreamingReasoningContent(''));
      }
    }, 1000);

    try {
      await sendMessageStream({
        provider: selectedModel.provider,
        model: selectedModel.id,
        message: content.trim(),
        conversation_id: activeChatId,
        stream: true,
        options: {
          use_reasoning: useReasoning,
          use_web_search: useWebSearch,
          use_function_call: useFunctionCall
        },
        file_ids: fileIds || []
      },
        (content, done, conversationId, reasoning) => {
          if (!done) {
            // 更新流式内容
            dispatch(updateStreamingContent({
              chatId: activeChatId,
              content
            }));

            if (useReasoning && reasoning) {
              dispatch(updateStreamingReasoningContent(reasoning));
            }
          } else {
            // 流式响应结束
            dispatch(updateStreamingContent({
              chatId: activeChatId,
              content: content
            }));

            // 结束流式输出
            setTimeout(() => {
              // 如果有推理内容，保存推理内容
              if (reasoning && reasoning.trim()) {
                // 确保将推理内容保存到消息中
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
          }
          if (done) {
            dispatch(setMessageStatus({
              chatId: activeChatId,
              messageId,
              status: null
            }));
            // 流式输出结束后，获取推荐问题
            
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
                getSuggestedQuestions(currentActiveChatId, true);
              }
            }, 1500);
          }

          // 在消息流结束(done=true)且是第一条消息时生成标题
          if (done && isFirstMessage) {
            // 延迟一小段时间确保服务器已处理完毕
            setTimeout(async () => {
              try {
                const generatedTitle = await generateChatTitle(
                  activeChatId || conversationId || '', // 使用可能从服务器返回的新conversationId
                  undefined, // 不传具体消息，让后端从对话ID获取完整消息链
                  { max_length: 20 }
                );
                
                // 设置要动画的标题Chat ID
                dispatch(setAnimatingTitleChatId(activeChatId || conversationId || ''));
                
                // 更新Redux中的标题
                dispatch(updateChatTitle({
                  chatId: activeChatId || conversationId || '',
                  title: generatedTitle
                }));
                
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
      console.error('获取 AI 回复失败:', error);
      // 设置消息发送失败状态
      dispatch(setMessageStatus({
        chatId: activeChatId,
        messageId: messageId,
        status: 'failed'
      }));

      dispatch(setError('获取 AI 回复失败，请重试'));

      // 错误情况下，添加一条错误消息
      if (activeChatId) {
        // 查找之前创建的流式消息ID
        const state = store.getState();
        const chat = state.chat.chats.find(c => c.id === activeChatId);
        const streamingMessageId = state.chat.streamingMessageId;

        if (chat && streamingMessageId) {
          // 更新现有的流式消息为错误消息
          dispatch(updateStreamingContent({
            chatId: activeChatId,
            content: '抱歉，发生了错误，无法获取回复。请检查您的网络连接或稍后重试。'
          }));
        } else {
          // 添加新的错误消息
          dispatch(addMessage({
            chatId: activeChatId,
            message: {
              role: 'assistant',
              content: '抱歉，发生了错误，无法获取回复。请检查您的网络连接或稍后重试。'
            }
          }));
        }
      }

      // 结束流式输出
      dispatch(endStreamingReasoning());
      dispatch(endStreaming());
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
                    getSuggestedQuestions(currentActiveChatId, true);
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
                getSuggestedQuestions(currentActiveChatId, true);
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
        <ChatSidebar onNewChat={handleNewChat} />
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
            <ModelSelector onChange={() => {
              // 当模型变更时，清空当前会话的问题缓存
              if (activeChatId) {
                setQuestionCache(prev => ({
                  ...prev,
                  [activeChatId]: []
                }));
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
          ? <FunctionCallDisplay chatId={activeChatId} /> 
          : (activeChatId && currentUserQuery && currentUserQuery.length > 0 && !showHomePage
            ? <RelatedDiscussions currentQuery={currentUserQuery} chatId={activeChatId} />
            : null)
      )}
    >
      <div className="h-full flex flex-col relative">
        {showHomePage || !hasMessages ? (
          <div className="flex-1 overflow-y-auto">
            <HomePage onNewChat={handleNewChat} onChatSelected={handleChatSelected} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pt-4">
            <ChatMessageList
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