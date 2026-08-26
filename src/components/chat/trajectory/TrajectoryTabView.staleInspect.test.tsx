import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import trajectoryReducer, {
  consumeTrajectoryInspectRequest,
  requestTrajectoryInspect,
  trajectorySnapshotReceived,
  trajectorySnapshotRequested,
} from '@/redux/slices/trajectorySlice';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary, TrajectorySnapshot } from '@/types/trajectory';
import type { TrajectoryTableProps } from './TrajectoryTable';

const {
  capturedTableCallbacks,
  getTrajectoryRunsMock,
  getTrajectorySnapshotMock,
  latestTableTarget,
} = vi.hoisted(() => ({
  capturedTableCallbacks: new Map<string, Array<{ cellKey: string; callback: () => void }>>(),
  getTrajectoryRunsMock: vi.fn(),
  getTrajectorySnapshotMock: vi.fn(),
  latestTableTarget: { current: null as string | null },
}));

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryRuns: getTrajectoryRunsMock,
  getTrajectorySnapshot: getTrajectorySnapshotMock,
}));

vi.mock('./TrajectoryTable', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<typeof import('./TrajectoryTable')>('./TrajectoryTable');
  return {
    ...actual,
    TrajectoryTable: (props: TrajectoryTableProps) => {
      const target = props.inspectTarget;
      latestTableTarget.current = target?.requestId ?? null;
      const callback = props.onInspectTargetResolved;
      if (target && callback) {
        const rows = props.projectedRows ?? [];
        const index = rows.findIndex(row => (
          row.key === target.cellKey || row.aliasedCellKeys.includes(target.cellKey)
        ));
        const cell = rows[index]?.cell;
        if (index >= 0 && cell) {
          const captured = capturedTableCallbacks.get(target.requestId) ?? [];
          if (!captured.some(item => item.cellKey === target.cellKey)) {
            captured.push({
              cellKey: target.cellKey,
              callback: () => callback(target, index, cell),
            });
            capturedTableCallbacks.set(target.requestId, captured);
          }
        }
      }
      return ReactModule.createElement(actual.TrajectoryTable, {
        ...props,
        onInspectTargetResolved: undefined,
      });
    },
  };
});

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

function runSummary(runId: string, attemptIndex: number): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: 'assistant-1',
    turn_message_id: 'user-1',
    attempt_index: attemptIndex,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 1,
    duration_ms: 180,
    started_at: `2026-08-22T00:00:0${attemptIndex}.000Z`,
    ended_at: `2026-08-22T00:00:0${attemptIndex}.180Z`,
    llm_detail_schema_version: 1,
    llm_round_count: 0,
  };
}

function snapshot(run: TrajectoryRunSummary, withToolSpan = true): TrajectorySnapshot {
  const toolRecords: TrajectorySnapshot['records'] = withToolSpan ? [
    {
      sequence: 1,
      event_type: 'tool_call_started',
      schema_version: 1,
      timestamp: '2026-08-22T00:00:00.020Z',
      step_id: 'step-1',
      tool_call_id: 'tool-1',
      parent_step_id: null,
      trace_id: run.run_id,
      span_id: 'tool:tool-1',
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
      span_id: 'tool:tool-1',
      payload: { tool_name: 'web_search', status: 'success', duration_ms: 100 },
    },
  ] : [];
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
    }, ...toolRecords],
    spans: withToolSpan ? [{
      span_id: 'tool:tool-1',
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
    }] : [],
    completeness: {
      status: 'complete',
      degraded_reason: null,
      event_count: withToolSpan ? 3 : 1,
      expected_last_sequence: withToolSpan ? 2 : 0,
      loaded_event_count: withToolSpan ? 3 : 1,
      first_sequence: 0,
      last_sequence: withToolSpan ? 2 : 0,
    },
    truncated: !withToolSpan,
    llm_round_summaries: [],
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

function capturedCallback(requestId: string, cellKey?: string): () => void {
  const captured = capturedTableCallbacks.get(requestId) ?? [];
  const entry = cellKey
    ? captured.find(item => item.cellKey === cellKey)
    : captured[0];
  if (!entry) throw new Error(`必须捕获 ${requestId} 的 Table callback`);
  return entry.callback;
}

describe('TrajectoryTabView stale inspect callback', () => {
  beforeEach(() => {
    capturedTableCallbacks.clear();
    latestTableTarget.current = null;
    getTrajectoryRunsMock.mockReset();
    getTrajectorySnapshotMock.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 1000,
      bottom: 160,
      left: 0,
      width: 1000,
      height: 160,
      toJSON: () => ({}),
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('旧 fallback A 回调在手选 B 后不能抢回选择或写回 A 提示和高亮', async () => {
    const store = createStore();
    const runA = runSummary('run-a', 1);
    const runB = runSummary('run-b', 2);
    getTrajectoryRunsMock.mockResolvedValue({ items: [runA, runB], truncated: false });
    getTrajectorySnapshotMock.mockImplementation((_conversationId: string, runId: string) => (
      Promise.resolve(snapshot(runId === 'run-a' ? runA : runB, runId !== 'run-a'))
    ));
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-a-fallback',
      messageId: 'assistant-1',
      runId: 'run-a',
      spanId: 'span-missing',
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(capturedTableCallbacks.has('inspect-a-fallback')).toBe(true));
    const staleCallback = capturedCallback('inspect-a-fallback');
    fireEvent.click(await screen.findByRole('option', { name: /第 2 次执行.*已完成/ }));
    await waitFor(() => expect(store.getState().trajectory.byConversationId['chat-a']).toMatchObject({
      selectedRunId: 'run-b',
      selectionSource: 'manual',
      inspectRequest: null,
    }));

    act(() => staleCallback());

    expect(store.getState().trajectory.byConversationId['chat-a']).toMatchObject({
      selectedRunId: 'run-b',
      selectionSource: 'manual',
      inspectRequest: null,
    });
    expect(screen.queryByText('该节点不在当前有界快照中')).toBeNull();
    expect(screen.getByRole('option', { name: /第 1 次执行/ }))
      .toHaveAttribute('data-highlighted', 'false');
    expect(screen.getByRole('option', { name: /第 2 次执行/ }))
      .toHaveAttribute('aria-selected', 'true');
  });

  it('旧成功 A 回调在新 request B 后不能留下随后可见的 A feedback', async () => {
    const store = createStore();
    const runA = runSummary('run-a', 1);
    const runB = runSummary('run-b', 2);
    getTrajectoryRunsMock.mockResolvedValue({ items: [runA, runB], truncated: false });
    getTrajectorySnapshotMock.mockImplementation((_conversationId: string, runId: string) => (
      Promise.resolve(snapshot(runId === 'run-a' ? runA : runB))
    ));
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-a-success',
      messageId: 'assistant-1',
      runId: 'run-a',
      spanId: 'tool:tool-1',
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(capturedTableCallbacks.has('inspect-a-success')).toBe(true));
    const staleCallback = capturedCallback('inspect-a-success');
    act(() => {
      store.dispatch(requestTrajectoryInspect({
        conversationId: 'chat-a',
        requestId: 'inspect-b-pending',
        messageId: 'assistant-1',
        runId: 'run-b',
        spanId: 'tool:tool-1',
      }));
    });
    await waitFor(() => expect(capturedTableCallbacks.has('inspect-b-pending')).toBe(true));

    act(() => staleCallback());

    expect(store.getState().trajectory.byConversationId['chat-a']).toMatchObject({
      selectedRunId: 'run-b',
      selectionSource: 'inspect',
      inspectRequest: expect.objectContaining({ requestId: 'inspect-b-pending', runId: 'run-b' }),
    });
    act(() => {
      store.dispatch(consumeTrajectoryInspectRequest({
        conversationId: 'chat-a',
        requestId: 'inspect-b-pending',
      }));
    });

    expect(latestTableTarget.current).toBeNull();
    expect(screen.getAllByRole('option', { name: /搜索.*工具调用.*完成/ }).map(option => (
      option.getAttribute('data-highlighted')
    ))).toEqual(['false']);
  });

  it('同 request/run 的 S2 覆盖 S1 后旧 fallback callback 不消费请求，S2 继续正确定位', async () => {
    const store = createStore();
    const runA = runSummary('run-a', 1);
    getTrajectoryRunsMock.mockResolvedValue({ items: [runA], truncated: false });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot(runA, false));
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'chat-a',
      requestId: 'inspect-same-run',
      messageId: 'assistant-1',
      runId: 'run-a',
      spanId: 'tool:tool-1',
    }));

    render(
      <TrajectoryTabView conversationId="chat-a" messages={messages} />,
      { wrapper: wrapper(store) },
    );

    await waitFor(() => expect(
      capturedTableCallbacks.get('inspect-same-run')?.some(item => item.cellKey === 'run:run-a'),
    ).toBe(true));
    const staleS1Fallback = capturedCallback('inspect-same-run', 'run:run-a');

    act(() => {
      store.dispatch(trajectorySnapshotRequested({
        conversationId: 'chat-a',
        runId: 'run-a',
        requestId: 'snapshot-s2',
        purpose: 'reconcile',
      }));
      store.dispatch(trajectorySnapshotReceived({
        conversationId: 'chat-a',
        requestId: 'snapshot-s2',
        snapshot: snapshot(runA),
      }));
    });
    await waitFor(() => expect(
      capturedTableCallbacks.get('inspect-same-run')?.some(item => item.cellKey !== 'run:run-a'),
    ).toBe(true));
    const s2Resolution = capturedTableCallbacks.get('inspect-same-run')
      ?.find(item => item.cellKey !== 'run:run-a');
    if (!s2Resolution) throw new Error('必须捕获 S2 span Table callback');

    act(() => staleS1Fallback());

    expect(store.getState().trajectory.byConversationId['chat-a']).toMatchObject({
      selectedRunId: 'run-a',
      selectedSpanId: 'tool:tool-1',
      selectionSource: 'inspect',
      inspectRequest: expect.objectContaining({ requestId: 'inspect-same-run' }),
    });
    expect(screen.queryByText('该节点不在当前有界快照中')).toBeNull();
    expect(screen.getByRole('option', { name: /第 1 次执行/ }))
      .toHaveAttribute('data-highlighted', 'false');

    act(() => s2Resolution.callback());

    expect(store.getState().trajectory.byConversationId['chat-a'].inspectRequest).toBeNull();
    const target = screen.getByRole('option', { name: /搜索.*工具调用.*完成/ });
    expect(target).toHaveAttribute('data-highlighted', 'true');
    expect(screen.queryByText('该节点不在当前有界快照中')).toBeNull();
  });
});
