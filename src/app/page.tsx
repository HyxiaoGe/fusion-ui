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
import { SettingsIcon } from 'lucide-react';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import FunctionCallDisplay from '@/components/chat/FunctionCallDisplay';
import { useChatListRefresh } from '@/hooks/useChatListRefresh';
import { useToast } from '@/components/ui/toast';
import { usePathname, useSearchParams } from 'next/navigation';
import TypingTitle from '@/components/ui/TypingTitle';
import { useChatActions } from '@/hooks/useChatActions';
import { useSuggestedQuestions } from '@/hooks/useSuggestedQuestions';
import { UserAvatarMenu } from '@/components/layouts/UserAvatarMenu';
import ConfirmDialog from '@/components/ui/confirm-dialog';

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

  const { 
    suggestedQuestions, 
    isLoadingQuestions, 
    fetchQuestions, 
    clearQuestions 
  } = useSuggestedQuestions(activeChatId);

  const chatInputRef = useRef<HTMLDivElement>(null);

  // 使用新的 useChatActions Hook
  const { 
    newChat, 
    clearCurrentChat,
    sendMessage,
    retryMessage,
    editMessage
  } = useChatActions({
    onNewChatCreated: () => {
      // 创建新对话时显示示例页面，让用户选择话题或输入问题
      setShowHomePage(true);
      
      // 使用setTimeout确保状态已更新
      setTimeout(() => {
        // 确保聊天界面已加载，再重置焦点
        if (chatInputRef.current) {
          chatInputRef.current.click();
        }
      }, 100);
    },
    onSendMessageStart: () => {
      if (showHomePage) {
        setShowHomePage(false);
      }
    },
    onStreamEnd: () => {
      // 强制刷新以获取新问题
      fetchQuestions(true);
    }
  });

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
    clearQuestions();
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

  const handleSendMessage = sendMessage;
  const handleRetryMessage = retryMessage;
  const handleEditMessage = editMessage;
  const handleNewChat = newChat;

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
    clearQuestions();
    
    // 发送问题
    handleSendMessage(question);
  }, [activeChatId, clearQuestions, handleSendMessage]);

  const handleRefreshQuestions = useCallback(async () => {
    if (!activeChatId) return;
    // 强制刷新
    fetchQuestions(true);
  }, [activeChatId, fetchQuestions]);

  const handleClearChat = () => {
    if (!activeChatId) return;

    // 显示确认对话框
    setConfirmDialogOpen(true);
  };

  // 执行清空聊天的操作
  const confirmClearChat = clearCurrentChat;

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
                clearQuestions();
              }
            }} />
          </div>

          <div className="flex items-center gap-3">
            <UserAvatarMenu />
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