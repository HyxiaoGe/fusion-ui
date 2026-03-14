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
  Message
} from '@/redux/slices/chatSlice';
import { getConversation } from '@/lib/api/chat';

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

  // 从服务端加载聊天数据的函数
  const loadChatFromServer = useCallback(async (chatId: string) => {
    try {
      dispatch(setLoadingServerChat(true));
      const serverChatData = await getConversation(chatId);

      // 解析时间戳的工具函数
      const parseTimestamp = (ts: any): number => {
        if (typeof ts === 'number') return ts;
        if (typeof ts !== 'string' || !ts) return 0;
        
        if (ts.endsWith('Z') || /[\+\-]\d{2}:\d{2}$/.test(ts)) {
          const date = new Date(ts);
          return isNaN(date.getTime()) ? 0 : date.getTime();
        }

        const date = new Date(ts.replace(' ', 'T') + 'Z');
        return isNaN(date.getTime()) ? 0 : date.getTime();
      };

      // 处理服务端消息
      const processedMessages = [];
      const messageMap = new Map();
      
      // 按turn_id分组消息
      for (const msg of serverChatData.messages) {
        const turnId = msg.turn_id || msg.id;
        if (!messageMap.has(turnId)) {
          messageMap.set(turnId, []);
        }
        messageMap.get(turnId).push(msg);
      }
      
      // 合并每个turn中的消息，只保留用户可见的问答内容
      for (const [turnId, turnMessages] of messageMap) {
        if (turnMessages.length === 1) {
          const msg = turnMessages[0];
          processedMessages.push({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: parseTimestamp(msg.created_at),
            turnId: turnId,
          });
        } else {
          // 多条消息需要合并
          const userMsg = turnMessages.find((m: any) => m.role === 'user');
          const reasoningMsg = turnMessages.find((m: any) => m.type === 'reasoning_content');
          const assistantMsg = turnMessages.find((m: any) => m.type === 'assistant_content');
          
          // 添加用户消息
          if (userMsg) {
            processedMessages.push({
              id: userMsg.id,
              role: userMsg.role,
              content: userMsg.content,
              timestamp: parseTimestamp(userMsg.created_at),
              turnId: turnId,
            });
          }
          
          if (assistantMsg) {
            processedMessages.push({
              id: assistantMsg.id,
              role: 'assistant',
              content: assistantMsg.content,
              reasoning: reasoningMsg ? reasoningMsg.content : undefined,
              duration: reasoningMsg ? reasoningMsg.duration : undefined,
              isReasoningVisible: false, // 默认隐藏思考过程
              timestamp: parseTimestamp(assistantMsg.created_at),
              turnId: turnId,
            });
          }
        }
      }
      
      // 按时间戳排序
      processedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      const localChat: Chat = {
        id: serverChatData.id,
        title: serverChatData.title,
        messages: processedMessages as Message[],
        model: serverChatData.model,
        provider: serverChatData.provider,
        createdAt: parseTimestamp(serverChatData.created_at),
        updatedAt: parseTimestamp(serverChatData.updated_at),
      };

      // 使用updateChatFromServer来更新数据
      dispatch(updateChatFromServer(localChat));
      dispatch(setLoadingServerChat(false));
    } catch (error) {
      console.error('加载聊天数据失败:', error);
      dispatch(setServerError('加载聊天数据失败'));
      dispatch(setLoadingServerChat(false));
      toast({
        message: "加载对话失败，请重试",
        type: "error",
      });
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

  // 设置当前活跃聊天并尝试加载数据
  useEffect(() => {
    if (chatId && chatId !== activeChatId) {
      dispatch(setActiveChat(chatId));
      
      // 如果本地没有这个聊天的数据，尝试从服务端加载
      const existingChat = localChats.find(c => c.id === chatId);
      if (!existingChat) {
        console.log(`Loading chat ${chatId} from server`);
        loadChatFromServer(chatId);
      }
    }
      }, [chatId, activeChatId, dispatch, localChats, loadChatFromServer]);

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

  // 检查聊天是否存在（延迟判断，给服务端加载时间）
  useEffect(() => {
    if (chatId && !activeChat && !isLoadingServerChat && !loading) {
      // 延迟一段时间再判断，确保服务端数据有机会加载
      const timer = setTimeout(() => {
        // 再次检查聊天是否存在
        const currentActiveChat = localChats.find(c => c.id === chatId);
        if (!currentActiveChat && !isLoadingServerChat) {
          console.warn(`Chat ${chatId} not found after loading attempt, redirecting to home`);
          router.replace('/');
        }
      }, 2000); // 给服务端加载2秒时间

      return () => clearTimeout(timer);
    }
  }, [chatId, activeChat, isLoadingServerChat, loading, router, localChats]);

  // 如果没有chatId，跳转到首页
  useEffect(() => {
    if (!chatId) {
      router.replace('/');
    }
  }, [chatId, router]);

  const handleSendMessage = sendMessage;
  const handleRetryMessage = retryMessage;
  const handleEditMessage = editMessage;
  const handleNewChat = newChat;

  const handleSelectQuestion = useCallback((question: string) => {
    if (!chatId) return;
    clearQuestions();
    handleSendMessage(question);
  }, [chatId, clearQuestions, handleSendMessage]);

  const handleRefreshQuestions = useCallback(async () => {
    if (!chatId) return;
    fetchQuestions(true);
  }, [chatId, fetchQuestions]);

  const handleClearChat = () => {
    if (!chatId) return;
    setConfirmDialogOpen(true);
  };

  const confirmClearChat = clearCurrentChat;

  // 获取当前对话的标题
  const getChatTitle = () => {
    return activeChat?.title || "AI 聊天";
  };

  // 如果正在加载
  if (isLoadingServerChat || (chatId && !activeChat && loading)) {
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
  if (error || !activeChat) {
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
              {error || '对话不存在或已被删除'}
            </p>
            <button 
              onClick={() => router.push('/')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              返回首页
            </button>
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
