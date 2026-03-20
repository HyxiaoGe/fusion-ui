'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  setActiveChat,
  Chat,
  setLoadingServerChat,
  updateChatFromServer,
  setServerError,
} from '@/redux/slices/chatSlice';
import { getConversation } from '@/lib/api/chat';
import {
  buildChatFromServerConversation,
  getConversationHydrationView,
  shouldHydrateConversation,
} from '@/lib/chat/conversationHydration';

import { 
  ChatMessageListLazy, 
  ChatSidebarLazy, 
  ModelSelectorLazy
} from '@/components/lazy/LazyComponents';
import MainLayout from '@/components/layouts/MainLayout';
import ChatInput from '@/components/chat/ChatInput';

import { useToast } from '@/components/ui/toast';
import TypingTitle from '@/components/ui/TypingTitle';
import { useChatActions } from '@/hooks/useChatActions';
import { useSuggestedQuestions } from '@/hooks/useSuggestedQuestions';
import { useSuggestedQuestionContinuation } from '@/hooks/useSuggestedQuestionContinuation';
import { useTransientCompletionState } from '@/hooks/useTransientCompletionState';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';
import { shouldAutoFetchSuggestedQuestions } from '@/lib/chat/suggestedQuestionTiming';
import { UserAvatarMenu } from '@/components/layouts/UserAvatarMenu';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import Link from 'next/link';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params?.chatId as string;
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  const [inputKey, setInputKey] = useState(Date.now());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [hydrationFailed, setHydrationFailed] = useState(false);
  const [hydrationErrorMessage, setHydrationErrorMessage] = useState<string | null>(null);
  const hydrationRequestRef = useRef<string | null>(null);

  // Redux 状态
  const {
    loading, 
    isStreaming,
    error,
    animatingTitleChatId,
    chats: localChats,
    activeChatId,
    isLoadingServerChat,
    models,
    selectedModelId
  } = useAppSelector((state) => ({
    loading: state.chat.loading,
    isStreaming: state.chat.isStreaming,
    error: state.chat.error,
    animatingTitleChatId: state.chat.animatingTitleChatId,
    chats: state.chat.chats,
    activeChatId: state.chat.activeChatId,
    isLoadingServerChat: state.chat.isLoadingServerChat,
    models: state.models.models,
    selectedModelId: state.models.selectedModelId
  }));

  // 使用useMemo优化activeChat计算
  const activeChat: Chat | null = useMemo(() => {
    return chatId ? localChats.find(c => c.id === chatId) || null : null;
  }, [chatId, localChats]);

  const { 
    suggestedQuestions, 
    isLoadingQuestions, 
    fetchQuestions, 
    clearQuestions 
  } = useSuggestedQuestions(chatId);

  const chatInputRef = useRef<HTMLDivElement>(null);
  const needsServerHydration = useMemo(() => shouldHydrateConversation(activeChat), [activeChat]);
  const showCompletionState = useTransientCompletionState({
    isStreaming,
    isLoadingQuestions,
    messages: activeChat?.messages || [],
  });
  const hydrationView = useMemo(
    () =>
      getConversationHydrationView({
        chatId,
        chat: activeChat,
        isLoadingServerChat,
        serverError: hydrationFailed ? (hydrationErrorMessage || '加载聊天数据失败') : null,
      }),
    [activeChat, chatId, hydrationErrorMessage, hydrationFailed, isLoadingServerChat]
  );

  // 从服务端加载聊天数据的函数
  const loadChatFromServer = useCallback(async (chatId: string) => {
    try {
      dispatch(setLoadingServerChat(true));
      dispatch(setServerError(null));
      setHydrationFailed(false);
      setHydrationErrorMessage(null);
      const serverChatData = await getConversation(chatId);
      dispatch(updateChatFromServer(buildChatFromServerConversation(serverChatData)));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '加载聊天数据失败';
      setHydrationFailed(true);
      setHydrationErrorMessage(errorMessage);
      dispatch(setServerError(errorMessage));
      toast({
        message: errorMessage,
        type: "error",
      });
    } finally {
      dispatch(setLoadingServerChat(false));
    }
  }, [dispatch, toast]);

  // 使用聊天操作Hook
  const { 
    clearCurrentChat,
    sendMessage,
    retryMessage,
    editMessage
  } = useChatActions({
    onSendMessageStart: () => {
      // 消息发送开始
    },
    onStreamEnd: () => {
      fetchQuestions(true);
    }
  });

  useEffect(() => {
    hydrationRequestRef.current = null;
    setHydrationFailed(false);
    setHydrationErrorMessage(null);
  }, [chatId]);

  // 设置当前活跃聊天并尝试加载数据
  useEffect(() => {
    if (!chatId) {
      return;
    }

    if (chatId !== activeChatId) {
      dispatch(setActiveChat(chatId));
    }

    if (!needsServerHydration || isLoadingServerChat || hydrationRequestRef.current === chatId) {
      return;
    }

    hydrationRequestRef.current = chatId;
    void loadChatFromServer(chatId);
  }, [activeChatId, chatId, dispatch, isLoadingServerChat, loadChatFromServer, needsServerHydration]);

  // 监听activeChatId变化，强制重新挂载输入组件
  useEffect(() => {
    setInputKey(Date.now());
  }, [chatId]);

  // 监听活动聊天变化，清空推荐问题
  useEffect(() => {
    clearQuestions();
  }, [chatId, clearQuestions]);

  useEffect(() => {
    if (!chatId || !activeChat || isStreaming || isLoadingQuestions || suggestedQuestions.length > 0) {
      return;
    }

    if (!shouldAutoFetchSuggestedQuestions(activeChat.messages)) {
      return;
    }

    void fetchQuestions();
  }, [activeChat, chatId, fetchQuestions, isLoadingQuestions, isStreaming, suggestedQuestions.length]);

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

  const handleNewChat = useCallback(() => {
    dispatch(setActiveChat(null));
    const modelToUse = getFirstEnabledModelId(models);
    router.push(modelToUse ? `/?new=true&model=${modelToUse}` : '/?new=true');
  }, [dispatch, models, router]);

  const handleSelectQuestion = useSuggestedQuestionContinuation({
    canContinue: Boolean(chatId),
    clearQuestions,
    sendMessage: handleSendMessage,
    scrollTargetRef: chatInputRef,
  });

  const handleRefreshQuestions = useCallback(async () => {
    if (!chatId) return;
    fetchQuestions(true);
  }, [chatId, fetchQuestions]);

  const handleClearChat = () => {
    if (!chatId) return;
    setConfirmDialogOpen(true);
  };

  const handleRetryLoadChat = useCallback(() => {
    if (!chatId) {
      return;
    }

    hydrationRequestRef.current = null;
    setHydrationFailed(false);
    setHydrationErrorMessage(null);
    void loadChatFromServer(chatId);
  }, [chatId, loadChatFromServer]);

  const confirmClearChat = clearCurrentChat;

  // 获取当前对话的标题
  const getChatTitle = () => {
    return activeChat?.title || "AI 聊天";
  };

  // 如果正在加载
  if (hydrationView === 'loading') {
    return (
      <MainLayout
        sidebar={<ChatSidebarLazy onNewChat={handleNewChat} activeChatIdOverride={chatId} />}
        header={
          <header className="h-14 border-b flex items-center justify-between gap-3 px-4 sm:px-5 sticky top-0 z-10 shadow-sm bg-background">
            <div className="flex items-center shrink-0">
              <Link href="/" className="text-xl font-bold flex items-center">
                <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
              </Link>
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-4 px-2">
              <div className="hidden truncate px-2 py-1 font-medium text-sm sm:block sm:text-base">{activeChat?.title || '正在恢复对话'}</div>
              <ModelSelectorLazy onChange={clearQuestions} />
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <UserAvatarMenu />
            </div>
          </header>
        }
      >
        <div className="h-full flex flex-col relative">
          <div className="flex-1 overflow-y-auto px-4 pt-4" data-chat-scroll-container="true">
            <ChatMessageListLazy
              messages={[]}
              loadingState="history-hydration"
            />
          </div>
        </div>
      </MainLayout>
    );
  }

  // 如果聊天不存在或有错误
  if (!activeChat || hydrationView === 'error') {
    return (
      <MainLayout
        sidebar={<ChatSidebarLazy onNewChat={handleNewChat} activeChatIdOverride={chatId} />}
        header={
          <header className="h-14 border-b flex items-center justify-between gap-3 px-4 sm:px-5 sticky top-0 z-10 shadow-sm bg-background">
            <div className="flex items-center shrink-0">
              <Link href="/" className="text-xl font-bold flex items-center">
                <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
              </Link>
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-4 px-2">
              <div className="hidden truncate px-2 py-1 font-medium text-sm sm:block sm:text-base">聊天不存在</div>
              <ModelSelectorLazy onChange={clearQuestions} />
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <UserAvatarMenu />
            </div>
          </header>
        }
      >
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-red-500 text-2xl">⚠️</div>
            <p className="text-muted-foreground">
              {hydrationErrorMessage || error || '对话不存在或已被删除'}
            </p>
            <div className="flex items-center justify-center gap-3">
              {hydrationView === 'error' ? (
                <button
                  onClick={handleRetryLoadChat}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  重试加载
                </button>
              ) : null}
              <button 
                onClick={() => router.push('/')}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                返回首页
              </button>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      sidebar={<ChatSidebarLazy onNewChat={handleNewChat} activeChatIdOverride={chatId} />}
      header={
        <header className="h-14 border-b flex items-center justify-between gap-3 px-4 sm:px-5 sticky top-0 z-10 shadow-sm bg-background">
          <div className="flex items-center shrink-0">
            <Link href="/" className="text-xl font-bold flex items-center">
              <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:gap-4 px-2">
            {animatingTitleChatId === chatId ? (
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
            <ModelSelectorLazy onChange={clearQuestions} />
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <UserAvatarMenu />
          </div>
        </header>
      }
    >
      <div className="h-full flex flex-col relative">
        <div className="flex-1 overflow-y-auto px-4 pt-4" data-chat-scroll-container="true">
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
            completionStateVisible={showCompletionState}
            emptyState={{
              title: '这个会话还没有消息',
              description: '发送第一条消息，继续这段会话。',
            }}
          />
        </div>
        
        <div 
          ref={chatInputRef} 
          tabIndex={-1} 
          className="flex-shrink-0 p-4"
        >
          <ChatInput
            key={inputKey}
            onSendMessage={handleSendMessage}
            onClearMessage={handleClearChat}
            activeChatId={chatId}
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
