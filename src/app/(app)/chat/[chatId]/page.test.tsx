import React, { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, Message } from '@/types/conversation';

const {
  currentRoute,
  conversationsById,
  hydrationById,
  dispatchMock,
  routerPushMock,
  chatInputMountMock,
  chatInputUnmountMock,
  chatMessageListMock,
  retryHydrationMock,
  sendMessageMock,
  stopStreamingMock,
  retryMessageMock,
  clearQuestionsMock,
  fetchQuestionsMock,
  suggestedQuestionsState,
  streamState,
  lastReadyConversationSnapshotState,
  transientCompletionState,
} = vi.hoisted(() => ({
  currentRoute: { chatId: 'chat-a' },
  conversationsById: new Map<string, Conversation>(),
  hydrationById: new Map<string, { view: 'loading' | 'ready' | 'error'; error?: string }>(),
  lastReadyConversationSnapshotState: {
    value: null as { chatId: string; messages: Message[] } | null,
  },
  suggestedQuestionsState: {
    questions: [] as string[],
    isLoading: false,
  },
  streamState: {
    isStreaming: false,
    conversationId: null as string | null,
  },
  transientCompletionState: {
    visible: false,
  },
  dispatchMock: vi.fn(),
  routerPushMock: vi.fn(),
  chatInputMountMock: vi.fn(),
  chatInputUnmountMock: vi.fn(),
  chatMessageListMock: vi.fn(),
  retryHydrationMock: vi.fn(),
  sendMessageMock: vi.fn(),
  stopStreamingMock: vi.fn(),
  retryMessageMock: vi.fn(),
  clearQuestionsMock: vi.fn(),
  fetchQuestionsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ chatId: currentRoute.chatId }),
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({
      auth: { isAuthenticated: true },
      conversation: {
        globalError: null,
        lastReadyConversationSnapshot: lastReadyConversationSnapshotState.value,
      },
      stream: streamState,
    }),
}));

vi.mock('react-redux', () => ({
  useStore: () => ({
    getState: () => ({
      stream: {
        isStreaming: false,
        conversationId: null,
        isStreamingReasoning: false,
        contentBlocks: [],
      },
    }),
  }),
}));

vi.mock('@/redux/selectors', () => ({
  selectIsAuthenticated: (state: any) => state.auth.isAuthenticated,
}));

vi.mock('@/hooks/useConversation', () => ({
  useConversation: (chatId: string) => {
    const hydration = hydrationById.get(chatId) ?? { view: 'loading' as const };
    return {
      conversation: conversationsById.get(chatId),
      hydrationView: hydration.view,
      hydrationError: hydration.error,
      retryHydration: retryHydrationMock,
    };
  },
}));

vi.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: () => ({
    sendMessage: sendMessageMock,
    stopStreaming: stopStreamingMock,
    retryMessage: retryMessageMock,
  }),
}));

vi.mock('@/hooks/useSuggestedQuestions', () => ({
  useSuggestedQuestions: () => ({
    suggestedQuestions: suggestedQuestionsState.questions,
    isLoadingQuestions: suggestedQuestionsState.isLoading,
    fetchQuestions: fetchQuestionsMock,
    clearQuestions: clearQuestionsMock,
  }),
}));

vi.mock('@/hooks/useSuggestedQuestionContinuation', () => ({
  useSuggestedQuestionContinuation: () => vi.fn(),
}));

vi.mock('@/hooks/useTransientCompletionState', () => ({
  useTransientCompletionState: () => transientCompletionState.visible,
}));

vi.mock('@/lib/chat/suggestedQuestionTiming', () => ({
  shouldAutoFetchSuggestedQuestions: () => false,
}));

vi.mock('@/lib/api/streamStatus', () => ({
  fetchStreamStatus: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  reconnectStream: vi.fn(),
}));

vi.mock('@/lib/agent/finishReason', () => ({
  getRunStatusFromFinishReason: () => 'completed',
}));

vi.mock('@/redux/slices/conversationSlice', () => ({
  appendMessage: vi.fn((payload?: unknown) => ({ type: 'conversation/appendMessage', payload })),
  clearConversationMessages: vi.fn((payload?: unknown) => ({ type: 'conversation/clearConversationMessages', payload })),
  setLastReadyConversationSnapshot: vi.fn((payload?: unknown) => ({
    type: 'conversation/setLastReadyConversationSnapshot',
    payload,
  })),
  updateMessage: vi.fn((payload?: unknown) => ({ type: 'conversation/updateMessage', payload })),
}));

vi.mock('@/redux/slices/streamSlice', () => ({
  advanceTypewriter: vi.fn((payload?: unknown) => ({ type: 'stream/advanceTypewriter', payload })),
  appendTextDelta: vi.fn((payload?: unknown) => ({ type: 'stream/appendTextDelta', payload })),
  appendThinkingDelta: vi.fn((payload?: unknown) => ({ type: 'stream/appendThinkingDelta', payload })),
  completeThinkingPhase: vi.fn((payload?: unknown) => ({ type: 'stream/completeThinkingPhase', payload })),
  endStream: vi.fn((payload?: unknown) => ({ type: 'stream/endStream', payload })),
  finalizeRun: vi.fn((payload?: unknown) => ({ type: 'stream/finalizeRun', payload })),
  finalizeStep: vi.fn((payload?: unknown) => ({ type: 'stream/finalizeStep', payload })),
  finalizeToolCall: vi.fn((payload?: unknown) => ({ type: 'stream/finalizeToolCall', payload })),
  initRun: vi.fn((payload?: unknown) => ({ type: 'stream/initRun', payload })),
  markLimitReached: vi.fn((payload?: unknown) => ({ type: 'stream/markLimitReached', payload })),
  mergeToolCallDelta: vi.fn((payload?: unknown) => ({ type: 'stream/mergeToolCallDelta', payload })),
  pushStep: vi.fn((payload?: unknown) => ({ type: 'stream/pushStep', payload })),
  pushToolCall: vi.fn((payload?: unknown) => ({ type: 'stream/pushToolCall', payload })),
  selectFullStreamContentBlocks: () => [],
  setStreamStatus: vi.fn((payload?: unknown) => ({ type: 'stream/setStreamStatus', payload })),
  startStream: vi.fn((payload?: unknown) => ({ type: 'stream/startStream', payload })),
}));

vi.mock('@/components/chat/ChatInput', () => ({
  default: function MockChatInput({
    activeChatId,
    resetSignal,
  }: {
    activeChatId?: string;
    resetSignal?: string;
  }) {
    useEffect(() => {
      chatInputMountMock();
      return () => chatInputUnmountMock();
    }, []);

    return (
      <div
        data-testid="chat-input"
        data-active-chat-id={activeChatId}
        data-reset-signal={resetSignal}
      />
    );
  },
}));

vi.mock('@/components/lazy/LazyComponents', () => ({
  ChatMessageListLazy: (props: any) => {
    chatMessageListMock(props);
    return (
      <div
        data-testid="message-list"
        data-message-ids={props.messages.map((message: Message) => message.id).join(',')}
        data-loading-state={props.loadingState ?? ''}
      >
        {props.messages.length === 0 && props.loadingState === 'history-hydration'
          ? '正在加载这段对话'
          : null}
      </div>
    );
  },
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  default: () => null,
}));

import ChatPage from './page';

function createConversation(id: string, messages: Message[]): Conversation {
  return {
    id,
    title: id,
    model_id: 'model-1',
    createdAt: 1,
    updatedAt: 1,
    messages,
  };
}

function textMessage(id: string): Message {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', id: `${id}-block`, text: id }],
    timestamp: 1,
  };
}

function countSnapshotDispatches() {
  return dispatchMock.mock.calls.filter(
    ([action]) => action?.type === 'conversation/setLastReadyConversationSnapshot'
  ).length;
}

describe('ChatPage 会话切换体验', () => {
  beforeEach(() => {
    currentRoute.chatId = 'chat-a';
    conversationsById.clear();
    hydrationById.clear();
    dispatchMock.mockClear();
    dispatchMock.mockImplementation((action: { type?: string; payload?: unknown }) => {
      if (action?.type === 'conversation/setLastReadyConversationSnapshot') {
        lastReadyConversationSnapshotState.value = action.payload as { chatId: string; messages: Message[] };
      }
      return action;
    });
    routerPushMock.mockClear();
    chatInputMountMock.mockClear();
    chatInputUnmountMock.mockClear();
    chatMessageListMock.mockClear();
    retryHydrationMock.mockClear();
    sendMessageMock.mockClear();
    stopStreamingMock.mockClear();
    retryMessageMock.mockClear();
    clearQuestionsMock.mockClear();
    fetchQuestionsMock.mockClear();
    suggestedQuestionsState.questions = [];
    suggestedQuestionsState.isLoading = false;
    streamState.isStreaming = false;
    streamState.conversationId = null;
    lastReadyConversationSnapshotState.value = null;
    transientCompletionState.visible = false;
  });

  it('chatId 改变时不通过 key 重建 ChatInput', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    conversationsById.set('chat-b', createConversation('chat-b', [textMessage('message-b')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-active-chat-id', 'chat-a');
    });
    chatInputMountMock.mockClear();
    chatInputUnmountMock.mockClear();

    currentRoute.chatId = 'chat-b';
    rerender(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-active-chat-id', 'chat-b');
    });
    expect(chatInputUnmountMock).not.toHaveBeenCalled();
    expect(chatInputMountMock).not.toHaveBeenCalled();
  });

  it('从已有内容切到未加载过的 loading 会话时不显示上一段 ready messages', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'loading' });

    const { rerender } = render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'message-a');
    });
    chatInputMountMock.mockClear();
    chatInputUnmountMock.mockClear();

    currentRoute.chatId = 'chat-b';
    rerender(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', '');
    });
    expect(screen.getByText('正在加载这段对话')).toBeInTheDocument();
    const lastMessageListProps = chatMessageListMock.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps?.messages).toEqual([]);
    expect(lastMessageListProps?.loadingState).toBe('history-hydration');
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-active-chat-id', 'chat-b');
    expect(chatInputUnmountMock).not.toHaveBeenCalled();
    expect(chatInputMountMock).not.toHaveBeenCalled();
  });

  it('同一会话重新进入 loading 时仍保留该会话 snapshot 内容', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'message-a');
    });

    conversationsById.delete('chat-a');
    hydrationById.set('chat-a', { view: 'loading' });
    rerender(<ChatPage />);

    const lastMessageListProps = chatMessageListMock.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps?.messages).toEqual([expect.objectContaining({ id: 'message-a' })]);
    expect(lastMessageListProps?.loadingState).toBeUndefined();
  });

  it('动态 page remount 后切到未加载过的 loading 会话时不显示上一段 ready messages', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'loading' });

    const { unmount } = render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'message-a');
    });

    unmount();
    currentRoute.chatId = 'chat-b';
    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', '');
    });
    expect(screen.getByText('正在加载这段对话')).toBeInTheDocument();
  });

  it('ready 会话只有元数据变化且 messages 引用不变时不重复写 snapshot', async () => {
    const messages = [textMessage('message-a')];
    conversationsById.set('chat-a', createConversation('chat-a', messages));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    await waitFor(() => {
      expect(countSnapshotDispatches()).toBe(1);
    });

    conversationsById.set('chat-a', {
      ...createConversation('chat-a', messages),
      title: 'chat-a-renamed',
      updatedAt: 2,
    });
    rerender(<ChatPage />);

    expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'message-a');
    expect(countSnapshotDispatches()).toBe(1);
  });

  it('过渡态旧消息只读，不下发会误用当前 chatId 的重试回调', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'loading' });

    const { rerender } = render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'message-a');
    });

    currentRoute.chatId = 'chat-b';
    rerender(<ChatPage />);

    const lastMessageListProps = chatMessageListMock.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps?.messages).toEqual([]);
    expect(lastMessageListProps?.loadingState).toBe('history-hydration');
    expect(lastMessageListProps?.onRetry).toBeUndefined();
  });

  it('过渡态屏蔽当前会话的建议问题、完成态和流式状态', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'loading' });
    suggestedQuestionsState.questions = ['继续问'];
    suggestedQuestionsState.isLoading = true;
    streamState.isStreaming = true;
    streamState.conversationId = 'chat-b';
    transientCompletionState.visible = true;

    const { rerender } = render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'message-a');
    });

    currentRoute.chatId = 'chat-b';
    rerender(<ChatPage />);

    const lastMessageListProps = chatMessageListMock.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps?.messages).toEqual([]);
    expect(lastMessageListProps?.loadingState).toBe('history-hydration');
    expect(lastMessageListProps?.suggestedQuestions).toEqual([]);
    expect(lastMessageListProps?.isLoadingQuestions).toBe(false);
    expect(lastMessageListProps?.completionStateVisible).toBe(false);
    expect(lastMessageListProps?.isStreaming).toBe(false);
  });

  it('同一会话无关状态变化时保持 ChatMessageList 的 emptyState 引用稳定', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'message-a');
    });

    const firstProps = chatMessageListMock.mock.calls.at(-1)?.[0];
    transientCompletionState.visible = true;
    rerender(<ChatPage />);
    const secondProps = chatMessageListMock.mock.calls.at(-1)?.[0];

    expect(secondProps.emptyState).toBe(firstProps.emptyState);
  });

  it('hydration error 时点击返回首页进入 /chat/new', () => {
    hydrationById.set('chat-a', { view: 'error', error: '加载失败' });

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));

    expect(routerPushMock).toHaveBeenCalledWith('/chat/new');
  });

  it('conversation missing 时点击返回首页进入 /chat/new', () => {
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));

    expect(routerPushMock).toHaveBeenCalledWith('/chat/new');
  });
});
