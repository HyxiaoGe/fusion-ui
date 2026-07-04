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
  chatInputRenderMock,
  chatMessageListMock,
  retryHydrationMock,
  sendMessageMock,
  stopStreamingMock,
  retryMessageMock,
  continueAgentRunMock,
  stopContinueAgentRunMock,
  clearQuestionsMock,
  fetchQuestionsMock,
  useConversationFilesState,
  deleteFileMock,
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
  chatInputRenderMock: vi.fn(),
  chatMessageListMock: vi.fn(),
  retryHydrationMock: vi.fn(),
  sendMessageMock: vi.fn(),
  stopStreamingMock: vi.fn(),
  retryMessageMock: vi.fn(),
  continueAgentRunMock: vi.fn(),
  stopContinueAgentRunMock: vi.fn(),
  clearQuestionsMock: vi.fn(),
  fetchQuestionsMock: vi.fn(),
  useConversationFilesState: {
    files: [] as any[],
    isLoading: false,
    error: null as string | null,
    refresh: vi.fn(),
    removeFile: vi.fn(),
  },
  deleteFileMock: vi.fn(),
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

vi.mock('@/hooks/useContinueAgentRun', () => ({
  useContinueAgentRun: () => ({
    continueAgentRun: continueAgentRunMock,
    stopContinueAgentRun: stopContinueAgentRunMock,
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

vi.mock('@/hooks/useConversationFiles', () => ({
  useConversationFiles: () => useConversationFilesState,
}));

vi.mock('@/lib/api/files', () => ({
  deleteFile: deleteFileMock,
}));

vi.mock('@/components/chat/ConversationFilesPanel', () => ({
  default: function MockConversationFilesPanel(props: any) {
    if (!props.open) {
      return null;
    }

    return (
      <div
        data-testid="conversation-files-panel"
        data-loading={props.isLoading ? 'true' : 'false'}
        data-error={props.error ?? ''}
        data-selected-ids={Array.from(props.selectedFileIds).join(',')}
      >
        <button type="button" onClick={() => props.onAddFile(props.files[0])}>加入资料</button>
        <button type="button" onClick={() => props.onDeleteFile(props.files[0].id)}>删除资料</button>
        <button type="button" onClick={props.onRefresh}>刷新资料</button>
      </div>
    );
  },
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
    onStopStreaming,
    onSendMessage,
    conversationAttachments = [],
    onRemoveConversationAttachment,
    onClearConversationAttachments,
    onUploadComplete,
  }: {
    activeChatId?: string;
    resetSignal?: string;
    onStopStreaming?: () => void;
    onSendMessage?: (content: string, attachments?: any[]) => void;
    conversationAttachments?: any[];
    onRemoveConversationAttachment?: (fileId: string) => void;
    onClearConversationAttachments?: () => void;
    onUploadComplete?: (files?: any[], uploadChatId?: string) => void;
  }) {
    chatInputRenderMock({
      activeChatId,
      resetSignal,
      conversationAttachments,
    });

    useEffect(() => {
      chatInputMountMock();
      return () => chatInputUnmountMock();
    }, []);

    return (
      <div
        data-testid="chat-input"
        data-active-chat-id={activeChatId}
        data-reset-signal={resetSignal}
        data-attachment-count={conversationAttachments.length}
      >
        <button type="button" onClick={onStopStreaming}>停止生成</button>
        <button type="button" onClick={() => onSendMessage?.('你好')}>发送消息</button>
        <button
          type="button"
          onClick={() => {
            onSendMessage?.(
              '带资料提问',
              conversationAttachments.map((attachment) => ({
                fileId: attachment.fileId,
                filename: attachment.filename,
                mimeType: attachment.mimetype,
                previewUrl: attachment.thumbnailUrl ?? undefined,
              }))
            );
            onClearConversationAttachments?.();
          }}
        >
          发送带资料消息
        </button>
        <button
          type="button"
          onClick={() => onRemoveConversationAttachment?.(conversationAttachments[0]?.fileId)}
        >
          移除已选资料
        </button>
        <button type="button" onClick={onClearConversationAttachments}>清空已选资料</button>
        <button type="button" onClick={() => onUploadComplete?.()}>上传完成</button>
        <button
          type="button"
          onClick={() =>
            onUploadComplete?.(
              [
                {
                  fileId: 'file-uploaded',
                  filename: 'uploaded.png',
                  mimetype: 'image/png',
                  size: 120,
                  thumbnailUrl: '/thumb.png',
                  status: 'processed',
                },
              ],
              'chat-a'
            )
          }
        >
          上传已处理资料
        </button>
        <button
          type="button"
          onClick={() =>
            onUploadComplete?.(
              [
                {
                  fileId: 'file-parsing',
                  filename: 'report.pdf',
                  mimetype: 'application/pdf',
                  size: 240,
                  thumbnailUrl: null,
                  status: 'parsing',
                },
              ],
              'chat-a'
            )
          }
        >
          上传解析中资料
        </button>
      </div>
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
    chatInputRenderMock.mockClear();
    chatMessageListMock.mockClear();
    retryHydrationMock.mockClear();
    sendMessageMock.mockClear();
    stopStreamingMock.mockClear();
    retryMessageMock.mockClear();
    continueAgentRunMock.mockClear();
    stopContinueAgentRunMock.mockClear();
    stopContinueAgentRunMock.mockResolvedValue(false);
    clearQuestionsMock.mockClear();
    fetchQuestionsMock.mockClear();
    suggestedQuestionsState.questions = [];
    suggestedQuestionsState.isLoading = false;
    streamState.isStreaming = false;
    streamState.conversationId = null;
    lastReadyConversationSnapshotState.value = null;
    transientCompletionState.visible = false;
    useConversationFilesState.files = [];
    useConversationFilesState.isLoading = false;
    useConversationFilesState.error = null;
    useConversationFilesState.refresh.mockClear();
    useConversationFilesState.removeFile.mockClear();
    deleteFileMock.mockReset();
    deleteFileMock.mockResolvedValue(undefined);
    window.sessionStorage.clear();
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

  it('向消息列表下发 continuation handler，点击后续跑同一条 assistant message', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [
      textMessage('user-1'),
      {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', id: 'answer-1', text: '旧回答' }],
        timestamp: 2,
      },
    ]));
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'user-1,assistant-1');
    });

    const lastMessageListProps = chatMessageListMock.mock.calls.at(-1)?.[0];
    lastMessageListProps.onContinueAgentRun('assistant-1', 'run-1');

    expect(continueAgentRunMock).toHaveBeenCalledWith({
      conversationId: 'chat-a',
      assistantMessageId: 'assistant-1',
      previousRunId: 'run-1',
    });
  });

  it('流式中不下发 continuation handler，避免显示继续入口', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [
      textMessage('user-1'),
      {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', id: 'answer-1', text: '旧回答' }],
        timestamp: 2,
      },
    ]));
    hydrationById.set('chat-a', { view: 'ready' });
    streamState.isStreaming = true;
    streamState.conversationId = 'chat-a';

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('message-list')).toHaveAttribute('data-message-ids', 'user-1,assistant-1');
    });

    const lastMessageListProps = chatMessageListMock.mock.calls.at(-1)?.[0];
    expect(lastMessageListProps.onContinueAgentRun).toBeUndefined();
    expect(continueAgentRunMock).not.toHaveBeenCalled();
  });

  it('停止按钮优先停止 continuation stream，不误走普通发送 stop', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    streamState.isStreaming = true;
    streamState.conversationId = 'chat-a';
    stopContinueAgentRunMock.mockResolvedValue(true);

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-active-chat-id', 'chat-a');
    });
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    await waitFor(() => {
      expect(stopContinueAgentRunMock).toHaveBeenCalledTimes(1);
    });
    expect(stopStreamingMock).not.toHaveBeenCalled();
  });

  it('非 continuation stream 停止时回退普通发送 stop', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    streamState.isStreaming = true;
    streamState.conversationId = 'chat-a';
    stopContinueAgentRunMock.mockResolvedValue(false);

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-active-chat-id', 'chat-a');
    });
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    await waitFor(() => {
      expect(stopStreamingMock).toHaveBeenCalledTimes(1);
    });
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

  it('打开会话资料面板后把已选资料传给 ChatInput', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    useConversationFilesState.files = [
      {
        id: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        size: 100,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];
    useConversationFilesState.isLoading = true;
    useConversationFilesState.error = '暂时不可用';

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-loading', 'true');
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-error', '暂时不可用');
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-selected-ids', '');

    fireEvent.click(screen.getByText('加入资料'));

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-selected-ids', 'file-1');

    fireEvent.click(screen.getByText('移除已选资料'));
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-selected-ids', '');
    expect(deleteFileMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('加入资料'));
    fireEvent.click(screen.getByText('清空已选资料'));
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-selected-ids', '');
  });

  it('没有会话资料和已选资料时隐藏资料入口', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    expect(screen.queryByRole('button', { name: '打开会话资料' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));
    expect(screen.getByRole('button', { name: '打开会话资料' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '移除已选资料' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '打开会话资料' })).toBeNull();
    });
  });

  it('再次点击会话资料按钮时关闭资料面板', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    useConversationFilesState.files = [
      {
        id: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        size: 100,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    expect(screen.getByTestId('conversation-files-panel')).toBeInTheDocument();

    const closeFilesPanelButton = screen.getByRole('button', { name: '关闭会话资料' });
    expect(closeFilesPanelButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(closeFilesPanelButton);
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
  });

  it('删除会话资料时同步移除 composer 已选资料', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    useConversationFilesState.files = [
      {
        id: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        size: 100,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    fireEvent.click(screen.getByText('加入资料'));
    fireEvent.click(screen.getByText('删除资料'));

    await waitFor(() => {
      expect(deleteFileMock).toHaveBeenCalledWith('file-1');
    });
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-1');
    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    });
  });

  it('切换会话时清空已选会话资料', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    conversationsById.set('chat-b', createConversation('chat-b', [textMessage('message-b')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'ready' });
    useConversationFilesState.files = [
      {
        id: 'file-1',
        filename: 'diagram.png',
        mimetype: 'image/png',
        size: 100,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    fireEvent.click(screen.getByText('加入资料'));
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');

    currentRoute.chatId = 'chat-b';
    rerender(<ChatPage />);

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    const chatBRenders = chatInputRenderMock.mock.calls.filter(
      ([props]) => props.activeChatId === 'chat-b'
    );
    expect(chatBRenders.length).toBeGreaterThan(0);
    expect(chatBRenders.every(([props]) => props.conversationAttachments.length === 0)).toBe(true);
  });

  it('上传或发送完成后刷新会话资料', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传完成' }));
    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
    const sendOptions = sendMessageMock.mock.calls.at(-1)?.[1];
    sendOptions.onStreamEnd('chat-a');

    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(2);
  });

  it('已有会话上传已处理文件后只加入本次提问，不自动打开资料面板', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));

    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');
  });

  it('已有会话上传已处理文件后移除附件会删除会话资料并更新本地列表', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');

    fireEvent.click(screen.getByRole('button', { name: '移除已选资料' }));

    await waitFor(() => {
      expect(deleteFileMock).toHaveBeenCalledWith('file-uploaded');
    });
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-uploaded');
    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    });
  });

  it('发送带资料消息时打开会话资料面板', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');

    fireEvent.click(screen.getByRole('button', { name: '发送带资料消息' }));

    expect(sendMessageMock).toHaveBeenCalledWith(
      '带资料提问',
      expect.objectContaining({ conversationId: 'chat-a' }),
      [
        {
          fileId: 'file-uploaded',
          filename: 'uploaded.png',
          mimeType: 'image/png',
          previewUrl: '/thumb.png',
        },
      ]
    );
    expect(screen.getByTestId('conversation-files-panel')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-selected-ids', '');
  });

  it('从新对话发送资料后进入会话页时自动打开一次资料面板', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });
    window.sessionStorage.setItem('fusion:open-files-panel:chat-a', '1');

    render(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('conversation-files-panel')).toBeInTheDocument();
    });
    expect(window.sessionStorage.getItem('fusion:open-files-panel:chat-a')).toBeNull();
  });

  it('已有会话上传解析中文件后等待资料刷新为 processed 再加入本次提问', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传解析中资料' }));

    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');

    useConversationFilesState.files = [
      {
        id: 'file-parsing',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        size: 240,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];
    rerender(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');
    });
    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-selected-ids', 'file-parsing');
  });

  it('已有会话上传解析中文件失败后不会被旧 pending 状态再次自动加入', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传解析中资料' }));

    useConversationFilesState.files = [
      {
        id: 'file-parsing',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        size: 240,
        created_at: '2026-07-03T10:00:00Z',
        status: 'error',
        error_message: '解析失败',
      },
    ];
    rerender(<ChatPage />);

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();

    useConversationFilesState.files = [
      {
        id: 'file-parsing',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        size: 240,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];
    rerender(<ChatPage />);

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
  });

  it('删除仍在解析的上传资料后不会被旧 pending 状态自动加入', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传解析中资料' }));

    useConversationFilesState.files = [
      {
        id: 'file-parsing',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        size: 240,
        created_at: '2026-07-03T10:00:00Z',
        status: 'parsing',
        error_message: null,
      },
    ];
    rerender(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    fireEvent.click(screen.getByText('删除资料'));

    await waitFor(() => {
      expect(deleteFileMock).toHaveBeenCalledWith('file-parsing');
    });
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-parsing');

    useConversationFilesState.files = [
      {
        id: 'file-parsing',
        filename: 'report.pdf',
        mimetype: 'application/pdf',
        size: 240,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];
    rerender(<ChatPage />);

    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-selected-ids', '');
  });

  it('旧会话流结束时不刷新当前会话资料', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    conversationsById.set('chat-b', createConversation('chat-b', [textMessage('message-b')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
    const sendOptions = sendMessageMock.mock.calls.at(-1)?.[1];
    useConversationFilesState.refresh.mockClear();
    fetchQuestionsMock.mockClear();

    currentRoute.chatId = 'chat-b';
    rerender(<ChatPage />);

    sendOptions.onStreamEnd('chat-a');

    expect(useConversationFilesState.refresh).not.toHaveBeenCalled();
    expect(fetchQuestionsMock).not.toHaveBeenCalled();
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
