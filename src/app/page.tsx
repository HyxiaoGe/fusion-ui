'use client';

import ChatInput from '@/components/chat/ChatInput';
import { 
  ChatMessageListLazy, 
  ChatSidebarLazy, 
  ModelSelectorLazy, 
  HomePageLazy
} from '@/components/lazy/LazyComponents';
import MainLayout from '@/components/layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { Chat } from '@/redux/slices/chatSlice';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';

import { useToast } from '@/components/ui/toast';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import TypingTitle from '@/components/ui/TypingTitle';
import { useChatActions } from '@/hooks/useChatActions';
import { useSuggestedQuestions } from '@/hooks/useSuggestedQuestions';
import { useSuggestedQuestionContinuation } from '@/hooks/useSuggestedQuestionContinuation';
import { useTransientCompletionState } from '@/hooks/useTransientCompletionState';
import { shouldAutoFetchSuggestedQuestions } from '@/lib/chat/suggestedQuestionTiming';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';
import { UserAvatarMenu } from '@/components/layouts/UserAvatarMenu';
import ConfirmDialog from '@/components/ui/confirm-dialog';

export default function Home() {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  // 检查是否是新对话准备状态
  const isNewChatMode = searchParams?.get('new') === 'true';
  const urlModelParam = searchParams?.get('model');

  const [inputKey, setInputKey] = useState(Date.now());
  const [showHomePage, setShowHomePage] = useState(false);
  const newModeEntryChatIdRef = useRef<string | null>(null);

  // 优化：合并状态选择器，减少重渲染
  const {
    // Chat 状态
    loading, 
    isStreaming,
    error,
    animatingTitleChatId,
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
  const shouldRenderHomePage = isNewChatMode || showHomePage;
  const displayActiveChatId = isNewChatMode ? null : activeChatId;
  const displayChat = isNewChatMode ? null : activeChat;

  useEffect(() => {
    if (isNewChatMode) {
      newModeEntryChatIdRef.current = activeChatId;
      return;
    }

    newModeEntryChatIdRef.current = null;
  }, [activeChatId, isNewChatMode]);

  // 根据当前状态决定是否显示主页
  useEffect(() => {
    if (isNewChatMode) {
      // 新对话准备状态，显示输入界面
      setShowHomePage(true);
    } else {
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
    }
  }, [isNewChatMode, shouldShowWelcome, activeChatId, activeChat]);

  const { 
    suggestedQuestions, 
    isLoadingQuestions, 
    fetchQuestions, 
    clearQuestions 
  } = useSuggestedQuestions(displayActiveChatId);

  const showCompletionState = useTransientCompletionState({
    isStreaming,
    isLoadingQuestions,
    messages: displayChat?.messages || [],
  });

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
      // 创建新对话时跳转到准备状态（类似ChatGPT）
      const modelToUse = getFirstEnabledModelId(models);
      router.push(modelToUse ? `/?new=true&model=${modelToUse}` : '/?new=true');
    },
    onSendMessageStart: () => {
      if (isNewChatMode) {
        return;
      }

      if (shouldRenderHomePage) {
        setShowHomePage(false);
      }
    },
    onStreamEnd: (chatId: string) => {
      // 强制刷新以获取新问题
      fetchQuestions(true);
    }
  });

  // 监听activeChatId变化，强制重新挂载输入组件
  useEffect(() => {
    setInputKey(Date.now());
  }, [displayActiveChatId]);

  // 监听活动聊天变化
  useEffect(() => {
    // 切换会话时，清空推荐问题
    clearQuestions();
  }, [clearQuestions, displayActiveChatId]);

  useEffect(() => {
    if (!displayActiveChatId || !displayChat || isStreaming || isLoadingQuestions || suggestedQuestions.length > 0) {
      return;
    }

    if (!shouldAutoFetchSuggestedQuestions(displayChat.messages)) {
      return;
    }

    void fetchQuestions();
  }, [displayChat, displayActiveChatId, fetchQuestions, isLoadingQuestions, isStreaming, suggestedQuestions.length]);

  // 添加新的状态变量来跟踪聊天中是否有消息
  const [hasMessages, setHasMessages] = useState(false);

  // 在useEffect中检测活动对话是否有消息
  useEffect(() => {
    if (displayChat && displayChat.messages && displayChat.messages.length > 0) {
      setHasMessages(true);
      setFullTitle(displayChat.title);
      setTypingTitle(displayChat.title);
    } else {
      setHasMessages(false);
    }
  }, [displayChat]);

  // 添加状态跟踪标题动画
  const [titleToAnimate, setTitleToAnimate] = useState<string | null>(null);

  // 在activeChatId变更时重置标题动画
  useEffect(() => {
    setTitleToAnimate(null);
  }, [activeChatId]);

  // 当有activeChatId但还没有messages时的处理，或者正在加载服务端聊天时
  const shouldShowLoadingChat = displayActiveChatId && (!hasMessages || isLoadingServerChat) && !shouldRenderHomePage && !error;
  
  // 当选择对话时，立即关闭首页显示（仅对有内容的对话）
  useEffect(() => {
    if (displayActiveChatId && shouldRenderHomePage) {
      // 检查是否是有内容的对话
      const hasContent = displayChat && displayChat.messages.length > 0;
      if (hasContent) {
        setShowHomePage(false);
      }
    }
  }, [displayActiveChatId, shouldRenderHomePage, displayChat]);

  useEffect(() => {
    if (!isNewChatMode || !activeChatId || !activeChat || activeChat.messages.length === 0) {
      return;
    }

    if (newModeEntryChatIdRef.current && newModeEntryChatIdRef.current === activeChatId) {
      return;
    }

    router.replace(`/chat/${activeChatId}`);
  }, [activeChat, activeChatId, isNewChatMode, router]);

  const handleSendMessage = useCallback((content: string, files?: File[]) => {
    clearQuestions();
    return sendMessage(content, files as any);
  }, [clearQuestions, sendMessage]);

  const handleRetryMessage = useCallback((messageId: string) => {
    clearQuestions();
    return retryMessage(messageId);
  }, [clearQuestions, retryMessage]);

  const handleEditMessage = useCallback((messageId: string, content: string) => {
    clearQuestions();
    return editMessage(messageId, content);
  }, [clearQuestions, editMessage]);

  const handleNewChat = newChat;

  // 当显示聊天界面时，关闭首页
  const handleChatSelected = useCallback(() => {
    if (shouldRenderHomePage) {
      setShowHomePage(false);
    }
  }, [shouldRenderHomePage]);

  // 获取推荐问题函数
  const handleSelectQuestion = useSuggestedQuestionContinuation({
    canContinue: Boolean(displayActiveChatId),
    clearQuestions,
    sendMessage: handleSendMessage,
    scrollTargetRef: chatInputRef,
  });

  const handleRefreshQuestions = useCallback(async () => {
    if (!displayActiveChatId) return;
    // 强制刷新
    fetchQuestions(true);
  }, [displayActiveChatId, fetchQuestions]);

  const handleClearChat = () => {
    if (!displayActiveChatId) return;

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
    return displayChat?.title || "AI 聊天";
  };

  // 渲染界面
  return (
    <MainLayout
      sidebar={
        <ChatSidebarLazy onNewChat={handleNewChat} activeChatIdOverride={displayActiveChatId} />
      }
      header={
        <header className="h-14 border-b flex items-center justify-between gap-3 px-4 sm:px-5 sticky top-0 z-10 shadow-sm bg-background">
          <div className="flex items-center shrink-0">
            <Link href="/" className="text-xl font-bold flex items-center">
              <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-4 px-2">
            {animatingTitleChatId === displayActiveChatId ? (
              <TypingTitle 
                title={getChatTitle()} 
                className="hidden truncate px-2 font-medium text-sm sm:block sm:text-base"
                onAnimationComplete={() => {}}
              />
            ) : (
              <div className="hidden truncate px-2 py-1 font-medium text-sm sm:block sm:text-base">
                {getChatTitle()}
              </div>
            )}
            <ModelSelectorLazy onChange={() => {
              // 当模型变更时，清空当前会话的问题缓存
              if (displayActiveChatId) {
                clearQuestions();
              }
            }} />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <UserAvatarMenu />
          </div>
        </header>
      }
    >
      <div className="h-full flex flex-col relative">
        {shouldRenderHomePage ? (
          <div className="flex-1 overflow-y-auto">
            <HomePageLazy onSendMessage={handleSendMessage} onNewChat={handleNewChat} onChatSelected={handleChatSelected} />
          </div>
        ) : shouldShowLoadingChat ? (
          <div className="flex-1 overflow-y-auto px-4 pt-4" data-chat-scroll-container="true">
            <ChatMessageListLazy
              messages={[]}
              loadingState="history-hydration"
            />
          </div>
        ) : error && displayActiveChatId && !hasMessages ? (
          <div className="flex-1 overflow-y-auto px-4 pt-4 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-red-500 text-2xl">⚠️</div>
              <p className="text-muted-foreground">
                加载对话失败，请重试
              </p>
              <p className="text-sm text-red-500">{error}</p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => router.push(`/chat/${displayActiveChatId}`)}>打开对话页重试</Button>
                <Button variant="outline" onClick={() => router.push('/')}>返回首页</Button>
              </div>
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto px-4 pt-4" data-chat-scroll-container="true">
            <ChatMessageListLazy
              messages={displayChat?.messages || []}
              loading={loading}
              isStreaming={isStreaming}
              onRetry={handleRetryMessage}
              onEdit={handleEditMessage}
              suggestedQuestions={suggestedQuestions}
              isLoadingQuestions={isLoadingQuestions}
              onSelectQuestion={handleSelectQuestion}
              onRefreshQuestions={handleRefreshQuestions}
              completionStateVisible={showCompletionState}
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
            activeChatId={displayActiveChatId}
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
