import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore, type UnknownAction } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeSseTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import trajectoryReducer, {
  mergeLiveTrajectoryEvent,
  requestTrajectoryInspect,
  selectTrajectoryTarget,
  setTrajectoryActiveSurface,
  setTrajectoryInspectorOpen,
  setTrajectoryScrollMode,
  trajectoryRunListReceived,
  trajectoryRunListRequested,
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

interface TestAuthState {
  isAuthenticated: boolean;
  user: { id: string } | null;
  token: string | null;
}

function testAuthReducer(
  state: TestAuthState = { isAuthenticated: true, user: { id: 'user-a' }, token: null },
  action: UnknownAction,
): TestAuthState {
  if (action.type === 'test/refresh-token' && typeof action.payload === 'string') {
    return { ...state, token: action.payload };
  }
  if (action.type !== 'test/switch-auth' || typeof action.payload !== 'string') return state;
  return { isAuthenticated: true, user: { id: action.payload }, token: null };
}

function createAuthenticatedStore() {
  return configureStore({
    reducer: { trajectory: trajectoryReducer, auth: testAuthReducer },
  });
}

function unsignedToken(subject: string, nonce: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return `${encode({ alg: 'none', typ: 'JWT', nonce })}.${encode({ sub: subject })}.`;
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

function stepEvent(runId: string, sequence: number) {
  const event = normalizeSseTrajectoryEvent({
    type: 'step_started',
    schema_version: 1,
    run_id: runId,
    sequence,
    ts: 1787356800 + sequence,
    trace_id: `trace-${runId}`,
    step_id: `step-${sequence}`,
    tool_call_id: null,
    parent_step_id: null,
    step_number: sequence,
  });
  if (!event) throw new Error('测试步骤事件必须可归一化');
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

  it('动作前强制刷新 run list，并在 Redux 接受最新结果后返回 ready', async () => {
    const store = createStore();
    const refreshRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    getTrajectoryRunsMock
      .mockResolvedValueOnce({ items: [runSummary('run-old')], truncated: false })
      .mockReturnValueOnce(refreshRequest.promise);
    const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(result.current.runListStatus).toBe('ready'));

    let refreshResult!: Promise<string>;
    act(() => {
      refreshResult = result.current.refreshRuns();
    });
    expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      refreshRequest.resolve({
        items: [
          runSummary('run-old'),
          runSummary('run-new', { attempt_index: 2 }),
        ],
        truncated: false,
      });
      await expect(refreshResult).resolves.toBe('ready');
    });
    expect(store.getState().trajectory.byConversationId['conversation-a'].runs)
      .toHaveLength(2);
  });

  it('首载请求仍在进行时，动作刷新等待首载后再发起独立 freshness 请求', async () => {
    const store = createStore();
    const initialRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    const freshnessRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    getTrajectoryRunsMock
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(freshnessRequest.promise);
    const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(1));

    let refreshResult!: Promise<string>;
    act(() => {
      refreshResult = result.current.refreshRuns();
    });
    await act(async () => {
      initialRequest.resolve({ items: [runSummary('run-old')], truncated: false });
      await initialRequest.promise;
    });
    await waitFor(() => expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      freshnessRequest.resolve({
        items: [runSummary('run-old'), runSummary('run-new')],
        truncated: false,
      });
      await expect(refreshResult).resolves.toBe('ready');
    });
    expect(result.current.runs.map(item => item.run_id)).toEqual(['run-old', 'run-new']);
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

  it('两个独立 store 的同 key 请求各自完成，结果不会只派发给先发起的 store', async () => {
    const firstStore = createStore();
    const secondStore = createStore();
    const firstRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    const secondRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    getTrajectoryRunsMock
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const firstHook = renderHook(() => useConversationTrajectory('conversation-shared'), {
      wrapper: createWrapper(firstStore),
    });
    const secondHook = renderHook(() => useConversationTrajectory('conversation-shared'), {
      wrapper: createWrapper(secondStore),
    });

    expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      firstRequest.resolve({ items: [runSummary('run-first')], truncated: false });
      await firstRequest.promise;
    });
    await waitFor(() => expect(firstHook.result.current.runListStatus).toBe('ready'));
    expect(firstHook.result.current.runs.map(run => run.run_id)).toEqual(['run-first']);
    expect(secondHook.result.current.runListStatus).toBe('loading');
    expect(secondHook.result.current.runs).toEqual([]);

    await act(async () => {
      secondRequest.resolve({ items: [runSummary('run-second')], truncated: false });
      await secondRequest.promise;
    });
    await waitFor(() => expect(secondHook.result.current.runListStatus).toBe('ready'));
    expect(secondHook.result.current.runs.map(run => run.run_id)).toEqual(['run-second']);
    expect(firstHook.result.current.runs.map(run => run.run_id)).toEqual(['run-first']);
  });

  it('同 store 切换认证身份会隔离旧请求，旧响应不能写入新会话作用域', async () => {
    const store = createAuthenticatedStore();
    const oldRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    const newRequest = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    let oldSignal: AbortSignal | undefined;
    getTrajectoryRunsMock
      .mockImplementationOnce((_conversationId: string, signal: AbortSignal) => {
        oldSignal = signal;
        return oldRequest.promise;
      })
      .mockReturnValueOnce(newRequest.promise);
    const { result } = renderHook(() => useConversationTrajectory('conversation-auth'), {
      wrapper: createWrapper(store as unknown as ReturnType<typeof createStore>),
    });
    await waitFor(() => expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(1));

    act(() => {
      store.dispatch({ type: 'test/switch-auth', payload: 'user-b' });
    });

    await waitFor(() => expect(oldSignal?.aborted).toBe(true));
    await waitFor(() => expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(2));
    await act(async () => {
      oldRequest.resolve({ items: [runSummary('run-user-a')], truncated: false });
      newRequest.resolve({ items: [runSummary('run-user-b')], truncated: false });
      await Promise.all([oldRequest.promise, newRequest.promise]);
    });
    await waitFor(() => expect(result.current.runListStatus).toBe('ready'));

    expect(result.current.runs.map(run => run.run_id)).toEqual(['run-user-b']);
    expect(result.current.selectedRunId).toBe('run-user-b');
  });

  it('completed cache 在认证身份变化时立即失效，并只接受新身份的独立 run list', async () => {
    const store = createAuthenticatedStore();
    const userBRuns = deferred<{ items: TrajectoryRunSummary[]; truncated: boolean }>();
    getTrajectoryRunsMock
      .mockResolvedValueOnce({ items: [runSummary('run-user-a')], truncated: false })
      .mockReturnValueOnce(userBRuns.promise);
    getTrajectorySnapshotMock.mockResolvedValue(snapshot('run-user-a', [0, 1]));
    const { result } = renderHook(() => useConversationTrajectory('conversation-auth-ready'), {
      wrapper: createWrapper(store as unknown as ReturnType<typeof createStore>),
    });
    await waitFor(() => expect(result.current.selectedRunId).toBe('run-user-a'));
    act(() => {
      store.dispatch(setTrajectoryActiveSurface({
        conversationId: 'conversation-auth-ready',
        surface: 'trajectory',
      }));
    });
    await waitFor(() => expect(result.current.snapshot?.run.run_id).toBe('run-user-a'));

    act(() => {
      store.dispatch({ type: 'test/switch-auth', payload: 'user-b' });
    });

    expect(result.current.runs).toEqual([]);
    expect(result.current.selectedRunId).toBeNull();
    expect(result.current.snapshot).toBeUndefined();
    await waitFor(() => expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(2));
    expect(result.current.runListStatus).toBe('loading');

    await act(async () => {
      userBRuns.resolve({ items: [runSummary('run-user-b')], truncated: false });
      await userBRuns.promise;
    });
    await waitFor(() => expect(result.current.runListStatus).toBe('ready'));
    expect(result.current.runs.map(run => run.run_id)).toEqual(['run-user-b']);
    expect(result.current.selectedRunId).toBe('run-user-b');
    expect(result.current.snapshot).toBeUndefined();
  });

  it('同一 stable identity 的 token refresh 不清 completed cache 或重复 GET', async () => {
    const store = createAuthenticatedStore();
    getTrajectoryRunsMock.mockResolvedValue({
      items: [runSummary('run-user-a')],
      truncated: false,
    });
    getTrajectorySnapshotMock.mockResolvedValue(snapshot('run-user-a', [0, 1]));
    const { result } = renderHook(() => useConversationTrajectory('conversation-token-refresh'), {
      wrapper: createWrapper(store as unknown as ReturnType<typeof createStore>),
    });
    await waitFor(() => expect(result.current.selectedRunId).toBe('run-user-a'));
    act(() => {
      store.dispatch(setTrajectoryActiveSurface({
        conversationId: 'conversation-token-refresh',
        surface: 'trajectory',
      }));
    });
    await waitFor(() => expect(result.current.snapshot?.run.run_id).toBe('run-user-a'));
    const runListCalls = getTrajectoryRunsMock.mock.calls.length;
    const snapshotCalls = getTrajectorySnapshotMock.mock.calls.length;

    act(() => {
      store.dispatch({
        type: 'test/refresh-token',
        payload: unsignedToken('user-a', 'rotated'),
      });
    });
    await act(async () => Promise.resolve());

    expect(result.current.runs.map(run => run.run_id)).toEqual(['run-user-a']);
    expect(result.current.selectedRunId).toBe('run-user-a');
    expect(result.current.snapshot?.run.run_id).toBe('run-user-a');
    expect(getTrajectoryRunsMock).toHaveBeenCalledTimes(runListCalls);
    expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(snapshotCalls);
  });

  it('同 store 两个 snapshot consumer 共享请求，发起者先卸载不会 abort 或额外 GET', async () => {
    const store = createStore();
    store.dispatch(trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'seed-runs',
    }));
    store.dispatch(trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'seed-runs',
      response: { items: [runSummary('run-a')], truncated: false },
    }));
    store.dispatch(setTrajectoryActiveSurface({
      conversationId: 'conversation-a',
      surface: 'trajectory',
    }));
    const pendingSnapshot = deferred<TrajectorySnapshot>();
    let sharedSignal: AbortSignal | undefined;
    getTrajectorySnapshotMock.mockImplementation(
      (_conversationId: string, _runId: string, signal: AbortSignal) => {
        sharedSignal = signal;
        return pendingSnapshot.promise;
      },
    );

    const ownerHook = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(1));
    const remainingHook = renderHook(() => useConversationTrajectory('conversation-a'), {
      wrapper: createWrapper(store),
    });
    await act(async () => Promise.resolve());

    ownerHook.unmount();

    expect(sharedSignal?.aborted).toBe(false);
    expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      pendingSnapshot.resolve(snapshot('run-a', [0, 1]));
      await pendingSnapshot.promise;
    });
    await waitFor(() => expect(remainingHook.result.current.snapshot?.events).toHaveLength(2));
    expect(getTrajectorySnapshotMock).toHaveBeenCalledTimes(1);
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

  it('隐藏 cleanup 后手动执行已取消的旧 rAF，也不能覆盖重新激活后的当前 detail', () => {
    const callbacks: FrameRequestCallback[] = [];
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callbacks.push(callback);
        return callbacks.length;
      });
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined);

    try {
      const store = createStore();
      store.dispatch(trajectoryRunListRequested({
        conversationId: 'conversation-a',
        requestId: 'seed-runs',
      }));
      store.dispatch(trajectoryRunListReceived({
        conversationId: 'conversation-a',
        requestId: 'seed-runs',
        response: { items: [runSummary('run-a')], truncated: false },
      }));
      store.dispatch(trajectorySnapshotRequested({
        conversationId: 'conversation-a',
        runId: 'run-a',
        requestId: 'seed-snapshot',
      }));
      store.dispatch(trajectorySnapshotReceived({
        conversationId: 'conversation-a',
        requestId: 'seed-snapshot',
        snapshot: snapshot('run-a', [0]),
      }));
      store.dispatch(setTrajectoryActiveSurface({
        conversationId: 'conversation-a',
        surface: 'trajectory',
      }));
      const { result } = renderHook(() => useConversationTrajectory('conversation-a'), {
        wrapper: createWrapper(store),
      });

      act(() => {
        store.dispatch(mergeLiveTrajectoryEvent({
          conversationId: 'conversation-a',
          event: stepEvent('run-a', 1),
        }));
      });
      expect(callbacks).toHaveLength(1);
      const staleFrame = callbacks[0];

      act(() => {
        store.dispatch(setTrajectoryActiveSurface({
          conversationId: 'conversation-a',
          surface: 'chat',
        }));
      });
      act(() => {
        store.dispatch(mergeLiveTrajectoryEvent({
          conversationId: 'conversation-a',
          event: stepEvent('run-a', 2),
        }));
      });
      act(() => {
        store.dispatch(setTrajectoryActiveSurface({
          conversationId: 'conversation-a',
          surface: 'trajectory',
        }));
      });
      expect(result.current.liveEventsByRunId['run-a'].map(event => event.sequence))
        .toEqual([1, 2]);

      act(() => staleFrame(performance.now()));

      expect(result.current.liveEventsByRunId['run-a'].map(event => event.sequence))
        .toEqual([1, 2]);
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
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
    await waitFor(() => expect(emptyHook.result.current.runListStatus).toBe('unavailable'));
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

  it('已有 selection 与 snapshot 时 run-list 404 会清空整段 conversation 轨迹缓存', async () => {
    const store = createStore();
    store.dispatch(trajectoryRunListRequested({
      conversationId: 'conversation-stale',
      requestId: 'seed-runs',
    }));
    store.dispatch(trajectoryRunListReceived({
      conversationId: 'conversation-stale',
      requestId: 'seed-runs',
      response: { items: [runSummary('run-stale')], truncated: true },
    }));
    store.dispatch(trajectorySnapshotRequested({
      conversationId: 'conversation-stale',
      runId: 'run-stale',
      requestId: 'seed-snapshot',
    }));
    store.dispatch(trajectorySnapshotReceived({
      conversationId: 'conversation-stale',
      requestId: 'seed-snapshot',
      snapshot: snapshot('run-stale', [0, 1]),
    }));
    store.dispatch(mergeLiveTrajectoryEvent({
      conversationId: 'conversation-stale',
      event: normalizeSseTrajectoryEvent({
        type: 'step_started',
        schema_version: 1,
        run_id: 'run-stale',
        sequence: 2,
        ts: 1787356802,
        trace_id: 'trace-run-stale',
        step_id: 'step-2',
        tool_call_id: null,
        parent_step_id: null,
        step_number: 2,
      })!,
    }));
    store.dispatch(requestTrajectoryInspect({
      conversationId: 'conversation-stale',
      requestId: 'inspect-stale',
      messageId: 'message-run-stale',
      runId: 'run-stale',
      spanId: 'span-stale',
    }));
    store.dispatch(setTrajectoryScrollMode({
      conversationId: 'conversation-stale',
      mode: 'manual',
    }));
    store.dispatch(setTrajectoryInspectorOpen({
      conversationId: 'conversation-stale',
      isOpen: true,
    }));
    getTrajectoryRunsMock.mockRejectedValue(
      new ApiError('NOT_FOUND', '会话不存在', 'request-404'),
    );

    const { result } = renderHook(() => useConversationTrajectory('conversation-stale'), {
      wrapper: createWrapper(store),
    });
    expect(result.current.runs.map(run => run.run_id)).toEqual(['run-stale']);
    expect(result.current.snapshot?.run.run_id).toBe('run-stale');

    act(() => {
      void result.current.refreshRuns();
    });

    await waitFor(() => expect(result.current.runListStatus).toBe('unavailable'));
    expect(result.current.runs).toEqual([]);
    expect(result.current.selectedRunId).toBeNull();
    expect(result.current.snapshot).toBeUndefined();
    expect(result.current.inspectRequest).toBeNull();
    expect(result.current.activeSurface).toBe('chat');
    expect(store.getState().trajectory.byConversationId['conversation-stale']).toMatchObject({
      runs: [],
      runSummariesById: {},
      provisionalRunIds: [],
      snapshotsByRunId: {},
      liveEventsByRunId: {},
      reconciliationByRunId: {},
      snapshotLru: [],
      selectedMessageId: null,
      selectedRunId: null,
      selectedSpanId: null,
      selectionSource: 'none',
      inspectRequest: null,
      activeSurface: 'chat',
      scrollMode: 'follow-live',
      isInspectorOpen: false,
    });
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
