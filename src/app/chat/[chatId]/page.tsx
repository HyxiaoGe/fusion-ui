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
  const hydrationRequestRef = useRef<string | null>(null);

  // Redux 状态
  const {
    loading, 
    isStreaming,
    error,
    serverError,
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
    serverError: state.chat.serverError,
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
  const hydrationView = useMemo(
    () =>
      getConversationHydrationView({
        chatId,
        chat: activeChat,
        isLoadingServerChat,
        serverError: hydrationFailed ? (serverError || '加载聊天数据失败') : null,
      }),
    [activeChat, chatId, hydrationFailed, isLoadingServerChat, serverError]
  );

  // 从服务端加载聊天数据的函数
  const loadChatFromServer = useCallback(async (chatId: string) => {
    try {
      dispatch(setLoadingServerChat(true));
      dispatch(setServerError(null));
      setHydrationFailed(false);
      const serverChatData = await getConversation(chatId);
      dispatch(updateChatFromServer(buildChatFromServerConversation(serverChatData)));
    } catch (error) {
      setHydrationFailed(true);
      dispatch(setServerError('加载聊天数据失败'));
      toast({
        message: "加载对话失败，请重试",
        type: "error",
      });
    } finally {
      dispatch(setLoadingServerChat(false));
    }
  }, [dispatch, toast]);

  // 使用聊天操作Hook
  const { 
    newChat, 
    clearCurrentChat,
    sendMessage,
    retryMessage,
    editMessage
  } = useChatActions({
    onNewChatCreated: () => {
      // 新对话创建后跳转到首页新对话准备状态（类似ChatGPT）
      const modelToUse = selectedModelId || (models.length > 0 ? models[0].id : null);
      router.push(`/?new=true&model=${modelToUse}`);
    },
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

    const hasAssistantMessage = activeChat.messages.some(
      (message) => message.role === 'assistant' && message.content?.trim()
    );

    if (!hasAssistantMessage) {
      return;
    }

    void fetchQuestions();
  }, [activeChat, chatId, fetchQuestions, isLoadingQuestions, isStreaming, suggestedQuestions.length]);

  const handleSendMessage = sendMessage;
  const handleRetryMessage = retryMessage;
  const handleEditMessage = editMessage;
  const handleNewChat = newChat;

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
        sidebar={<ChatSidebarLazy onNewChat={handleNewChat} />}
        header={
          <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm bg-background">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold flex items-center mr-6">
                <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
              </Link>
            </div>
            <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-4">
              <div className="font-medium text-base px-3 py-1">加载中...</div>
              <ModelSelectorLazy onChange={clearQuestions} />
            </div>
            <div className="flex items-center gap-3">
              <UserAvatarMenu />
            </div>
          </header>
        }
      >
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">正在加载对话内容...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // 如果聊天不存在或有错误
  if (!activeChat || hydrationView === 'error') {
    return (
      <MainLayout
        sidebar={<ChatSidebarLazy onNewChat={handleNewChat} />}
        header={
          <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm bg-background">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold flex items-center mr-6">
                <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
              </Link>
            </div>
            <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-4">
              <div className="font-medium text-base px-3 py-1">聊天不存在</div>
              <ModelSelectorLazy onChange={clearQuestions} />
            </div>
            <div className="flex items-center gap-3">
              <UserAvatarMenu />
            </div>
          </header>
        }
      >
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-red-500 text-2xl">⚠️</div>
            <p className="text-muted-foreground">
              {serverError || error || '对话不存在或已被删除'}
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
      sidebar={<ChatSidebarLazy onNewChat={handleNewChat} />}
      header={
        <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm bg-background">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold flex items-center mr-6">
              <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
            </Link>
          </div>

          {/* 中间部分：显示当前对话标题和模型选择器 */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-4">
            {animatingTitleChatId === chatId ? (
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
            <ModelSelectorLazy onChange={clearQuestions} />
          </div>

          <div className="flex items-center gap-3">
            <UserAvatarMenu />
          </div>
        </header>
      }
    >
      <div className="h-full flex flex-col relative">
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
