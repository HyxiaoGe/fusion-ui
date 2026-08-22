import React, { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, Message } from '@/types/conversation';
import type { StreamCallbacks } from '@/lib/api/chat';
import type { NormalizedTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import trajectoryReducer, {
  trajectoryRunListReceived,
  trajectoryRunListRequested,
  trajectorySnapshotReceived,
  trajectorySnapshotRequested,
} from '@/redux/slices/trajectorySlice';
import type { TrajectoryRunSummary, TrajectorySnapshot } from '@/types/trajectory';
import {
  CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY,
  CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY,
  CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
} from '@/lib/chat/contextStatusPersistence';

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
  refreshTrajectoryRunsMock,
  continueAgentRunMock,
  stopContinueAgentRunMock,
  clearQuestionsMock,
  fetchQuestionsMock,
  useConversationFilesState,
  deleteFileMock,
  suggestedQuestionsState,
  streamState,
  storeStreamState,
  lastReadyConversationSnapshotState,
  transientCompletionState,
  filesPanelRenderMock,
  fetchStreamStatusMock,
  reconnectStreamMock,
  stopRecoveredStreamMock,
  getChatCapabilitiesMock,
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
  storeStreamState: {
    isStreaming: false,
    conversationId: null as string | null,
    messageId: null as string | null,
    isStreamingReasoning: false,
    contentBlocks: [] as any[],
  },
  transientCompletionState: {
    visible: false,
  },
  filesPanelRenderMock: vi.fn(),
  fetchStreamStatusMock: vi.fn(),
  reconnectStreamMock: vi.fn(),
  stopRecoveredStreamMock: vi.fn(),
  getChatCapabilitiesMock: vi.fn(),
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
  refreshTrajectoryRunsMock: vi.fn(),
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
      auth: {
        isAuthenticated: true,
        user: { id: 'user-a' },
        token: 'token-a',
      },
      conversation: {
        globalError: null,
        lastReadyConversationSnapshot: lastReadyConversationSnapshotState.value,
        byId: Object.fromEntries(conversationsById),
      },
      models: {
        models: [{
          id: 'model-1',
          name: 'Model One',
          provider: 'test',
          enabled: true,
          routable: true,
          temperature: 0.7,
          capabilities: {},
        }],
        providers: [],
        selectedModelId: 'model-1',
        isLoading: false,
        loadStatus: 'ready',
      },
      stream: streamState,
      trajectory: trajectoryState,
    }),
}));

vi.mock('react-redux', () => ({
  useStore: () => ({
    getState: () => ({
      conversation: {
        byId: Object.fromEntries(conversationsById),
      },
      stream: storeStreamState,
      trajectory: trajectoryState,
    }),
  }),
}));

vi.mock('@/redux/selectors', () => ({
  selectIsAuthenticated: (state: any) => state.auth.isAuthenticated,
  selectAuthSessionKey: (state: any) => (
    state.auth.isAuthenticated
      ? state.auth.user?.id ?? state.auth.token ?? null
      : null
  ),
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
  useSuggestedQuestionContinuation: ({
    canContinue,
    sendMessage,
  }: {
    canContinue: boolean;
    sendMessage: (question: string) => void;
  }) => (
    (question: string) => {
      if (canContinue) sendMessage(question.trim());
    }
  ),
}));

vi.mock('@/hooks/useTransientCompletionState', () => ({
  useTransientCompletionState: () => transientCompletionState.visible,
}));

vi.mock('@/hooks/useConversationFiles', () => ({
  useConversationFiles: () => useConversationFilesState,
}));

vi.mock('@/hooks/useConversationTrajectory', () => ({
  useConversationTrajectory: (conversationId: string | null) => {
    const conversation = conversationId
      ? trajectoryState.byConversationId[conversationId]
      : undefined;
    return {
      runs: conversation?.runs ?? [],
      runSummariesById: conversation?.runSummariesById ?? {},
      snapshotsByRunId: conversation?.snapshotsByRunId ?? {},
      liveEventsByRunId: conversation?.liveEventsByRunId ?? {},
      runListStatus: conversation?.runListStatus ?? 'idle',
      runListError: conversation?.runListError ?? null,
      runsTruncated: conversation?.runsTruncated ?? false,
      selectedMessageId: conversation?.selectedMessageId ?? null,
      selectedRunId: conversation?.selectedRunId ?? null,
      selectedSpanId: conversation?.selectedSpanId ?? null,
      selectionSource: conversation?.selectionSource ?? 'none',
      activeSurface: conversation?.activeSurface ?? 'chat',
      scrollMode: conversation?.scrollMode ?? 'follow-live',
      isInspectorOpen: conversation?.isInspectorOpen ?? false,
      inspectRequest: conversation?.inspectRequest ?? null,
      snapshot: conversation?.selectedRunId
        ? conversation.snapshotsByRunId[conversation.selectedRunId]
        : undefined,
      reconciliation: conversation?.selectedRunId
        ? conversation.reconciliationByRunId[conversation.selectedRunId]
        : undefined,
      refreshRuns: refreshTrajectoryRunsMock,
      retrySelectedSnapshot: vi.fn(),
    };
  },
}));

vi.mock('@/lib/api/files', () => ({
  deleteFile: deleteFileMock,
}));

vi.mock('@/components/chat/ConversationFilesPanel', () => ({
  default: function MockConversationFilesPanel(props: any) {
    if (!props.open) {
      return null;
    }
    filesPanelRenderMock(currentRoute.chatId);

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

vi.mock('@/lib/api/streamStatus', () => ({
  fetchStreamStatus: fetchStreamStatusMock,
}));

vi.mock('@/lib/api/chat', () => ({
  getChatCapabilities: getChatCapabilitiesMock,
  reconnectStream: reconnectStreamMock,
  stopStream: stopRecoveredStreamMock,
  isRecoverableStreamError: (error: unknown) => (
    typeof error === 'object' && error !== null && (error as { recoverable?: boolean }).recoverable === true
  ),
}));

vi.mock('@/lib/agent/finishReason', () => ({
  getRunStatusFromFinishReason: () => 'completed',
}));

vi.mock('@/redux/slices/conversationSlice', () => ({
  applySuggestedQuestionsPending: vi.fn((payload?: unknown) => ({
    type: 'conversation/applySuggestedQuestionsPending',
    payload,
  })),
  appendMessage: vi.fn((payload?: unknown) => ({ type: 'conversation/appendMessage', payload })),
  clearConversationMessages: vi.fn((payload?: unknown) => ({ type: 'conversation/clearConversationMessages', payload })),
  setLastReadyConversationSnapshot: vi.fn((payload?: unknown) => ({
    type: 'conversation/setLastReadyConversationSnapshot',
    payload,
  })),
  removeMessage: vi.fn((payload?: unknown) => ({ type: 'conversation/removeMessage', payload })),
  requestSuggestedQuestionsObservation: vi.fn((payload?: unknown) => ({
    type: 'conversation/requestSuggestedQuestionsObservation',
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
  selectFullStreamContentBlocks: (state: { contentBlocks?: any[] }) => state.contentBlocks ?? [],
  setStreamStatus: vi.fn((payload?: unknown) => ({ type: 'stream/setStreamStatus', payload })),
  startStream: vi.fn((payload?: unknown) => ({ type: 'stream/startStream', payload })),
}));

vi.mock('@/components/chat/ChatInput', () => ({
  default: function MockChatInput({
    activeChatId,
    resetSignal,
    disabled,
    onStopStreaming,
    onSendMessage,
    conversationAttachments = [],
    onRemoveConversationAttachment,
    onClearConversationAttachments,
    onUploadComplete,
    initialKnowledgeBaseIds = [],
    onKnowledgeBaseIdsChange,
    onKnowledgeSelectionStatusChange,
  }: {
    activeChatId?: string;
    resetSignal?: string;
    disabled?: boolean;
    onStopStreaming?: () => void;
    onSendMessage?: (content: string, attachments?: any[]) => void;
    conversationAttachments?: any[];
    onRemoveConversationAttachment?: (fileId: string) => void;
    onClearConversationAttachments?: () => void;
    onUploadComplete?: (files?: any[], uploadChatId?: string) => void;
    initialKnowledgeBaseIds?: string[];
    onKnowledgeBaseIdsChange?: (ids: string[]) => void;
    onKnowledgeSelectionStatusChange?: (status: 'ready' | 'unavailable') => void;
  }) {
    chatInputRenderMock({
      activeChatId,
      resetSignal,
      disabled,
      conversationAttachments,
      initialKnowledgeBaseIds,
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
        data-disabled={disabled ? 'true' : 'false'}
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
        <button type="button" onClick={() => onKnowledgeBaseIdsChange?.(['kb-new'])}>
          改选知识库
        </button>
        <button type="button" onClick={() => onKnowledgeSelectionStatusChange?.('unavailable')}>
          标记知识库不可用
        </button>
        <button type="button" onClick={() => onKnowledgeSelectionStatusChange?.('ready')}>
          标记知识库可用
        </button>
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
                  fileId: 'file-pending-image',
                  filename: 'report.png',
                  mimetype: 'image/png',
                  size: 240,
                  thumbnailUrl: '/pending-thumb.png',
                  status: 'parsing',
                },
              ],
              'chat-a'
            )
          }
        >
          上传待刷新图片资料
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
        {props.messages.map((message: Message) => (
          <div
            key={message.id}
            id={`chat-message-${message.id}`}
            data-chat-message-id={message.id}
            tabIndex={-1}
          />
        ))}
        {props.messages.length === 0 && props.loadingState === 'history-hydration'
          ? '正在加载这段对话'
          : null}
        {props.suggestedQuestions[0] && props.onSelectQuestion ? (
          <button type="button" onClick={() => props.onSelectQuestion(props.suggestedQuestions[0])}>
            选择推荐问题
          </button>
        ) : null}
        {props.onRetry && props.messages[0] ? (
          <button type="button" onClick={() => props.onRetry(props.messages[0].id)}>
            重试消息
          </button>
        ) : null}
        {props.onInspectTrajectory ? props.messages
          .filter((message: Message) => message.role === 'assistant' && message.agent_run)
          .map((message: Message) => (
            <button
              key={`inspect-${message.id}`}
              type="button"
              onClick={() => props.onInspectTrajectory(message.id, message.agent_run!.runId)}
            >
              查看 {message.id} 的轨迹
            </button>
          )) : null}
      </div>
    );
  },
}));

vi.mock('@/components/chat/LocationContextBanner', () => ({
  default: ({ conversationId }: { conversationId: string | null }) => (
    <div data-testid="location-context-banner" data-conversation-id={conversationId ?? ''} />
  ),
}));

vi.mock('@/components/ui/confirm-dialog', () => ({
  default: () => null,
}));

import ChatPage from './page';

let trajectoryState = trajectoryReducer(undefined, { type: '@@init' });

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

function recoveredTrajectoryEvent(): NormalizedTrajectoryEvent {
  return {
    runId: 'run-recovered',
    sequence: 0,
    eventType: 'run_started',
    schemaVersion: 1,
    timestamp: '2026-08-22T00:00:00.000Z',
    stepId: null,
    toolCallId: null,
    parentStepId: null,
    traceId: 'trace-recovered',
    payload: { conversation_id: 'chat-a', message_id: 'assistant-1' },
  };
}

function trajectoryRun(runId = 'run-1'): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: 'assistant-1',
    turn_message_id: 'user-1',
    attempt_index: 0,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 0,
    duration_ms: 120,
    started_at: '2026-08-22T00:00:00.000Z',
    ended_at: '2026-08-22T00:00:00.120Z',
  };
}

function trajectorySnapshot(run = trajectoryRun()): TrajectorySnapshot {
  return {
    run,
    records: [{
      sequence: 0,
      event_type: 'run_started',
      schema_version: 1,
      timestamp: run.started_at,
      step_id: null,
      tool_call_id: null,
      parent_step_id: null,
      trace_id: run.run_id,
      span_id: null,
      payload: { conversation_id: 'chat-a', message_id: 'assistant-1' },
    }],
    spans: [],
    completeness: {
      status: 'complete',
      degraded_reason: null,
      event_count: 1,
      expected_last_sequence: 0,
      loaded_event_count: 1,
      first_sequence: 0,
      last_sequence: 0,
    },
    truncated: false,
  };
}

function primeTrajectory(run = trajectoryRun()) {
  trajectoryState = trajectoryReducer(trajectoryState, trajectoryRunListRequested({
    conversationId: 'chat-a',
    requestId: 'runs-1',
  }));
  trajectoryState = trajectoryReducer(trajectoryState, trajectoryRunListReceived({
    conversationId: 'chat-a',
    requestId: 'runs-1',
    response: { items: [run], truncated: false },
  }));
  trajectoryState = trajectoryReducer(trajectoryState, trajectorySnapshotRequested({
    conversationId: 'chat-a',
    runId: run.run_id,
    requestId: 'snapshot-1',
    purpose: 'hydrate',
  }));
  trajectoryState = trajectoryReducer(trajectoryState, trajectorySnapshotReceived({
    conversationId: 'chat-a',
    requestId: 'snapshot-1',
    snapshot: trajectorySnapshot(run),
  }));
}

function activateConversationTab(name: '聊天' | '轨迹') {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
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
    trajectoryState = trajectoryReducer(undefined, { type: '@@init' });
    dispatchMock.mockClear();
    dispatchMock.mockImplementation((action: { type?: string; payload?: unknown }) => {
      trajectoryState = trajectoryReducer(trajectoryState, action as never);
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
    filesPanelRenderMock.mockClear();
    retryHydrationMock.mockClear();
    sendMessageMock.mockClear();
    stopStreamingMock.mockClear();
    retryMessageMock.mockClear();
    refreshTrajectoryRunsMock.mockReset();
    refreshTrajectoryRunsMock.mockResolvedValue('ready');
    continueAgentRunMock.mockClear();
    stopContinueAgentRunMock.mockClear();
    stopContinueAgentRunMock.mockResolvedValue(false);
    clearQuestionsMock.mockClear();
    fetchQuestionsMock.mockClear();
    suggestedQuestionsState.questions = [];
    suggestedQuestionsState.isLoading = false;
    streamState.isStreaming = false;
    streamState.conversationId = null;
    storeStreamState.isStreaming = false;
    storeStreamState.conversationId = null;
    storeStreamState.messageId = null;
    storeStreamState.isStreamingReasoning = false;
    storeStreamState.contentBlocks = [];
    lastReadyConversationSnapshotState.value = null;
    transientCompletionState.visible = false;
    useConversationFilesState.files = [];
    useConversationFilesState.isLoading = false;
    useConversationFilesState.error = null;
    useConversationFilesState.refresh.mockClear();
    useConversationFilesState.removeFile.mockClear();
    deleteFileMock.mockReset();
    deleteFileMock.mockResolvedValue(undefined);
    fetchStreamStatusMock.mockReset();
    fetchStreamStatusMock.mockResolvedValue({ status: 'not_found' });
    reconnectStreamMock.mockReset();
    stopRecoveredStreamMock.mockReset();
    stopRecoveredStreamMock.mockResolvedValue(true);
    getChatCapabilitiesMock.mockReset();
    getChatCapabilitiesMock.mockResolvedValue({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
      message_retry_v1: true,
    });
    window.sessionStorage.clear();
  });

  it('以受控 Chat 和 Trajectory 双 Tab 装配会话正文且只有一个 Composer', () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    expect(screen.getByRole('tab', { name: '聊天' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: '轨迹' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByTestId('chat-input')).toHaveLength(1);
  });

  it('切换 Trajectory 不重建 Composer、不终止流且发送后仍停留在 Trajectory', () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);
    chatInputMountMock.mockClear();
    chatInputUnmountMock.mockClear();
    dispatchMock.mockClear();

    activateConversationTab('轨迹');
    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'trajectory/setTrajectoryActiveSurface',
      payload: { conversationId: 'chat-a', surface: 'trajectory' },
    }));
    rerender(<ChatPage />);

    expect(screen.getByRole('tab', { name: '轨迹' })).toHaveAttribute('aria-selected', 'true');
    expect(chatInputMountMock).not.toHaveBeenCalled();
    expect(chatInputUnmountMock).not.toHaveBeenCalled();
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/endStream')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
    rerender(<ChatPage />);

    expect(sendMessageMock).toHaveBeenCalledWith(
      '你好',
      expect.objectContaining({ conversationId: 'chat-a' }),
      undefined,
    );
    expect(screen.getByRole('tab', { name: '轨迹' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('chat-input')).toHaveLength(1);
  });

  it('同会话 Tab 往返保留轨迹选择、滚动和检查器实例', () => {
    const assistant: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [{ type: 'text', id: 'answer-1', text: '回答' }],
      timestamp: 2,
      agent_run: {
        runId: 'run-1',
        messageId: 'assistant-1',
        status: 'completed',
        config: { maxSteps: 8, maxToolCalls: 16, timeoutS: 300 },
        totalSteps: 1,
        totalToolCalls: 0,
        steps: [],
        lastSequence: 0,
      },
    };
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1'), assistant]));
    hydrationById.set('chat-a', { view: 'ready' });
    primeTrajectory();

    const { rerender } = render(<ChatPage />);
    activateConversationTab('轨迹');
    rerender(<ChatPage />);

    const ledger = screen.getByRole('listbox', { name: '轨迹账本' });
    const runOption = screen.getByRole('option', { name: /执行.*已完成/i });
    fireEvent.click(runOption);
    Object.defineProperty(ledger, 'scrollTop', { configurable: true, writable: true, value: 56 });
    fireEvent.scroll(ledger);
    rerender(<ChatPage />);

    expect(screen.getByLabelText('轨迹检查器')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /执行.*已完成/i })).toHaveAttribute('aria-selected', 'true');

    activateConversationTab('聊天');
    rerender(<ChatPage />);
    activateConversationTab('轨迹');
    rerender(<ChatPage />);

    expect(screen.getByRole('listbox', { name: '轨迹账本' })).toBe(ledger);
    expect(ledger.scrollTop).toBe(56);
    expect(screen.getByLabelText('轨迹检查器')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /执行.*已完成/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('Chat 状态行 inspect 依次切 Tab、选 run、水合、定位高亮并原子完成', async () => {
    const assistant: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [{ type: 'text', id: 'answer-1', text: '回答' }],
      timestamp: 2,
      agent_run: {
        runId: 'run-1',
        messageId: 'assistant-1',
        status: 'completed',
        config: { maxSteps: 8, maxToolCalls: 16, timeoutS: 300 },
        totalSteps: 1,
        totalToolCalls: 0,
        steps: [],
        lastSequence: 0,
      },
    };
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1'), assistant]));
    hydrationById.set('chat-a', { view: 'ready' });
    primeTrajectory();

    const { rerender } = render(<ChatPage />);
    dispatchMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '查看 assistant-1 的轨迹' }));

    expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'trajectory/requestTrajectoryInspect',
      payload: expect.objectContaining({
        conversationId: 'chat-a',
        messageId: 'assistant-1',
        runId: 'run-1',
        spanId: null,
      }),
    }));

    rerender(<ChatPage />);
    const runOption = await screen.findByRole('option', { name: /执行.*已完成/i });
    await waitFor(() => expect(runOption).toHaveAttribute('data-highlighted', 'true'));
    expect(runOption).toHaveFocus();
    expect(trajectoryState.byConversationId['chat-a'].inspectRequest).toBeNull();
    expect(screen.getByRole('tab', { name: '轨迹' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Trajectory 只 reveal 稳定消息 DOM，切回 Chat 后滚动并聚焦该消息', () => {
    const assistant: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [{ type: 'text', id: 'answer-1', text: '回答' }],
      timestamp: 2,
      agent_run: {
        runId: 'run-1',
        messageId: 'assistant-1',
        status: 'completed',
        config: { maxSteps: 8, maxToolCalls: 16, timeoutS: 300 },
        totalSteps: 1,
        totalToolCalls: 0,
        steps: [],
        lastSequence: 0,
      },
    };
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1'), assistant]));
    hydrationById.set('chat-a', { view: 'ready' });
    primeTrajectory();
    const scrollIntoView = vi.fn();
    const previousScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const animationFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const { rerender } = render(<ChatPage />);
    activateConversationTab('轨迹');
    rerender(<ChatPage />);
    fireEvent.click(screen.getByRole('option', { name: /执行.*已完成/i }));
    rerender(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '在聊天中查看' }));
    rerender(<ChatPage />);

    const target = document.getElementById('chat-message-assistant-1');
    expect(screen.getByRole('tab', { name: '聊天' })).toHaveAttribute('aria-selected', 'true');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(target).toHaveFocus();

    animationFrame.mockRestore();
    HTMLElement.prototype.scrollIntoView = previousScrollIntoView;
  });

  it('把定位授权提示固定装配在消息滚动区顶部', () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    const banner = screen.getByTestId('location-context-banner');
    const messageList = screen.getByTestId('message-list');
    expect(banner).toHaveAttribute('data-conversation-id', 'chat-a');
    expect(banner.compareDocumentPosition(messageList) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it('mount 发现 streaming 后自动恢复，并在终态后不重试', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      callbacks.onDone();
      return { entryId: '9-0' };
    });

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(reconnectStreamMock).toHaveBeenCalledTimes(1);
    expect(reconnectStreamMock.mock.calls[0][0]).toBe('chat-a');
    expect(reconnectStreamMock.mock.calls[0][1]).toBe('0');
    expect(retryHydrationMock).toHaveBeenCalledTimes(1);
    expect(fetchQuestionsMock).not.toHaveBeenCalled();
  });

  it('恢复流把推荐 pending 事件绑定到当前 assistant', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      callbacks.onSuggestedQuestionsPending?.({
        type: 'suggested_questions_pending',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 3,
        trace_id: 'run-1',
        ts: Date.now(),
        message_id: 'assistant-1',
        revision: 2,
        status: 'pending',
      });
      callbacks.onDone();
      return { entryId: '9-0' };
    });

    render(<ChatPage />);

    await waitFor(() => expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversation/applySuggestedQuestionsPending',
      payload: {
        conversationId: 'chat-a',
        messageId: 'assistant-1',
        localMessageId: 'assistant-1',
        revision: 2,
      },
    })));
    expect(fetchQuestionsMock).not.toHaveBeenCalled();
  });

  it('流状态查询临时失败时有限重试，最终 streaming 后继续恢复', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock
      .mockRejectedValueOnce(Object.assign(new Error('network'), { recoverable: true }))
      .mockRejectedValueOnce(Object.assign(new Error('503'), { recoverable: true }))
      .mockResolvedValueOnce({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      callbacks.onDone();
      return { entryId: '9-0' };
    });

    render(<ChatPage />);

    await waitFor(() => expect(fetchStreamStatusMock).toHaveBeenCalledTimes(3));
    expect(reconnectStreamMock).toHaveBeenCalledTimes(1);
  });

  it('流状态查询鉴权失败不重试', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockRejectedValue(
      Object.assign(new Error('unauthorized'), { recoverable: false, code: 'UNAUTHORIZED' }),
    );

    render(<ChatPage />);

    await waitFor(() => expect(fetchStreamStatusMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fetchStreamStatusMock).toHaveBeenCalledTimes(1);
    expect(reconnectStreamMock).not.toHaveBeenCalled();
  });

  it('可恢复中断有限重试，使用最新 entry 游标且不重复 placeholder 和内容', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock
      .mockImplementationOnce(async (_chatId, _cursor, callbacks) => {
        callbacks.onAnswering({ block_id: 'answer-1', delta: '你好' });
        callbacks.onEntryId('7-0');
        throw Object.assign(new Error('redis read failed'), { recoverable: true, code: 'redis_read_failed' });
      })
      .mockImplementationOnce(async (_chatId, _cursor, callbacks) => {
        callbacks.onDone();
        return { entryId: '8-0' };
      });

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(2));
    expect(reconnectStreamMock.mock.calls[1][1]).toBe('7-0');
    expect(dispatchMock.mock.calls.filter(([action]) => action?.type === 'conversation/appendMessage')).toHaveLength(1);
    expect(dispatchMock.mock.calls.filter(([action]) => action?.type === 'stream/appendTextDelta')).toHaveLength(1);
  });

  it('可恢复 EOF 会从当前游标重新打开 GET', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock
      .mockRejectedValueOnce(Object.assign(new Error('流异常结束'), { recoverable: true }))
      .mockImplementationOnce(async (_chatId, _cursor, callbacks) => {
        callbacks.onDone();
        return { entryId: '1-0' };
      });

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(2));
    expect(reconnectStreamMock.mock.calls[1][1]).toBe('0');
  });

  it('连续可恢复 5xx 只做有限次数重试', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock.mockRejectedValue(
      Object.assign(new Error('service unavailable'), { recoverable: true, statusCode: 503 }),
    );

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(3), { timeout: 2500 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(reconnectStreamMock).toHaveBeenCalledTimes(3);
  });

  it.each(['stop', 'switch', 'unmount'] as const)('%s 会 abort 当前恢复 GET 和重试等待', async (mode) => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    conversationsById.set('chat-b', createConversation('chat-b', [textMessage('user-b')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'ready' });
    fetchStreamStatusMock.mockImplementation(async (chatId) => (
      chatId === 'chat-a'
        ? { status: 'streaming', message_id: 'assistant-1' }
        : { status: 'not_found' }
    ));
    let reconnectSignal: AbortSignal | undefined;
    reconnectStreamMock.mockImplementation((_chatId, _cursor, _callbacks, signal) => {
      reconnectSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    });

    const view = render(<ChatPage />);
    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    const callsBeforeAbort = reconnectStreamMock.mock.calls.length;

    if (mode === 'stop') {
      fireEvent.click(screen.getByRole('button', { name: '停止生成' }));
    } else if (mode === 'switch') {
      currentRoute.chatId = 'chat-b';
      view.rerender(<ChatPage />);
    } else {
      view.unmount();
    }

    await waitFor(() => expect(reconnectSignal?.aborted).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(reconnectStreamMock).toHaveBeenCalledTimes(callsBeforeAbort);
  });

  it('页面切换后旧 reconnect 的迟到轨迹仍隔离写回原会话', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-a')]));
    conversationsById.set('chat-b', createConversation('chat-b', [textMessage('user-b')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'ready' });
    fetchStreamStatusMock.mockImplementation(async (chatId) => (
      chatId === 'chat-a'
        ? { status: 'streaming', message_id: 'assistant-1' }
        : { status: 'not_found' }
    ));
    let recoveryCallbacks: StreamCallbacks | undefined;
    let recoverySignal: AbortSignal | undefined;
    reconnectStreamMock.mockImplementation((_chatId, _cursor, callbacks, signal) => {
      recoveryCallbacks = callbacks;
      recoverySignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    });

    const view = render(<ChatPage />);
    await waitFor(() => expect(recoveryCallbacks).toBeDefined());

    currentRoute.chatId = 'chat-b';
    view.rerender(<ChatPage />);
    await waitFor(() => expect(recoverySignal?.aborted).toBe(true));

    recoveryCallbacks?.onTrajectoryEvent?.(recoveredTrajectoryEvent());

    expect(
      trajectoryState.byConversationId['chat-a']
        .liveEventsByRunId['run-recovered'].map(event => event.eventType),
    ).toEqual(['run_started']);
    expect(trajectoryState.byConversationId['chat-b']).toBeUndefined();
  });

  it('停止生成会 abort 已进入的重试等待', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock.mockRejectedValue(Object.assign(new Error('temporary eof'), { recoverable: true }));

    render(<ChatPage />);
    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(reconnectStreamMock).toHaveBeenCalledTimes(1);
  });

  it('停止页面恢复流时等待后端停止并持久化 partial 后才结束本地 stream', async () => {
    const partialBlocks = [{ type: 'text', id: 'answer-1', text: '部分回答' }];
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    storeStreamState.isStreaming = true;
    storeStreamState.conversationId = 'chat-a';
    storeStreamState.messageId = 'assistant-1';
    storeStreamState.contentBlocks = partialBlocks;
    let recoverySignal: AbortSignal | undefined;
    let recoveryCallbacks: any;
    reconnectStreamMock.mockImplementation((_chatId, _cursor, callbacks, signal) => (
      new Promise((_resolve, reject) => {
        recoveryCallbacks = callbacks;
        recoverySignal = signal;
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      })
    ));
    stopContinueAgentRunMock.mockResolvedValue(false);
    let releaseStop: ((cancelled: boolean) => void) | undefined;
    stopRecoveredStreamMock.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      releaseStop = resolve;
    }));
    sessionStorage.setItem(
      CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['chat-a']),
    );

    render(<ChatPage />);
    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    const hydrationCallsBeforeStop = retryHydrationMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    await waitFor(() => expect(stopRecoveredStreamMock).toHaveBeenCalledWith(
      'chat-a',
      'assistant-1',
      undefined,
      partialBlocks,
    ));
    recoveryCallbacks.onAnswering({ block_id: 'late-answer', delta: '等待期正文' });
    recoveryCallbacks.onReasoning({ block_id: 'late-thinking', delta: '等待期推理' });
    recoveryCallbacks.onError('用户中止', { code: 'stream_interrupted' });
    expect(recoverySignal?.aborted).toBe(false);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/endStream')).toBe(false);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendTextDelta')).toBe(false);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendThinkingDelta')).toBe(false);
    expect(retryHydrationMock).toHaveBeenCalledTimes(hydrationCallsBeforeStop);

    releaseStop?.(true);
    await waitFor(() => expect(recoverySignal?.aborted).toBe(true));
    await waitFor(() => expect(
      dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/endStream'),
    ).toBe(true));
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'conversation/updateMessage',
      payload: {
        conversationId: 'chat-a',
        messageId: 'assistant-1',
        patch: { content: partialBlocks },
      },
    });
    const stopOrder = stopRecoveredStreamMock.mock.invocationCallOrder[0];
    const endIndex = dispatchMock.mock.calls.findIndex(([action]) => action?.type === 'stream/endStream');
    expect(dispatchMock.mock.invocationCallOrder[endIndex]).toBeGreaterThan(stopOrder);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendTextDelta')).toBe(false);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendThinkingDelta')).toBe(false);
    expect(stopStreamingMock).not.toHaveBeenCalled();
    expect(retryHydrationMock).toHaveBeenCalledTimes(hydrationCallsBeforeStop + 1);
    expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBeNull();
  });

  it('preparing/tool 阶段无正文时仍以空 partial 数组执行 atomic stop', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    storeStreamState.isStreaming = true;
    storeStreamState.conversationId = 'chat-a';
    storeStreamState.messageId = 'assistant-1';
    storeStreamState.contentBlocks = [];
    let recoverySignal: AbortSignal | undefined;
    reconnectStreamMock.mockImplementation((_chatId, _cursor, _callbacks, signal) => {
      recoverySignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    });
    stopRecoveredStreamMock.mockResolvedValueOnce(true);

    render(<ChatPage />);
    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    const hydrationCallsBeforeStop = retryHydrationMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    await waitFor(() => expect(stopRecoveredStreamMock).toHaveBeenCalledWith(
      'chat-a',
      'assistant-1',
      undefined,
      [],
    ));
    await waitFor(() => expect(recoverySignal?.aborted).toBe(true));
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/endStream')).toBe(true);
    expect(retryHydrationMock).toHaveBeenCalledTimes(hydrationCallsBeforeStop + 1);
  });

  it('atomic stop 返回 cancelled=false 且流仍活跃时回放 buffer 并继续 SSE', async () => {
    const partialBlocks = [{ type: 'text', id: 'answer-1', text: '较短的本地部分回答' }];
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    storeStreamState.isStreaming = true;
    storeStreamState.conversationId = 'chat-a';
    storeStreamState.messageId = 'assistant-1';
    storeStreamState.contentBlocks = partialBlocks;
    let recoverySignal: AbortSignal | undefined;
    let recoveryCallbacks: any;
    reconnectStreamMock.mockImplementation((_chatId, _cursor, callbacks, signal) => {
      recoveryCallbacks = callbacks;
      recoverySignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    });
    let releaseStop: ((cancelled: boolean) => void) | undefined;
    stopRecoveredStreamMock.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      releaseStop = resolve;
    }));

    render(<ChatPage />);
    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    const hydrationCallsBeforeStop = retryHydrationMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    await waitFor(() => expect(stopRecoveredStreamMock).toHaveBeenCalledTimes(1));
    recoveryCallbacks.onAnswering({ block_id: 'late-answer', delta: '应继续显示' });
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendTextDelta')).toBe(false);
    releaseStop?.(false);

    await waitFor(() => expect(
      dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendTextDelta'),
    ).toBe(true));
    expect(recoverySignal?.aborted).toBe(false);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/endStream')).toBe(false);
    expect(retryHydrationMock).toHaveBeenCalledTimes(hydrationCallsBeforeStop);
  });

  it('恢复流 atomic stop 失败时不 abort、不 end，保留 SSE 供重试或接收终态', async () => {
    const partialBlocks = [{ type: 'text', id: 'answer-1', text: '部分回答' }];
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    storeStreamState.isStreaming = true;
    storeStreamState.conversationId = 'chat-a';
    storeStreamState.messageId = 'assistant-1';
    storeStreamState.contentBlocks = partialBlocks;
    let recoverySignal: AbortSignal | undefined;
    let recoveryCallbacks: any;
    reconnectStreamMock.mockImplementation((_chatId, _cursor, callbacks, signal) => {
      recoveryCallbacks = callbacks;
      recoverySignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    });
    let rejectStop: ((error: Error) => void) | undefined;
    stopRecoveredStreamMock.mockImplementationOnce(() => new Promise<boolean>((_resolve, reject) => {
      rejectStop = reject;
    }));

    render(<ChatPage />);
    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    const hydrationCallsBeforeStop = retryHydrationMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));

    await waitFor(() => expect(stopRecoveredStreamMock).toHaveBeenCalledTimes(1));
    recoveryCallbacks.onReasoning({ block_id: 'late-thinking', delta: '应回放推理' });
    recoveryCallbacks.onAnswering({ block_id: 'late-answer', delta: '应回放正文' });
    expect(recoverySignal?.aborted).toBe(false);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/endStream')).toBe(false);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendTextDelta')).toBe(false);
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendThinkingDelta')).toBe(false);

    rejectStop?.(new Error('stop unavailable'));
    await waitFor(() => expect(
      dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendTextDelta'),
    ).toBe(true));
    const thinkingIndex = dispatchMock.mock.calls.findIndex(([action]) => action?.type === 'stream/appendThinkingDelta');
    const answerIndex = dispatchMock.mock.calls.findIndex(([action]) => action?.type === 'stream/appendTextDelta');
    expect(thinkingIndex).toBeGreaterThanOrEqual(0);
    expect(answerIndex).toBeGreaterThan(thinkingIndex);
    expect(stopStreamingMock).not.toHaveBeenCalled();
    expect(retryHydrationMock).toHaveBeenCalledTimes(hydrationCallsBeforeStop);
  });

  it('stop pending 已收到终态 error 后请求失败时丢弃 buffer，不向已结束 stream 回放', async () => {
    const partialBlocks = [{ type: 'text', id: 'answer-1', text: '点击时快照' }];
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    storeStreamState.isStreaming = true;
    storeStreamState.conversationId = 'chat-a';
    storeStreamState.messageId = 'assistant-1';
    storeStreamState.contentBlocks = partialBlocks;
    let recoveryCallbacks: any;
    let rejectRecovery: ((error: Error) => void) | undefined;
    reconnectStreamMock.mockImplementation((_chatId, _cursor, callbacks) => {
      recoveryCallbacks = callbacks;
      return new Promise((_resolve, reject) => {
        rejectRecovery = reject;
      });
    });
    let rejectStop: ((error: Error) => void) | undefined;
    stopRecoveredStreamMock.mockImplementationOnce(() => new Promise<boolean>((_resolve, reject) => {
      rejectStop = reject;
    }));

    render(<ChatPage />);
    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    const hydrationCallsBeforeStop = retryHydrationMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));
    await waitFor(() => expect(stopRecoveredStreamMock).toHaveBeenCalledTimes(1));

    recoveryCallbacks.onAnswering({ block_id: 'late-answer', delta: '不应回放' });
    recoveryCallbacks.onError('用户中止', { code: 'stream_interrupted' });
    rejectRecovery?.(Object.assign(new Error('用户中止'), { recoverable: false }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    rejectStop?.(new Error('stop response failed'));

    await waitFor(() => expect(
      dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/endStream'),
    ).toBe(true));
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendTextDelta')).toBe(false);
    expect(retryHydrationMock).toHaveBeenCalledTimes(hydrationCallsBeforeStop);
  });

  it('cancelled=false 且 stream 已终态时丢弃 buffer 并按错误终态收口', async () => {
    const partialBlocks = [{ type: 'text', id: 'answer-1', text: '点击时快照' }];
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    storeStreamState.isStreaming = true;
    storeStreamState.conversationId = 'chat-a';
    storeStreamState.messageId = 'assistant-1';
    storeStreamState.contentBlocks = partialBlocks;
    let recoveryCallbacks: any;
    let rejectRecovery: ((error: Error) => void) | undefined;
    reconnectStreamMock.mockImplementation((_chatId, _cursor, callbacks) => {
      recoveryCallbacks = callbacks;
      return new Promise((_resolve, reject) => {
        rejectRecovery = reject;
      });
    });
    let releaseStop: ((cancelled: boolean) => void) | undefined;
    stopRecoveredStreamMock.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      releaseStop = resolve;
    }));

    render(<ChatPage />);
    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    const hydrationCallsBeforeStop = retryHydrationMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }));
    await waitFor(() => expect(stopRecoveredStreamMock).toHaveBeenCalledTimes(1));

    recoveryCallbacks.onAnswering({ block_id: 'late-answer', delta: '不应回放' });
    recoveryCallbacks.onError('用户中止', { code: 'stream_interrupted' });
    rejectRecovery?.(Object.assign(new Error('用户中止'), { recoverable: false }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseStop?.(false);

    await waitFor(() => expect(
      dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/endStream'),
    ).toBe(true));
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'stream/appendTextDelta')).toBe(false);
    expect(retryHydrationMock).toHaveBeenCalledTimes(hydrationCallsBeforeStop);
  });

  it('页面恢复收到终态错误时先保留 partial，再结束 stream', async () => {
    const partialBlocks = [{ type: 'text', id: 'answer-1', text: '已恢复的部分回答' }];
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    storeStreamState.messageId = 'assistant-1';
    storeStreamState.contentBlocks = partialBlocks;
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      callbacks.onError('生成已中断', { code: 'stream_interrupted' });
      throw Object.assign(new Error('生成已中断'), { recoverable: false, code: 'stream_interrupted' });
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'conversation/updateMessage',
        payload: {
          conversationId: 'chat-a',
          messageId: 'assistant-1',
          patch: { content: partialBlocks },
        },
      });
    });
    const updateIndex = dispatchMock.mock.calls.findIndex(([action]) => action?.type === 'conversation/updateMessage');
    const endIndex = dispatchMock.mock.calls.findIndex(([action]) => action?.type === 'stream/endStream');
    expect(updateIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(updateIndex);
  });

  it('页面恢复收到普通业务终态错误时清理首轮上下文状态', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    for (const storageKey of [
      CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY,
      CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
      CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY,
    ]) {
      sessionStorage.setItem(storageKey, JSON.stringify(['chat-a']));
    }
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      callbacks.onError('供应商调用失败', { code: 'provider_error' });
      throw Object.assign(new Error('供应商调用失败'), { recoverable: false, code: 'provider_error' });
    });

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(sessionStorage.getItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY)).toBeNull();
    });
  });

  it('页面恢复重试耗尽且无 partial 时只移除本次插入的空 placeholder', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('user-1')]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock.mockRejectedValue(Object.assign(new Error('temporary eof'), { recoverable: true }));
    sessionStorage.setItem(
      CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['chat-a']),
    );

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(3), { timeout: 2500 });
    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'conversation/removeMessage',
        payload: { conversationId: 'chat-a', messageId: 'assistant-1' },
      });
    });
    expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBeNull();
  });

  it('页面恢复失败且无 partial 时不删除历史已有 assistant', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [
      textMessage('user-1'),
      { id: 'assistant-1', role: 'assistant', content: [], timestamp: 2 },
    ]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      callbacks.onError('生成已中断', { code: 'stream_interrupted' });
      throw Object.assign(new Error('生成已中断'), { recoverable: false });
    });

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dispatchMock.mock.calls.some(([action]) => action?.type === 'conversation/removeMessage')).toBe(false);
  });

  it('刷新恢复 continuation 成功时以旧回答作为 staticBlocks 并合并新内容', async () => {
    const oldBlocks = [{ type: 'text', id: 'old-answer', text: '旧回答' }];
    const mergedBlocks = [...oldBlocks, { type: 'text', id: 'new-answer', text: '新回答' }];
    conversationsById.set('chat-a', createConversation('chat-a', [
      textMessage('user-1'),
      { id: 'assistant-1', role: 'assistant', content: oldBlocks, timestamp: 2 },
    ]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({
      status: 'streaming',
      message_id: 'assistant-1',
      stream_mode: 'continuation',
    });
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      storeStreamState.contentBlocks = mergedBlocks;
      callbacks.onDone();
      return { entryId: '2-0' };
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'stream/startStream',
        payload: {
          conversationId: 'chat-a',
          messageId: 'assistant-1',
          staticBlocks: oldBlocks,
        },
      });
    });
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'conversation/updateMessage',
      payload: {
        conversationId: 'chat-a',
        messageId: 'assistant-1',
        patch: { content: mergedBlocks },
      },
    });
  });

  it('刷新恢复 continuation 失败时 partial 仍合并保留旧回答', async () => {
    const oldBlocks = [{ type: 'text', id: 'old-answer', text: '旧回答' }];
    const mergedBlocks = [...oldBlocks, { type: 'text', id: 'partial-answer', text: '半截新增' }];
    conversationsById.set('chat-a', createConversation('chat-a', [
      textMessage('user-1'),
      { id: 'assistant-1', role: 'assistant', content: oldBlocks, timestamp: 2 },
    ]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({
      status: 'streaming',
      message_id: 'assistant-1',
      stream_mode: 'continuation',
    });
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      storeStreamState.contentBlocks = mergedBlocks;
      callbacks.onError('生成已中断', { code: 'stream_interrupted' });
      throw Object.assign(new Error('生成已中断'), { recoverable: false });
    });

    render(<ChatPage />);

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalledWith({
        type: 'conversation/updateMessage',
        payload: {
          conversationId: 'chat-a',
          messageId: 'assistant-1',
          patch: { content: mergedBlocks },
        },
      });
    });
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'stream/startStream',
      payload: {
        conversationId: 'chat-a',
        messageId: 'assistant-1',
        staticBlocks: oldBlocks,
      },
    });
  });

  it('刷新恢复 retry 失败时丢弃半截新回答并重新水合原回答', async () => {
    const oldBlocks = [{ type: 'text', id: 'old-answer', text: '旧完整回答' }];
    const partialBlocks = [{ type: 'text', id: 'partial-answer', text: '半截新回答' }];
    conversationsById.set('chat-a', createConversation('chat-a', [
      textMessage('user-1'),
      { id: 'assistant-1', role: 'assistant', content: oldBlocks, timestamp: 2 },
    ]));
    hydrationById.set('chat-a', { view: 'ready' });
    fetchStreamStatusMock.mockResolvedValue({
      status: 'streaming',
      message_id: 'assistant-1',
      stream_mode: 'retry',
    });
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      storeStreamState.contentBlocks = partialBlocks;
      callbacks.onError('生成已中断', { code: 'stream_interrupted' });
      throw Object.assign(new Error('生成已中断'), { recoverable: false });
    });

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(retryHydrationMock).toHaveBeenCalledTimes(1));
    expect(dispatchMock).not.toHaveBeenCalledWith({
      type: 'conversation/updateMessage',
      payload: {
        conversationId: 'chat-a',
        messageId: 'assistant-1',
        patch: { content: partialBlocks },
      },
    });
  });

  it('普通 initial 恢复即使 DB 有 checkpoint 也从空 blocks 重放，避免重复旧内容', async () => {
    const checkpointBlocks = [{ type: 'text', id: 'checkpoint-answer', text: '已落库 checkpoint' }];
    const replayedBlocks = [{ type: 'text', id: 'replayed-answer', text: '重放后的完整回答' }];
    conversationsById.set('chat-a', createConversation('chat-a', [
      textMessage('user-1'),
      { id: 'assistant-1', role: 'assistant', content: checkpointBlocks, timestamp: 2 },
    ]));
    hydrationById.set('chat-a', { view: 'ready' });
    // 兼容旧后端：缺失 stream_mode 必须按 initial 处理。
    fetchStreamStatusMock.mockResolvedValue({ status: 'streaming', message_id: 'assistant-1' });
    reconnectStreamMock.mockImplementation(async (_chatId, _cursor, callbacks) => {
      storeStreamState.contentBlocks = replayedBlocks;
      callbacks.onDone();
      return { entryId: '3-0' };
    });

    render(<ChatPage />);

    await waitFor(() => expect(reconnectStreamMock).toHaveBeenCalledTimes(1));
    const startAction = dispatchMock.mock.calls
      .map(([action]) => action)
      .find((action) => action?.type === 'stream/startStream');
    expect(startAction).toEqual({
      type: 'stream/startStream',
      payload: {
        conversationId: 'chat-a',
        messageId: 'assistant-1',
      },
    });
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'conversation/updateMessage',
      payload: {
        conversationId: 'chat-a',
        messageId: 'assistant-1',
        patch: { content: replayedBlocks },
      },
    });
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
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-disabled', 'true');
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

  it('Chat 只保留消息级 retry，不再下发 Agent run continuation 入口', async () => {
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
    expect(lastMessageListProps.onRetry).toBeTypeOf('function');
    expect(lastMessageListProps.onContinueAgentRun).toBeUndefined();
    expect(continueAgentRunMock).not.toHaveBeenCalled();
  });

  it('Trajectory 终态区域用 selected run id 发起 Agent retry/continue', async () => {
    const assistant: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: [{ type: 'text', id: 'answer-1', text: '旧回答' }],
      timestamp: 2,
    };
    conversationsById.set('chat-a', createConversation('chat-a', [
      textMessage('user-1'),
      assistant,
    ]));
    hydrationById.set('chat-a', { view: 'ready' });
    primeTrajectory(trajectoryRun('run-selected'));

    const { rerender } = render(<ChatPage />);
    activateConversationTab('轨迹');
    rerender(<ChatPage />);

    fireEvent.click(await screen.findByRole('button', { name: '重试所选运行' }));
    await waitFor(() => expect(retryMessageMock).toHaveBeenCalledWith(
      'assistant-1',
      'chat-a',
      [],
      'run-selected',
      expect.objectContaining({
        canStart: expect.any(Function),
        onAccepted: expect.any(Function),
        onRejected: expect.any(Function),
      }),
    ));

    const limitRun = trajectoryRun('run-limit');
    limitRun.status = 'limit_reached';
    trajectoryState = trajectoryReducer(undefined, { type: '@@init' });
    primeTrajectory(limitRun);
    rerender(<ChatPage />);
    activateConversationTab('轨迹');
    rerender(<ChatPage />);

    fireEvent.click(await screen.findByRole('button', { name: '继续所选运行' }));
    await waitFor(() => expect(continueAgentRunMock).toHaveBeenCalledWith({
      conversationId: 'chat-a',
      assistantMessageId: 'assistant-1',
      previousRunId: 'run-limit',
      canStart: expect.any(Function),
      onAccepted: expect.any(Function),
      onRejectedBeforeStart: expect.any(Function),
    }));
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

  it('推荐问题显式使用输入框当前改选的知识库范围', async () => {
    const conversation = createConversation('chat-a', [textMessage('message-a')]);
    conversation.knowledge_base_ids = ['kb-old'];
    conversationsById.set('chat-a', conversation);
    hydrationById.set('chat-a', { view: 'ready' });
    suggestedQuestionsState.questions = ['继续问当前手册'];

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '改选知识库' }));
    fireEvent.click(screen.getByRole('button', { name: '标记知识库可用' }));
    fireEvent.click(screen.getByRole('button', { name: '选择推荐问题' }));

    expect(sendMessageMock).toHaveBeenCalledWith(
      '继续问当前手册',
      expect.objectContaining({
        conversationId: 'chat-a',
        knowledgeBaseIds: ['kb-new'],
      }),
      undefined,
    );
  });

  it('输入框当前知识库范围不可用时阻止推荐问题发送', async () => {
    const conversation = createConversation('chat-a', [textMessage('message-a')]);
    conversation.knowledge_base_ids = ['kb-old'];
    conversationsById.set('chat-a', conversation);
    hydrationById.set('chat-a', { view: 'ready' });
    suggestedQuestionsState.questions = ['不要发送'];

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '标记知识库不可用' }));
    fireEvent.click(screen.getByRole('button', { name: '选择推荐问题' }));

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it('重试显式使用输入框当前已验证的知识库范围', async () => {
    const conversation = createConversation('chat-a', [textMessage('message-a')]);
    conversation.knowledge_base_ids = ['kb-old'];
    conversationsById.set('chat-a', conversation);
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '改选知识库' }));
    fireEvent.click(screen.getByRole('button', { name: '标记知识库可用' }));
    fireEvent.click(screen.getByRole('button', { name: '重试消息' }));

    expect(retryMessageMock).toHaveBeenCalledWith(
      'message-a',
      'chat-a',
      ['kb-new'],
    );
  });

  it('输入框当前知识库范围不可用时阻止重试', async () => {
    const conversation = createConversation('chat-a', [textMessage('message-a')]);
    conversation.knowledge_base_ids = ['kb-old'];
    conversationsById.set('chat-a', conversation);
    hydrationById.set('chat-a', { view: 'ready' });

    render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '标记知识库不可用' }));
    fireEvent.click(screen.getByRole('button', { name: '重试消息' }));

    expect(retryMessageMock).not.toHaveBeenCalled();
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

  it('切换到资料仍在加载的空会话时不闪现资料入口', () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    conversationsById.set('chat-b', createConversation('chat-b', [textMessage('message-b')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'ready' });
    useConversationFilesState.files = [
      {
        id: 'file-a',
        filename: 'chat-a.png',
        mimetype: 'image/png',
        size: 100,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];

    const { rerender } = render(<ChatPage />);

    expect(screen.getByRole('button', { name: '打开会话资料' })).toBeInTheDocument();

    currentRoute.chatId = 'chat-b';
    useConversationFilesState.files = [];
    useConversationFilesState.isLoading = true;
    rerender(<ChatPage />);

    expect(screen.queryByRole('button', { name: '打开会话资料' })).toBeNull();
  });

  it('资料面板打开时切换会话也不会渲染上一会话的入口或面板', () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    conversationsById.set('chat-b', createConversation('chat-b', [textMessage('message-b')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'ready' });
    useConversationFilesState.files = [
      {
        id: 'file-a',
        filename: 'chat-a.png',
        mimetype: 'image/png',
        size: 100,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
      },
    ];

    const { rerender } = render(<ChatPage />);
    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    expect(filesPanelRenderMock).toHaveBeenCalledWith('chat-a');
    filesPanelRenderMock.mockClear();

    currentRoute.chatId = 'chat-b';
    useConversationFilesState.files = [];
    useConversationFilesState.isLoading = true;
    rerender(<ChatPage />);

    expect(filesPanelRenderMock).not.toHaveBeenCalledWith('chat-b');
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
    expect(screen.queryByRole('button', { name: '打开会话资料' })).toBeNull();
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
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-1', 'chat-a');
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
    expect(useConversationFilesState.refresh).toHaveBeenLastCalledWith('chat-a');

    fireEvent.click(screen.getByRole('button', { name: '发送消息' }));
    const sendOptions = sendMessageMock.mock.calls.at(-1)?.[1];
    sendOptions.onStreamEnd('chat-a');

    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(2);
    expect(useConversationFilesState.refresh).toHaveBeenLastCalledWith('chat-a');
    expect(fetchQuestionsMock).not.toHaveBeenCalled();
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
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-uploaded', 'chat-a');
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

  it('已有会话上传待刷新图片后等待资料刷新为 processed 再加入本次提问', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传待刷新图片资料' }));

    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('conversation-files-panel')).toBeNull();
    expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '0');

    useConversationFilesState.files = [
      {
        id: 'file-pending-image',
        filename: 'report.png',
        mimetype: 'image/png',
        size: 240,
        created_at: '2026-07-03T10:00:00Z',
        status: 'processed',
        error_message: null,
        thumbnail_url: '/pending-thumb.png',
      },
    ];
    rerender(<ChatPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-input')).toHaveAttribute('data-attachment-count', '1');
    });
    fireEvent.click(screen.getByRole('button', { name: '打开会话资料' }));
    expect(screen.getByTestId('conversation-files-panel')).toHaveAttribute('data-selected-ids', 'file-pending-image');
  });

  it('已有会话上传解析中文件失败后不会被旧 pending 状态再次自动加入', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传待刷新图片资料' }));

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

  it('删除仍在刷新中的上传图片后不会被旧 pending 状态自动加入', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    hydrationById.set('chat-a', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传待刷新图片资料' }));

    useConversationFilesState.files = [
      {
        id: 'file-pending-image',
        filename: 'report.png',
        mimetype: 'image/png',
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
      expect(deleteFileMock).toHaveBeenCalledWith('file-pending-image');
    });
    expect(useConversationFilesState.removeFile).toHaveBeenCalledWith('file-pending-image', 'chat-a');

    useConversationFilesState.files = [
      {
        id: 'file-pending-image',
        filename: 'report.png',
        mimetype: 'image/png',
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

  it('旧会话带附件的流结束时只刷新原会话资料缓存', async () => {
    conversationsById.set('chat-a', createConversation('chat-a', [textMessage('message-a')]));
    conversationsById.set('chat-b', createConversation('chat-b', [textMessage('message-b')]));
    hydrationById.set('chat-a', { view: 'ready' });
    hydrationById.set('chat-b', { view: 'ready' });

    const { rerender } = render(<ChatPage />);

    fireEvent.click(screen.getByRole('button', { name: '上传已处理资料' }));
    fireEvent.click(screen.getByRole('button', { name: '发送带资料消息' }));
    const sendOptions = sendMessageMock.mock.calls.at(-1)?.[1];
    useConversationFilesState.refresh.mockClear();
    fetchQuestionsMock.mockClear();

    currentRoute.chatId = 'chat-b';
    rerender(<ChatPage />);

    sendOptions.onStreamEnd('chat-a');

    expect(useConversationFilesState.refresh).toHaveBeenCalledTimes(1);
    expect(useConversationFilesState.refresh).toHaveBeenCalledWith('chat-a');
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
