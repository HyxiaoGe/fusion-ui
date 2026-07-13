'use client';

import type { Message } from '@/types/conversation';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { clearStreamError } from '@/redux/slices/streamSlice';
import LoadingIndicator from '../ui/loading-indicator';
import { Button } from '../ui/button';
import ChatMessage from './ChatMessage';
import StreamErrorCard from './StreamErrorCard';
import ChatLoadingSurface from './ChatLoadingSurface';
import { isNearBottom } from '@/lib/chat/scrollBehavior';
import type { AgentRunState } from '@/types/agentRun';
import { selectChatModel } from '@/redux/selectors';
import { useRenderProbe } from '@/lib/debug/perfProbe';

interface ChatMessageListProps {
  messages: Message[];
  conversationId?: string | null;
  loading?: boolean;
  isStreaming?: boolean;
  loadingState?: 'default' | 'history-hydration';
  onRetry?: (messageId: string) => void;
  onContinueAgentRun?: (messageId: string, previousRunId?: string) => void;
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

interface JumpButtonPosition {
  right: number;
  bottom: number;
}

interface AwayFromBottomState {
  conversationId: string | null;
  isAway: boolean;
}

const DEFAULT_EMPTY_STATE = {
  title: '开始一个新对话',
  description: '输入你的问题，开始与 AI 助手对话...',
};

const EMPTY_SUGGESTED_QUESTIONS: string[] = [];

interface ChatMessageRowProps {
  message: Message;
  previousRole: Message['role'] | null;
  isFirstMessage: boolean;
  isLastMessage: boolean;
  isStreamingMessage: boolean;
  onRetry?: (messageId: string) => void;
  onContinueAgentRun?: (messageId: string, previousRunId?: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  conversationId: string | null;
  providerId?: string;
  modelName: string;
  currentRun: AgentRunState | null;
  suggestedQuestions: string[];
  isLoadingQuestions: boolean;
  onSelectQuestion?: (question: string) => void;
  onRefreshQuestions?: () => void;
}

function getMessageRun(message: Message, currentRun: AgentRunState | null): AgentRunState | null {
  if (currentRun?.messageId === message.id || currentRun?.serverMessageId === message.id) {
    return currentRun;
  }
  return message.agent_run ?? null;
}

const ChatMessageRow = React.memo(function ChatMessageRow({
  message,
  previousRole,
  isFirstMessage,
  isLastMessage,
  isStreamingMessage,
  onRetry,
  onContinueAgentRun,
  onEdit,
  conversationId,
  providerId,
  modelName,
  currentRun,
  suggestedQuestions,
  isLoadingQuestions,
  onSelectQuestion,
  onRefreshQuestions,
}: ChatMessageRowProps) {
  const isSameRole = previousRole === message.role;

  return (
    <div className={isSameRole ? 'mt-2' : isFirstMessage ? '' : 'mt-6'}>
      <ChatMessage
        message={message}
        isLastMessage={isLastMessage}
        isStreaming={isStreamingMessage}
        onRetry={onRetry}
        onContinueAgentRun={onContinueAgentRun}
        onEdit={onEdit}
        activeChatId={conversationId}
        providerId={providerId}
        modelName={modelName}
        agentRun={getMessageRun(message, currentRun)}
        suggestedQuestions={suggestedQuestions}
        isLoadingQuestions={isLoadingQuestions}
        onSelectQuestion={onSelectQuestion}
        onRefreshQuestions={onRefreshQuestions}
      />
    </div>
  );
}, areChatMessageRowPropsEqual);

function areChatMessageRowPropsEqual(prev: ChatMessageRowProps, next: ChatMessageRowProps): boolean {
  return prev.message === next.message
    && prev.previousRole === next.previousRole
    && prev.isFirstMessage === next.isFirstMessage
    && prev.isLastMessage === next.isLastMessage
    && prev.isStreamingMessage === next.isStreamingMessage
    && prev.onRetry === next.onRetry
    && prev.onContinueAgentRun === next.onContinueAgentRun
    && prev.onEdit === next.onEdit
    && prev.conversationId === next.conversationId
    && prev.providerId === next.providerId
    && prev.modelName === next.modelName
    && getMessageRun(prev.message, prev.currentRun) === getMessageRun(next.message, next.currentRun)
    && prev.suggestedQuestions === next.suggestedQuestions
    && prev.isLoadingQuestions === next.isLoadingQuestions
    && prev.onSelectQuestion === next.onSelectQuestion
    && prev.onRefreshQuestions === next.onRefreshQuestions;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({
  messages,
  conversationId = null,
  loading = false,
  isStreaming = false,
  loadingState = 'default',
  onRetry,
  onContinueAgentRun,
  onEdit,
  suggestedQuestions = EMPTY_SUGGESTED_QUESTIONS,
  isLoadingQuestions = false,
  onSelectQuestion,
  onRefreshQuestions,
  completionStateVisible = false,
  emptyState = DEFAULT_EMPTY_STATE,
}) => {
  useRenderProbe('ChatMessageList');
  const messageListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousConversationIdRef = useRef<string | null | undefined>(undefined);
  const previousScrollTopRef = useRef<number | null>(null);
  const [awayFromBottomState, setAwayFromBottomState] = useState<AwayFromBottomState>({
    conversationId,
    isAway: false,
  });
  const [jumpButtonPosition, setJumpButtonPosition] = useState<JumpButtonPosition | null>(null);
  const hasMessages = messages.length > 0;
  const isAwayFromBottom = awayFromBottomState.conversationId === conversationId
    && awayFromBottomState.isAway;

  const setIsAwayFromBottom = useCallback((isAway: boolean) => {
    setAwayFromBottomState((current) => (
      current.conversationId === conversationId && current.isAway === isAway
        ? current
        : { conversationId, isAway }
    ));
  }, [conversationId]);

  const lastAssistantIndex = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role !== 'assistant') {
      return -1;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') {
        return index;
      }
    }
    return -1;
  }, [messages]);

  // 滚动到底部
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const updateJumpButtonPosition = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      setJumpButtonPosition(null);
      return;
    }

    const rect = scrollContainer.getBoundingClientRect();
    const nextPosition = {
      right: Math.max(16, window.innerWidth - rect.right + 16),
      bottom: Math.max(16, window.innerHeight - rect.bottom + 16),
    };
    setJumpButtonPosition((current) => (
      current?.right === nextPosition.right && current.bottom === nextPosition.bottom
        ? current
        : nextPosition
    ));
  }, []);

  useEffect(() => {
    if (previousConversationIdRef.current !== conversationId) {
      previousConversationIdRef.current = conversationId;
      shouldStickToBottomRef.current = true;
      previousScrollTopRef.current = null;
      setIsAwayFromBottom(false);
    }
  }, [conversationId, setIsAwayFromBottom]);

  useEffect(() => {
    if (hasMessages) {
      return;
    }

    shouldStickToBottomRef.current = true;
    previousScrollTopRef.current = null;
    setIsAwayFromBottom(false);
  }, [hasMessages, setIsAwayFromBottom]);

  useEffect(() => {
    const scrollContainer = messagesEndRef.current?.closest('[data-chat-scroll-container="true"]') as HTMLElement | null;

    if (!scrollContainer) {
      scrollContainerRef.current = null;
      shouldStickToBottomRef.current = true;
      previousScrollTopRef.current = null;
      setIsAwayFromBottom(false);
      setJumpButtonPosition(null);
      return;
    }

    scrollContainerRef.current = scrollContainer;
    updateJumpButtonPosition();

    const updateStickiness = () => {
      const nearBottom = isNearBottom(scrollContainer);
      const previousScrollTop = previousScrollTopRef.current;
      const currentScrollTop = scrollContainer.scrollTop;

      if (nearBottom) {
        shouldStickToBottomRef.current = true;
        setIsAwayFromBottom(false);
      } else if (
        previousScrollTop !== null
        && currentScrollTop < previousScrollTop
      ) {
        // 只有向上滚动才视为用户主动离开底部；程序滚动始终向下，不会误伤 sticky 状态。
        shouldStickToBottomRef.current = false;
        setIsAwayFromBottom(true);
      } else if (!shouldStickToBottomRef.current) {
        setIsAwayFromBottom(true);
      }

      previousScrollTopRef.current = currentScrollTop;
    };

    previousScrollTopRef.current = scrollContainer.scrollTop;
    scrollContainer.addEventListener('scroll', updateStickiness, { passive: true });
    window.addEventListener('resize', updateJumpButtonPosition);

    return () => {
      scrollContainer.removeEventListener('scroll', updateStickiness);
      window.removeEventListener('resize', updateJumpButtonPosition);
      if (scrollContainerRef.current === scrollContainer) {
        scrollContainerRef.current = null;
      }
    };
  }, [conversationId, hasMessages, setIsAwayFromBottom, updateJumpButtonPosition]);

  const dispatch = useAppDispatch();
  const streamError = useAppSelector(state => state.stream.lastError);
  const currentRun = useAppSelector(state => state.stream.currentRun);
  const streamMessageId = useAppSelector(state => state.stream.messageId);
  const model = useAppSelector(state => selectChatModel(state, conversationId));
  const providerId = model?.provider;
  const modelName = model?.name ?? 'AI助手';
  const isStreamingForMessage = (message: Message, index: number): boolean => {
    if (!isStreaming || message.role !== 'assistant') {
      return false;
    }
    if (streamMessageId) {
      return message.id === streamMessageId
        || currentRun?.messageId === message.id
        || currentRun?.serverMessageId === message.id;
    }
    return index === messages.length - 1;
  };

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    if (shouldStickToBottomRef.current) {
      scrollToBottom('auto');
    }
  }, [conversationId, messages.length, isStreaming, scrollToBottom]);

  // 直接观察消息列表高度，覆盖正文、思考过程、Agent 卡片和异步高亮等任意内容增长。
  useEffect(() => {
    const messageList = messageListRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (!messageList || !scrollContainer || typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      if (shouldStickToBottomRef.current) {
        scrollToBottom('auto');
      }
      if (entries.some((entry) => entry.target === scrollContainer)) {
        updateJumpButtonPosition();
      }
    });
    resizeObserver.observe(messageList);
    resizeObserver.observe(scrollContainer);

    return () => resizeObserver.disconnect();
  }, [conversationId, hasMessages, scrollToBottom, updateJumpButtonPosition]);

  const handleJumpToBottom = useCallback(() => {
    shouldStickToBottomRef.current = true;
    setIsAwayFromBottom(false);
    scrollToBottom('auto');
  }, [scrollToBottom, setIsAwayFromBottom]);

  const statusText = useMemo(() => {
    if (messages.length === 0) return null;

    const lastMessage = messages[messages.length - 1];

    if (lastMessage.role === 'user' && lastMessage.status === 'failed') {
      return '发送失败，可重新发送';
    }

    if (isStreaming) {
      return null;
    }

    if (isLoadingQuestions || suggestedQuestions.length > 0) {
      return null;
    }

    if (completionStateVisible && lastMessage.role === 'assistant' && lastMessage.content?.length > 0) {
      return '本轮回复已完成';
    }

    return null;
  }, [completionStateVisible, isLoadingQuestions, isStreaming, messages, suggestedQuestions.length]);

  if (messages.length === 0 && loadingState === 'history-hydration') {
    return (
      <div data-testid="history-hydration-skeleton">
        <ChatLoadingSurface />
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
    <div ref={messageListRef} className="flex flex-col min-h-full px-4 pb-[120px]">
      {/* spacer 把消息推到底部，但不阻止向上滚动 */}
      <div className="flex-1" />
      {messages.map((message, index) => {
        const prevMessage = index > 0 ? messages[index - 1] : null;
        return (
          <ChatMessageRow
            key={message.id}
            message={message}
            previousRole={prevMessage?.role ?? null}
            isFirstMessage={index === 0}
            isLastMessage={index === messages.length - 1}
            isStreamingMessage={isStreamingForMessage(message, index)}
            onRetry={onRetry}
            onContinueAgentRun={onContinueAgentRun}
            onEdit={onEdit}
            conversationId={conversationId}
            providerId={providerId}
            modelName={modelName}
            currentRun={currentRun}
            suggestedQuestions={index === lastAssistantIndex ? suggestedQuestions : EMPTY_SUGGESTED_QUESTIONS}
            isLoadingQuestions={index === lastAssistantIndex ? isLoadingQuestions : false}
            onSelectQuestion={onSelectQuestion}
            onRefreshQuestions={onRefreshQuestions}
          />
        );
      })}
      
      {loading && !isStreaming && <LoadingIndicator />}

      {streamError && (
        <StreamErrorCard
          message={streamError.message}
          code={streamError.code}
          data={streamError.data}
          onDismiss={() => dispatch(clearStreamError())}
        />
      )}

      {statusText ? (
        <div className="px-4 pb-2 text-xs text-muted-foreground">
          {statusText}
        </div>
      ) : null}

      {isAwayFromBottom && jumpButtonPosition ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="fixed z-10 rounded-full bg-background/95 shadow-lg backdrop-blur"
          style={{
            right: jumpButtonPosition.right,
            bottom: jumpButtonPosition.bottom,
          }}
          aria-label={isStreaming ? '查看最新回复' : '回到底部'}
          onClick={handleJumpToBottom}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
      ) : null}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessageList;
