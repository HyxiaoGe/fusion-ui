'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChatMessageListLazy, ChatSidebarLazy } from '@/components/lazy/LazyComponents';
import MainLayout from '@/components/layouts/MainLayout';
import ChatInput from '@/components/chat/ChatInput';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { useStore } from 'react-redux';
import {
  appendMessage,
  clearConversationMessages,
  updateMessage,
} from '@/redux/slices/conversationSlice';
import {
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  setStreamStatus,
  startStream,
} from '@/redux/slices/streamSlice';
import { fetchStreamStatus } from '@/lib/api/streamStatus';
import { reconnectStream } from '@/lib/api/chat';
import { useConversation } from '@/hooks/useConversation';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useSuggestedQuestions } from '@/hooks/useSuggestedQuestions';
import { useSuggestedQuestionContinuation } from '@/hooks/useSuggestedQuestionContinuation';
import { useTransientCompletionState } from '@/hooks/useTransientCompletionState';
import { getFirstEnabledModelId } from '@/lib/models/modelPreference';
import { shouldAutoFetchSuggestedQuestions } from '@/lib/chat/suggestedQuestionTiming';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const store = useStore();
  const chatId = params?.chatId as string;
  const [inputKey, setInputKey] = useState(Date.now());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const chatInputRef = useRef<HTMLDivElement>(null);
  const { conversation, hydrationView, hydrationError, retryHydration } = useConversation(chatId);
  const { sendMessage, stopStreaming, retryMessage } = useSendMessage();
  const {
    suggestedQuestions,
    isLoadingQuestions,
    fetchQuestions,
    clearQuestions,
  } = useSuggestedQuestions(chatId);
  const { models, conversationError, isStreaming, streamConversationId } =
    useAppSelector((state) => ({
      models: state.models.models,

      conversationError: state.conversation.globalError,
      isStreaming: state.stream.isStreaming,
      streamConversationId: state.stream.conversationId,
    }));

  useEffect(() => {
    setInputKey(Date.now());
  }, [chatId]);

  useEffect(() => {
    clearQuestions();
  }, [chatId, clearQuestions]);

  // 页面 mount / hydration 完成后检查是否有未完成的流 → 断线重连
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const hydrationDone = hydrationView === 'ready';
  useEffect(() => {
    if (!chatId || !isAuthenticated || !hydrationDone || isStreaming) return;

    let cancelled = false;
    const checkAndReconnect = async () => {
      try {
        const status = await fetchStreamStatus(chatId);
        if (cancelled || status.status !== 'streaming') return;

        const messageId = status.message_id || '';

        // 页面刷新后前端没有任何已有内容，从头（"0"）读取全部 Stream 内容
        // last_entry_id 仅用于「SSE 连接中途断开后自动重连」的场景（未来实现）
        const reconnectFromId = '0';

        // 有进行中的流 → 建立 SSE 重连，从头读取
        dispatch(setStreamStatus('reconnecting'));

        // 确保有 assistant 消息占位
        const conv = conversation;
        const hasAssistant = conv?.messages?.some((m) => m.role === 'assistant' && m.id === messageId);
        if (!hasAssistant && messageId) {
          dispatch(appendMessage({
            conversationId: chatId,
            message: { id: messageId, role: 'assistant', content: [], timestamp: Date.now() },
          }));
        }

        // 启动流式状态
        dispatch(startStream({ conversationId: chatId, messageId }));

        // TODO: 遗漏3 — 重连 SSE 请求没有挂 abort controller，
        // stopStreaming 无法立即取消。后续加 signal 支持让 stop 能中断重连读取
        // 从 Redis Stream 读取（从头读取已有内容 + 实时新增内容）
        await reconnectStream(chatId, reconnectFromId, {
          onReady: () => {},
          onTextDelta: (delta, blockId, meta) => {
            if (cancelled) return;
            const streamState = (store.getState() as any).stream;
            if (streamState.isStreamingReasoning) {
              dispatch(completeThinkingPhase());
            }
            dispatch(appendTextDelta({ blockId, delta }));
          },
          onThinkingDelta: (delta, blockId) => {
            if (cancelled) return;
            dispatch(appendThinkingDelta({ blockId, delta }));
          },
          onDone: () => {
            if (cancelled) return;
            dispatch(endStream());
            dispatch(setStreamStatus('completed'));
            // 消息已落库，刷新 hydration
            retryHydration();
          },
          onError: () => {
            if (cancelled) return;
            dispatch(endStream());
            dispatch(setStreamStatus('error'));
          },
        });
      } catch {
        if (!cancelled) {
          dispatch(endStream());
        }
      }
    };

    checkAndReconnect();
    return () => { cancelled = true; };
  }, [chatId, isAuthenticated, hydrationDone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chatId || !conversation || isStreaming || isLoadingQuestions || suggestedQuestions.length > 0) {
      return;
    }

    if (!shouldAutoFetchSuggestedQuestions(conversation.messages)) {
      return;
    }

    void fetchQuestions();
  }, [chatId, conversation, fetchQuestions, isLoadingQuestions, isStreaming, suggestedQuestions.length]);

  const showCompletionState = useTransientCompletionState({
    isStreaming,
    isLoadingQuestions,
    messages: conversation?.messages || [],
  });

  const handleSendMessage = useCallback((content: string, files?: File[]) => {
    clearQuestions();
    return sendMessage(
      content,
      {
        conversationId: chatId,
        onStreamEnd: (conversationId) => {
          if (conversationId === chatId) {
            fetchQuestions(true);
          }
        },
      },
      files as any
    );
  }, [chatId, clearQuestions, fetchQuestions, sendMessage]);

  const handleNewChat = useCallback(() => {
    const modelToUse = getFirstEnabledModelId(models);
    router.push(modelToUse ? `/?new=true&model=${modelToUse}` : '/?new=true');
  }, [models, router]);

  const handleSelectQuestion = useSuggestedQuestionContinuation({
    canContinue: Boolean(chatId),
    clearQuestions,
    sendMessage: handleSendMessage,
    scrollTargetRef: chatInputRef,
  });

  const handleRefreshQuestions = useCallback(() => {
    if (!chatId) return;
    fetchQuestions(true);
  }, [chatId, fetchQuestions]);

  const handleRetry = useCallback(
    (messageId: string) => {
      if (!chatId) return;
      void retryMessage(messageId, chatId);
    },
    [chatId, retryMessage]
  );

  const handleClearChat = () => {
    if (!chatId) return;
    setConfirmDialogOpen(true);
  };

  const confirmClearChat = useCallback(() => {
    dispatch(clearConversationMessages(chatId));
  }, [chatId, dispatch]);


  if (hydrationView === 'loading') {
    return (
      <MainLayout
        sidebar={<ChatSidebarLazy onNewChat={handleNewChat} activeChatIdOverride={chatId} />}
      >
        <div className="h-full flex flex-col relative">
          <div className="flex-1 overflow-y-auto px-4 pt-4" data-chat-scroll-container="true">
            <ChatMessageListLazy messages={[]} loadingState="history-hydration" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!conversation || hydrationView === 'error') {
    return (
      <MainLayout
        sidebar={<ChatSidebarLazy onNewChat={handleNewChat} activeChatIdOverride={chatId} />}
      >
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-red-500 text-2xl">⚠️</div>
            <p className="text-muted-foreground">{hydrationError || conversationError || '对话不存在或已被删除'}</p>
            <div className="flex items-center justify-center gap-3">
              {hydrationView === 'error' ? (
                <button
                  onClick={retryHydration}
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
    >
      <div className="h-full flex flex-col relative">
        <div className="flex-1 overflow-y-auto px-4 pt-4" data-chat-scroll-container="true">
          <ChatMessageListLazy
            messages={conversation.messages || []}
            isStreaming={isStreaming && streamConversationId === chatId}
            onRetry={handleRetry}
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

        <div ref={chatInputRef} tabIndex={-1} className="flex-shrink-0 p-4">
          <ChatInput
            key={inputKey}
            onSendMessage={handleSendMessage}
            onClearMessage={handleClearChat}
            onStopStreaming={stopStreaming}
            onModelChange={clearQuestions}
            activeChatId={chatId}
          />
        </div>
      </div>

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
