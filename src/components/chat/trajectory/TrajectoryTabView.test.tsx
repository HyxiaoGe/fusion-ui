import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import trajectoryReducer, {
  requestTrajectoryInspect,
  setTrajectoryActiveSurface,
} from '@/redux/slices/trajectorySlice';
import { ApiError } from '@/types/api';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary, TrajectorySnapshot } from '@/types/trajectory';

const { getTrajectoryRunsMock, getTrajectorySnapshotMock } = vi.hoisted(() => ({
  getTrajectoryRunsMock: vi.fn(),
  getTrajectorySnapshotMock: vi.fn(),
}));

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryRuns: getTrajectoryRunsMock,
  getTrajectorySnapshot: getTrajectorySnapshotMock,
}));

import TrajectoryTabView from './TrajectoryTabView';

function createStore() {
  return configureStore({ reducer: { trajectory: trajectoryReducer } });
}

function wrapper(store: ReturnType<typeof createStore>) {
  const TestProvider = Provider as unknown as React.ComponentType<{
    store: typeof store;
    children?: React.ReactNode;
  }>;
  return function StoreProvider({ children }: { children: React.ReactNode }) {
    return <TestProvider store={store}>{children}</TestProvider>;
  };
}

function runSummary(overrides: Partial<TrajectoryRunSummary> = {}): TrajectoryRunSummary {
  return {
    run_id: 'run-1',
    message_id: 'assistant-1',
    turn_message_id: 'user-1',
    attempt_index: 0,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 1,
    duration_ms: 180,
    started_at: '2026-08-22T00:00:00.000Z',
    ended_at: '2026-08-22T00:00:00.180Z',
    ...overrides,
  };
}

function snapshot(overrides: Partial<TrajectorySnapshot> = {}): TrajectorySnapshot {
  const run = overrides.run ?? runSummary();
  return {
    run,
    records: [
      {
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
      },
      {
        sequence: 1,
        event_type: 'tool_call_started',
        schema_version: 1,
        timestamp: '2026-08-22T00:00:00.020Z',
        step_id: 'step-1',
        tool_call_id: 'tool-1',
        parent_step_id: null,
        trace_id: run.run_id,
        span_id: 'span-tool',
        payload: { tool_name: 'web_search' },
      },
      {
        sequence: 2,
        event_type: 'tool_call_completed',
        schema_version: 1,
        timestamp: '2026-08-22T00:00:00.120Z',
        step_id: 'step-1',
        tool_call_id: 'tool-1',
        parent_step_id: null,
        trace_id: run.run_id,
        span_id: 'span-tool',
        payload: { tool_name: 'web_search', status: 'success', duration_ms: 100 },
      },
    ],
    spans: [{
      span_id: 'span-tool',
      kind: 'tool',
      name: '联网搜索',
      parent_span_id: null,
      start_sequence: 1,
      end_sequence: 2,
      started_at: '2026-08-22T00:00:00.020Z',
      ended_at: '2026-08-22T00:00:00.120Z',
      duration_ms: 100,
      status: 'completed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: null,
      record_sequences: [1, 2],
    }],
    completeness: {
      status: 'complete',
      degraded_reason: null,
      event_count: 3,
      expected_last_sequence: 2,
      loaded_event_count: 3,
      first_sequence: 0,
      last_sequence: 2,
    },
    truncated: false,
    ...overrides,
  };
}

const messages: Message[] = [
  {
    id: 'user-1',
    role: 'user',
    content: [{ type: 'text', id: 'question-1', text: '查天气' }],
    timestamp: 1,
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    content: [{ type: 'text', id: 'answer-1', text: '天气晴朗' }],
    timestamp: 2,
  },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('TrajectoryTabView', () => {
  beforeEach(() => {
    getTrajectoryRunsMock.mockReset();
    getTrajectorySnapshotMock.mockReset();
  });

  it('挂载即拉取 run list，并把加载态与空态明确标为有界视图', async () => {
    const store = createStore();
    const runsRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    getTrajectoryRunsMock.mockReturnValue(runsRequest.promise);

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    expect(screen.getByRole('heading', { name: '会话轨迹（有界）' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('正在加载轨迹运行');
    expect(getTrajectorySnapshotMock).not.toHaveBeenCalled();

    await act(async () => {
      runsRequest.resolve({ items: [], truncated: false });
      await runsRequest.promise;
    });

    expect(await screen.findByText('当前会话暂无轨迹运行')).toBeInTheDocument();
  });

  it('run list 失败和不可用状态都提供真实且不同的结果', async () => {
    getTrajectoryRunsMock.mockRejectedValueOnce(new Error('轨迹服务暂时不可用'));
    const failedStore = createStore();
    const failedView = render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(failedStore) },
    );

    expect(await screen.findByText('轨迹服务暂时不可用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试加载轨迹' })).toBeInTheDocument();
    failedView.unmount();

    getTrajectoryRunsMock.mockRejectedValueOnce(
      new ApiError('NOT_FOUND', '会话或轨迹不存在，或无权访问', 'request-404'),
    );
    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(createStore()) },
    );

    expect(await screen.findByText('当前会话没有可用轨迹')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试加载轨迹' })).toBeNull();
  });

  it('只把 messages、run 摘要、所选快照和 live tail 投影一次后交给现有视图组件', async () => {
    const store = createStore();
    store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface: 'trajectory' }));
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: true });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot({
      truncated: true,
      completeness: {
        ...snapshot().completeness,
        status: 'degraded',
        degraded_reason: 'bounded',
      },
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    expect(await screen.findByRole('listbox', { name: '轨迹账本' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /第 1 次执行.*已完成.*轨迹已截断/ })).toBeInTheDocument();
    expect(screen.getByLabelText('轨迹时间线')).toBeInTheDocument();
    expect(screen.getByText('当前仅展示有界轨迹，部分记录已截断')).toBeInTheDocument();
    expect(screen.getByText('部分轨迹记录不可用，以下内容可能不完整')).toBeInTheDocument();
  });

  it('InspectRequest 等待水合后定位目标、聚焦高亮并最后清除 request', async () => {
    const store = createStore();
    const snapshotRequest = deferred<TrajectorySnapshot>();
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: false });
    getTrajectorySnapshotMock.mockReturnValue(snapshotRequest.promise);
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-tool',
      messageId: 'assistant-1',
      runId: 'run-1',
      spanId: 'span-tool',
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(getTrajectorySnapshotMock).toHaveBeenCalled());
    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest?.requestId)
      .toBe('inspect-tool');

    await act(async () => {
      snapshotRequest.resolve(snapshot());
      await snapshotRequest.promise;
    });

    const target = await screen.findByRole('option', { name: /搜索.*工具调用.*完成/ });
    await waitFor(() => expect(target).toHaveFocus());
    expect(target).toHaveAttribute('data-highlighted', 'true');
    await waitFor(() => {
      expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest).toBeNull();
    });
  });

  it('消息级 inspect 也必须等待所选 run 水合后才定位和 consume', async () => {
    const store = createStore();
    const snapshotRequest = deferred<TrajectorySnapshot>();
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: false });
    getTrajectorySnapshotMock.mockReturnValue(snapshotRequest.promise);
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-message',
      messageId: 'assistant-1',
      runId: 'run-1',
      spanId: null,
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(getTrajectorySnapshotMock).toHaveBeenCalled());
    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest?.requestId)
      .toBe('inspect-message');
    expect(screen.queryByRole('option', { name: /第 1 次执行/ }))
      .not.toHaveAttribute('data-highlighted', 'true');

    await act(async () => {
      snapshotRequest.resolve(snapshot());
      await snapshotRequest.promise;
    });

    const runHeader = await screen.findByRole('option', { name: /第 1 次执行/ });
    await waitFor(() => expect(runHeader).toHaveFocus());
    expect(runHeader).toHaveAttribute('data-highlighted', 'true');
    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest).toBeNull();
  });

  it('InspectRequest 目标不在截断快照时回退 Run 头并提示，同时 reveal 只交付稳定 message id', async () => {
    const store = createStore();
    const onRevealInChat = vi.fn();
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary()], truncated: false });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot({
      spans: [],
      records: [snapshot().records[0]],
      truncated: true,
      completeness: {
        ...snapshot().completeness,
        loaded_event_count: 1,
        last_sequence: 0,
      },
    }));
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-missing',
      messageId: 'assistant-1',
      runId: 'run-1',
      spanId: 'span-missing',
    }));

    render(
      <TrajectoryTabView
        conversationId="chat-a"
        messages={messages}
        onRevealInChat={onRevealInChat}
      />,
      { wrapper: wrapper(store) },
    );

    expect(await screen.findByText('该节点不在当前有界快照中')).toBeInTheDocument();
    const runHeader = screen.getByRole('option', { name: /第 1 次执行/ });
    await waitFor(() => expect(runHeader).toHaveFocus());
    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '在聊天中查看' }));
    expect(onRevealInChat).toHaveBeenCalledWith('assistant-1');
  });
});
