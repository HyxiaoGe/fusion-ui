'use client';

import type { Message } from '@/types/conversation';
import React, { useEffect, useMemo, useRef } from 'react';
import { useAppSelector } from '@/redux/hooks';
import LoadingIndicator from '../ui/loading-indicator';
import ChatMessage from './ChatMessage';
import { isNearBottom } from '@/lib/chat/scrollBehavior';

interface ChatMessageListProps {
  messages: Message[];
  loading?: boolean;
  isStreaming?: boolean;
  loadingState?: 'default' | 'history-hydration';
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  suggestedQuestions?: string[];
  isLoadingQuestions?: boolean;
  onSelectQuestion?: (question: string) => void;
  onRefreshQuestions?: () => void;
  completionStateVisible?: boolean;
  emptyState?: {
    title: string;
    description: string;
  };
}

// 定义角色排序优先级
const getRolePriority = (role: string): number => {
  switch (role) {
    case 'user': return 0; // 用户消息最高优先级
    case 'system': return 1; // 系统消息次之
    case 'assistant': return 2; // AI回复最低优先级
    default: return 3;
  }
};

const DEFAULT_EMPTY_STATE = {
  title: '开始一个新对话',
  description: '输入你的问题，开始与 AI 助手对话...',
};

const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  loading = false,
  isStreaming = false,
  loadingState = 'default',
  onRetry,
  onEdit,
  suggestedQuestions = [],
  isLoadingQuestions = false,
  onSelectQuestion,
  onRefreshQuestions,
  completionStateVisible = false,
  emptyState = DEFAULT_EMPTY_STATE,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  // 按时间戳排序消息 - 确保使用完整毫秒精度
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      // 确保转换为数字类型进行比较
      const timestampA = Number(a.timestamp);
      const timestampB = Number(b.timestamp);

      const timestampDiff = timestampA - timestampB;
      
      // 如果时间戳相同（或非常接近，如在同一秒内）
      if (Math.abs(timestampDiff) < 1000) {
        // 根据角色排序：用户消息排在AI回复前面
        return getRolePriority(a.role) - getRolePriority(b.role);
      }
      
      return timestampDiff;
    });
  }, [messages]);

  const lastAssistantIndex = useMemo(() => {
    const lastMessage = sortedMessages[sortedMessages.length - 1];
    if (lastMessage?.role !== 'assistant') {
      return -1;
    }

    for (let index = sortedMessages.length - 1; index >= 0; index -= 1) {
      if (sortedMessages[index]?.role === 'assistant') {
        return index;
      }
    }
    return -1;
  }, [sortedMessages]);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const scrollContainer = messagesEndRef.current?.closest('[data-chat-scroll-container="true"]') as HTMLElement | null;

    if (!scrollContainer) {
      shouldStickToBottomRef.current = true;
      return;
    }

    const updateStickiness = () => {
      const nearBottom = isNearBottom(scrollContainer);
      shouldStickToBottomRef.current = nearBottom;
    };

    updateStickiness();
    scrollContainer.addEventListener('scroll', updateStickiness, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', updateStickiness);
    };
  }, [sortedMessages.length]);

  // 流式内容长度，用于触发流式期间的自动滚动
  const streamContentLength = useAppSelector(
    state => isStreaming ? state.stream.content.length : 0
  );

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollToBottom();
    }
  }, [messages.length, isStreaming]);

  // 流式期间：content 增长时自动滚动（节流，避免过于频繁）
  const lastScrollTimeRef = useRef(0);
  useEffect(() => {
    if (!isStreaming || streamContentLength === 0) return;
    if (!shouldStickToBottomRef.current) return;

    const now = Date.now();
    if (now - lastScrollTimeRef.current < 300) return; // 最多 300ms 滚一次
    lastScrollTimeRef.current = now;

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [isStreaming, streamContentLength]);

  const statusText = useMemo(() => {
    if (sortedMessages.length === 0) return null;

    const lastMessage = sortedMessages[sortedMessages.length - 1];

    if (lastMessage.role === 'user' && lastMessage.status === 'failed') {
      return '发送失败，可重新发送';
    }

    if (isStreaming) {
      return 'AI 正在回复...';
    }

    if (isLoadingQuestions) {
      return '正在准备推荐追问...';
    }

    if (suggestedQuestions.length > 0) {
      return null;
    }

    if (completionStateVisible && lastMessage.role === 'assistant' && lastMessage.content?.trim()) {
      return '本轮回复已完成';
    }

    return null;
  }, [completionStateVisible, isLoadingQuestions, isStreaming, sortedMessages, suggestedQuestions.length]);

  if (messages.length === 0 && loadingState === 'history-hydration') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <div className="space-y-2 text-center">
          <h3 className="text-xl font-medium">正在恢复这段对话</h3>
          <p className="text-sm text-muted-foreground">消息会在几秒内加载完成。</p>
        </div>
        <div className="space-y-4">
          <div className="ml-auto w-full max-w-xl space-y-3 rounded-3xl bg-primary/8 px-5 py-4">
            <div className="h-4 w-3/4 rounded-full bg-primary/15" />
            <div className="h-4 w-2/3 rounded-full bg-primary/10" />
          </div>
          <div className="w-full max-w-2xl space-y-3 rounded-3xl border border-border/60 bg-card px-5 py-4 shadow-sm">
            <div className="h-4 w-5/6 rounded-full bg-muted" />
            <div className="h-4 w-3/4 rounded-full bg-muted/80" />
            <div className="h-4 w-2/3 rounded-full bg-muted/70" />
          </div>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center p-8">
        <div className="max-w-md space-y-4">
          <h3 className="text-xl font-medium">{emptyState.title}</h3>
          <p className="text-muted-foreground">
            {emptyState.description}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full px-4 pb-[120px]">
      {/* spacer 把消息推到底部，但不阻止向上滚动 */}
      <div className="flex-1" />
      {sortedMessages.map((message, index) => {
        const prevMessage = index > 0 ? sortedMessages[index - 1] : null;
        const isSameRole = prevMessage?.role === message.role;
        return (
          <div key={message.id} className={isSameRole ? 'mt-2' : index === 0 ? '' : 'mt-6'}>
            <ChatMessage
              message={message}
              isLastMessage={index === sortedMessages.length - 1}
              isStreaming={isStreaming && index === sortedMessages.length - 1 && message.role === 'assistant'}
              onRetry={onRetry}
              onEdit={onEdit}
              suggestedQuestions={index === lastAssistantIndex ? suggestedQuestions : []}
              isLoadingQuestions={index === lastAssistantIndex ? isLoadingQuestions : false}
              onSelectQuestion={onSelectQuestion}
              onRefreshQuestions={onRefreshQuestions}
            />
          </div>
        );
      })}
      
      {loading && !isStreaming && <LoadingIndicator />}

      {statusText ? (
        <div className="px-4 pb-2 text-xs text-muted-foreground">
          {statusText}
        </div>
      ) : null}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessageList;
