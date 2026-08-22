import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeSseTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import trajectoryReducer, {
  mergeLiveTrajectoryEvent,
  selectTrajectoryTarget,
  setTrajectoryActiveSurface,
  trajectorySnapshotReceived,
  trajectorySnapshotRequested,
} from '@/redux/slices/trajectorySlice';
import { ApiError } from '@/types/api';
import type { TrajectoryRunSummary, TrajectorySnapshot } from '@/types/trajectory';

const { getTrajectoryRunsMock, getTrajectorySnapshotMock } = vi.hoisted(() => ({
  getTrajectoryRunsMock: vi.fn(),
  getTrajectorySnapshotMock: vi.fn(),
}));

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryRuns: getTrajectoryRunsMock,
  getTrajectorySnapshot: getTrajectorySnapshotMock,
}));

import { useConversationTrajectory } from './useConversationTrajectory';

function createStore() {
  return configureStore({
    reducer: { trajectory: trajectoryReducer },
  });
}

function createWrapper(store: ReturnType<typeof createStore>) {
  const TestProvider = Provider as unknown as React.ComponentType<{
    store: typeof store;
    children?: React.ReactNode;
  }>;
  return function TrajectoryTestProvider({ children }: { children: React.ReactNode }) {
    return React.createElement(TestProvider, { store }, children);
  };
}

function runSummary(
  runId: string,
  overrides: Partial<TrajectoryRunSummary> = {},
): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: `message-${runId}`,
    turn_message_id: `turn-${runId}`,
    attempt_index: 1,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 0,
    duration_ms: 100,
    started_at: '2026-08-22T00:00:00.000Z',
    ended_at: '2026-08-22T00:00:00.100Z',
    ...overrides,
  };
}

function snapshot(
  runId: string,
  sequences: number[] = [0],
  overrides: Partial<TrajectorySnapshot> = {},
): TrajectorySnapshot {
  return {
    run: runSummary(runId),
    records: sequences.map(sequence => ({
      sequence,
      event_type: sequence === 0 ? 'run_started' : 'step_started',
      schema_version: 1,
      timestamp: `2026-08-22T00:00:0${sequence}.000Z`,
      step_id: sequence === 0 ? null : `step-${sequence}`,
      tool_call_id: null,
      parent_step_id: null,
      trace_id: `trace-${runId}`,
      span_id: null,
      payload: sequence === 0
        ? { conversation_id: 'conversation-a', message_id: `message-${runId}` }
        : { step_number: sequence },
    })),
    spans: [],
    completeness: {
      status: 'complete',
      degraded_reason: null,
      event_count: sequences.length,
      expected_last_sequence: sequences.at(-1) ?? null,
      loaded_event_count: sequences.length,
      first_sequence: sequences[0] ?? null,
      last_sequence: sequences.at(-1) ?? null,
    },
    truncated: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function terminalEvent(runId: string, sequence: number) {
  const event = normalizeSseTrajectoryEvent({
    type: 'run_completed',
    schema_version: 1,
    run_id: runId,
    sequence,
    ts: 1787356800 + sequence,
    trace_id: `trace-${runId}`,
    step_id: null,
    tool_call_id: null,
    parent_step_id: null,
    total_steps: 1,
    total_tool_calls: 0,
    finish_reason: 'stop',
  });
  if (!event) throw new Error('测试终态事件必须可归一化');
  return event;
}

describe('useConversationTrajectory', () => {
  beforeEach(() => {
    getTrajectoryRunsMock.mockReset();
    getTrajectorySnapshotMock.mockReset();
  });

  it('页面首载只拉 run list，并默认选择 started_at 最新 attempt', async () => {
    const store = createStore();
    getTrajectoryRunsMock.mockResolvedValue({
      items: [
        runSummary('run-old', { started_at: '2026-08-22T01:00:00.000Z' }),
        runSummary('run-new', { started_at: '2026-08-22T03:00:00.000Z' }),
      ],
      truncated: false,
    });

    const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => expect(result.current.runListStatus).toBe('ready'));
    expect(result.current.runs.map(run => run.run_id)).toEqual(['run-old', 'run-new']);
    expect(result.current.selectedRunId).toBe('run-new');
    expect(getTrajectoryRunsMock).toHaveBeenCalledWith(
      'conversation-a',
      expect.any(AbortSignal),
    );
    expect(getTrajectorySnapshotMock).not.toHaveBeenCalled();
  });

  it('同一 conversation 的并发 hook 挂载共享 slice 中的单个 run-list 请求', async () => {
    const store = createStore();
    const pendingRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    getTrajectoryRunsMock.mockReturnValue(pendingRequest.promise);

    const { result } = renderHook(() => [
      useConversationTrajectory('conversation-a'),
      useConversationTrajectory('conversation-a'),
    ] as const, { wrapper: createWrapper(store) });

    expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pendingRequest.resolve({ items: [runSummary('run-a')], truncated: false });
      await pendingRequest.promise;
    });
    await waitFor(() => {
      expect(result.current[0].runListStatus).toBe('ready');
      expect(result.current[1].runListStatus).toBe('ready');
    });
  });

  it('Trajectory 激活后只水合 selected run', async () => {
    const store = createStore();
    getTrajectoryRunsMock.mockResolvedValue({
      items: [
        runSummary('run-old', { started_at: '2026-08-22T01:00:00.000Z' }),
        runSummary('run-new', { started_at: '2026-08-22T03:00:00.000Z' }),
      ],
      truncated: false,
    });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot('run-new'));
    const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(result.current.selectedRunId).toBe('run-new'));

    act(() => {
      store.dispatch(setTrajectoryActiveSurface({
        conversationId: 'conversation-a',
        surface: 'trajectory',
      }));
    });

    await waitFor(() => expect(result.current.snapshot?.run.run_id).toBe('run-new'));
    expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(1);
    expect(getTrajectorySnapshotMock).toHaveBeenCalledWith(
      'conversation-a',
      'run-new',
      expect.any(AbortSignal),
    );
  });

  it('快速切 run 会 abort 旧请求，忽略不遵守 signal 的迟到成功', async () => {
    const store = createStore();
    const staleRequest = deferred<TrajectorySnapshot>();
    let staleSignal: AbortSignal | undefined;
    getTrajectoryRunsMock.mockResolvedValue({
      items: [
        runSummary('run-a', { started_at: '2026-08-22T03:00:00.000Z' }),
        runSummary('run-b', { started_at: '2026-08-22T02:00:00.000Z' }),
      ],
      truncated: false,
    });
    getTrajectorySnapshotMock.mockImplementation(
      (_conversationId: string, runId: string, signal: AbortSignal) => {
        if (runId === 'run-a') {
          staleSignal = signal;
          return staleRequest.promise;
        }
        return Promise.resolve(snapshot('run-b'));
      },
    );
    const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(result.current.selectedRunId).toBe('run-a'));
    act(() => {
      store.dispatch(setTrajectoryActiveSurface({
        conversationId: 'conversation-a',
        surface: 'trajectory',
      }));
    });
    await waitFor(() => expect(staleSignal).toBeDefined());

    act(() => {
      store.dispatch(selectTrajectoryTarget({
        conversationId: 'conversation-a',
        messageId: 'message-run-b',
        runId: 'run-b',
        spanId: null,
      }));
    });

    await waitFor(() => expect(staleSignal?.aborted).toBe(true));
    await waitFor(() => expect(result.current.snapshot?.run.run_id).toBe('run-b'));
    await act(async () => {
      staleRequest.resolve(snapshot('run-a', [0, 1, 2]));
      await staleRequest.promise;
    });

    expect(store.getState().trajectory.byConversationId['conversation-a']
      .snapshotsByRunId['run-a']).toBeUndefined();
    expect(result.current.snapshot?.run.run_id).toBe('run-b');
  });

  it('快速切 conversation 会 abort 旧 run-list 请求且迟到结果不串入新会话', async () => {
    const staleRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    const store = createStore();
    let staleSignal: AbortSignal | undefined;
    getTrajectoryRunsMock.mockImplementation((conversationId: string, signal: AbortSignal) => {
      if (conversationId === 'conversation-a') {
        staleSignal = signal;
        return staleRequest.promise;
      }
      return Promise.resolve({ items: [runSummary('run-b')], truncated: false });
    });

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) => useConversationTrajectory(conversationId),
      {
        initialProps: { conversationId: 'conversation-a' },
        wrapper: createWrapper(store),
      },
    );
    await waitFor(() => expect(staleSignal).toBeDefined());

    rerender({ conversationId: 'conversation-b' });

    await waitFor(() => expect(staleSignal?.aborted).toBe(true));
    await waitFor(() => expect(result.current.selectedRunId).toBe('run-b'));
    await act(async () => {
      staleRequest.resolve({ items: [runSummary('run-stale')], truncated: false });
      await staleRequest.promise;
    });

    expect(result.current.runs.map(run => run.run_id)).toEqual(['run-b']);
    expect(store.getState().trajectory.byConversationId['conversation-a'].runs).toEqual([]);
  });

  it('切回 LRU 命中的 run 不重复拉 snapshot', async () => {
    const store = createStore();
    getTrajectoryRunsMock.mockResolvedValue({
      items: [
        runSummary('run-a', { started_at: '2026-08-22T03:00:00.000Z' }),
        runSummary('run-b', { started_at: '2026-08-22T02:00:00.000Z' }),
      ],
      truncated: false,
    });
    getTrajectorySnapshotMock.mockImplementation(
      (_conversationId: string, runId: string) => Promise.resolve(snapshot(runId)),
    );
    const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(result.current.selectedRunId).toBe('run-a'));
    act(() => {
      store.dispatch(setTrajectoryActiveSurface({
        conversationId: 'conversation-a',
        surface: 'trajectory',
      }));
    });
    await waitFor(() => expect(result.current.snapshot?.run.run_id).toBe('run-a'));
    act(() => {
      store.dispatch(selectTrajectoryTarget({
        conversationId: 'conversation-a',
        messageId: 'message-run-b',
        runId: 'run-b',
        spanId: null,
      }));
    });
    await waitFor(() => expect(result.current.snapshot?.run.run_id).toBe('run-b'));
    act(() => {
      store.dispatch(selectTrajectoryTarget({
        conversationId: 'conversation-a',
        messageId: 'message-run-a',
        runId: 'run-a',
        spanId: null,
      }));
    });
    await waitFor(() => expect(result.current.snapshot?.run.run_id).toBe('run-a'));

    expect(getTrajectorySnapshotMock.mock.calls.filter(([, runId]) => runId === 'run-a'))
      .toHaveLength(1);
    expect(store.getState().trajectory.byConversationId['conversation-a'].snapshotLru.at(-1))
      .toBe('run-a');
  });

  it('LRU 驱逐后的 selected run 会重新拉取 snapshot', async () => {
    const store = createStore();
    for (let index = 0; index < 9; index += 1) {
      store.dispatch(trajectorySnapshotRequested({
        conversationId: 'conversation-a',
        runId: `run-${index}`,
        requestId: `seed-${index}`,
      }));
      store.dispatch(trajectorySnapshotReceived({
        conversationId: 'conversation-a',
        requestId: `seed-${index}`,
        snapshot: snapshot(`run-${index}`),
      }));
    }
    store.dispatch(selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'message-run-0',
      runId: 'run-0',
      spanId: null,
    }));
    store.dispatch(setTrajectoryActiveSurface({
      conversationId: 'conversation-a',
      surface: 'trajectory',
    }));
    getTrajectoryRunsMock.mockResolvedValue({ items: [], truncated: false });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot('run-0', [0, 1]));

    const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => expect(result.current.snapshot?.events).toHaveLength(2));
    expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(1);
    expect(getTrajectorySnapshotMock.mock.calls[0][1]).toBe('run-0');
  });

  it('terminal reconciling 每周期只 refetch 一次，失败显式收口且手动 retry 可恢复', async () => {
    const store = createStore();
    store.dispatch(trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'seed-a',
    }));
    store.dispatch(trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'seed-a',
      snapshot: snapshot('run-a', [0, 1]),
    }));
    store.dispatch(selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'message-run-a',
      runId: 'run-a',
      spanId: null,
    }));
    const failedRequest = deferred<TrajectorySnapshot>();
    const reconciledSnapshot = snapshot('run-a', [0, 1, 2, 3], {
      completeness: {
        status: 'degraded',
        degraded_reason: 'recorder_timeout',
        event_count: 4,
        expected_last_sequence: 3,
        loaded_event_count: 4,
        first_sequence: 0,
        last_sequence: 3,
      },
      truncated: true,
    });
    getTrajectoryRunsMock.mockResolvedValue({ items: [runSummary('run-a')], truncated: false });
    getTrajectorySnapshotMock
      .mockReturnValueOnce(failedRequest.promise)
      .mockResolvedValueOnce(reconciledSnapshot);
    const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });

    act(() => {
      store.dispatch(mergeLiveTrajectoryEvent({
        conversationId: 'conversation-a',
        event: terminalEvent('run-a', 3),
      }));
    });
    await waitFor(() => expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      failedRequest.reject(new Error('终态读取失败'));
      try {
        await failedRequest.promise;
      } catch {
        // hook 负责把错误写入显式状态。
      }
    });
    await waitFor(() => expect(result.current.reconciliation?.status).toBe('failed'));
    expect(result.current.reconciliation?.error).toBe('终态读取失败');
    expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retrySelectedSnapshot();
    });

    await waitFor(() => expect(result.current.reconciliation?.status).toBe('ready'));
    expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(2);
    expect(result.current.snapshot).toMatchObject({
      truncated: true,
      completeness: {
        status: 'degraded',
        degraded_reason: 'recorder_timeout',
      },
    });
  });

  it('run-list 404 与空列表是正常空态，鉴权错误仍是 failed', async () => {
    const emptyStore = createStore();
    getTrajectoryRunsMock.mockRejectedValueOnce(
      new ApiError('NOT_FOUND', '会话不存在', 'request-404'),
    );
    const emptyHook = renderHook(() => useConversationTrajectory('conversation-empty'), {
      wrapper: createWrapper(emptyStore),
    });
    await waitFor(() => expect(emptyHook.result.current.runListStatus).toBe('ready'));
    expect(emptyHook.result.current.runs).toEqual([]);
    expect(emptyHook.result.current.runListError).toBeNull();
    emptyHook.unmount();

    const unauthorizedStore = createStore();
    getTrajectoryRunsMock.mockRejectedValueOnce(
      new ApiError('UNAUTHORIZED', 'Unauthorized', 'request-401'),
    );
    const unauthorizedHook = renderHook(
      () => useConversationTrajectory('conversation-unauthorized'),
      { wrapper: createWrapper(unauthorizedStore) },
    );
    await waitFor(() => expect(unauthorizedHook.result.current.runListStatus).toBe('failed'));
    expect(unauthorizedHook.result.current.runListError).toBe('Unauthorized');
  });

  it('snapshot 404 进入可区分的正常 unavailable 状态，网络错误保持 failed', async () => {
    const unavailableStore = createStore();
    getTrajectoryRunsMock.mockResolvedValueOnce({
      items: [runSummary('run-missing')],
      truncated: false,
    });
    getTrajectorySnapshotMock.mockRejectedValueOnce(
      new ApiError('NOT_FOUND', '轨迹不存在', 'request-404'),
    );
    const unavailableHook = renderHook(
      () => useConversationTrajectory('conversation-unavailable'),
      { wrapper: createWrapper(unavailableStore) },
    );
    await waitFor(() => expect(unavailableHook.result.current.selectedRunId).toBe('run-missing'));
    act(() => {
      unavailableStore.dispatch(setTrajectoryActiveSurface({
        conversationId: 'conversation-unavailable',
        surface: 'trajectory',
      }));
    });
    await waitFor(() => expect(unavailableHook.result.current.reconciliation?.status)
      .toBe('unavailable'));
    expect(unavailableHook.result.current.reconciliation?.error).toBeNull();
    unavailableHook.unmount();

    const failedStore = createStore();
    getTrajectoryRunsMock.mockResolvedValueOnce({
      items: [runSummary('run-failed')],
      truncated: false,
    });
    getTrajectorySnapshotMock.mockRejectedValueOnce(new Error('网络中断'));
    const failedHook = renderHook(() => useConversationTrajectory('conversation-failed'), {
      wrapper: createWrapper(failedStore),
    });
    await waitFor(() => expect(failedHook.result.current.selectedRunId).toBe('run-failed'));
    act(() => {
      failedStore.dispatch(setTrajectoryActiveSurface({
        conversationId: 'conversation-failed',
        surface: 'trajectory',
      }));
    });
    await waitFor(() => expect(failedHook.result.current.reconciliation?.status).toBe('failed'));
    expect(failedHook.result.current.reconciliation?.error).toBe('网络中断');
  });
});
