import React from 'react';
import { act, render } from '@testing-library/react';
import { combineReducers, configureStore, type Reducer } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ChatMessageList from '@/components/chat/ChatMessageList';
import { ToastProvider } from '@/components/ui/toast';
import { normalizeSseTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import trajectoryReducer, {
  mergeLiveTrajectoryEvent,
  setTrajectoryActiveSurface,
  trajectoryRunListReceived,
  trajectoryRunListRequested,
  trajectorySnapshotReceived,
  trajectorySnapshotRequested,
} from '@/redux/slices/trajectorySlice';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary, TrajectorySnapshot } from '@/types/trajectory';

const {
  getTrajectoryRunsMock,
  getTrajectorySnapshotMock,
  projectionProbe,
  trajectoryRenderProbe,
} = vi.hoisted(() => ({
  getTrajectoryRunsMock: vi.fn(),
  getTrajectorySnapshotMock: vi.fn(),
  projectionProbe: { calls: 0 },
  trajectoryRenderProbe: { calls: 0 },
}));

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryRuns: getTrajectoryRunsMock,
  getTrajectorySnapshot: getTrajectorySnapshotMock,
}));

vi.mock('@/lib/trajectory/TrajectoryCellProjection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/trajectory/TrajectoryCellProjection')>();
  return {
    ...actual,
    projectTrajectoryCells: (...args: Parameters<typeof actual.projectTrajectoryCells>) => {
      projectionProbe.calls += 1;
      return actual.projectTrajectoryCells(...args);
    },
  };
});

vi.mock('@/hooks/useConversationTrajectory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useConversationTrajectory')>();
  return {
    ...actual,
    useConversationTrajectory: (...args: Parameters<typeof actual.useConversationTrajectory>) => {
      trajectoryRenderProbe.calls += 1;
      return actual.useConversationTrajectory(...args);
    },
  };
});

import TrajectoryTabView from './TrajectoryTabView';

const messages: Message[] = [
  { id: 'user-1', role: 'user', content: [{ type: 'text', id: 'q-1', text: '执行任务' }] },
  { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', id: 'a-1', text: '结果' }] },
];

const STREAM_EVENT_COUNT = 5000;
const EXISTING_STREAM_BASELINE = { eventCount: 1000, elapsedMs: 500 } as const;
// 沿用既有 adapter/store 基线，并为全量并行测试保留双倍调度余量；复杂度以调用次数为主门禁。
const STREAM_TIME_BUDGET_MS = EXISTING_STREAM_BASELINE.elapsedMs
  * (STREAM_EVENT_COUNT / EXISTING_STREAM_BASELINE.eventCount)
  * 2;
const PROJECTION_TIME_BUDGET_MS = 750;

function runSummary(): TrajectoryRunSummary {
  return {
    run_id: 'run-1',
    message_id: 'assistant-1',
    turn_message_id: 'user-1',
    attempt_index: 0,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 0,
    duration_ms: 100,
    started_at: '2026-08-22T00:00:00.000Z',
    ended_at: '2026-08-22T00:00:00.100Z',
  };
}

function snapshot(prefixSize: number): TrajectorySnapshot {
  const run = runSummary();
  return {
    run,
    records: Array.from({ length: prefixSize }, (_, sequence) => ({
      sequence,
      event_type: sequence === 0 ? 'run_started' : 'tool_attempt_started',
      schema_version: 1,
      timestamp: new Date(Date.UTC(2026, 7, 22, 0, 0, 0, sequence)).toISOString(),
      step_id: sequence === 0 ? null : `step-${sequence}`,
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-run-1',
      span_id: sequence === 0 ? null : `attempt:attempt-${sequence}`,
      payload: sequence === 0
        ? {
            type: 'run_started',
            run_id: 'run-1',
            conversation_id: 'chat-a',
            message_id: 'assistant-1',
          }
        : {
            type: 'tool_attempt_started',
            run_id: 'run-1',
            tool_attempt_id: `attempt-${sequence}`,
            tool_name: 'web_search',
            attempt_index: sequence,
          },
    })),
    spans: [],
    completeness: {
      status: 'complete',
      degraded_reason: null,
      event_count: prefixSize,
      expected_last_sequence: prefixSize - 1,
      loaded_event_count: prefixSize,
      first_sequence: prefixSize ? 0 : null,
      last_sequence: prefixSize ? prefixSize - 1 : null,
    },
    truncated: false,
  };
}

function staticReducer<T>(initialState: T): Reducer<T> {
  return (state = initialState) => state;
}

function createTestStore(prefixSize: number, surface: 'chat' | 'trajectory') {
  const store = configureStore({
    reducer: combineReducers({
      trajectory: trajectoryReducer,
      auth: staticReducer({ isAuthenticated: false, user: null, token: null }),
      conversation: staticReducer({ byId: { 'chat-a': { messages } } }),
      stream: staticReducer({
        isStreaming: false,
        lastError: null,
        currentRun: null,
        messageId: null,
      }),
      models: staticReducer({ models: [], selectedModelId: null }),
    }),
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(trajectoryRunListRequested({ conversationId: 'chat-a', requestId: 'runs' }));
  store.dispatch(trajectoryRunListReceived({
    conversationId: 'chat-a',
    requestId: 'runs',
    response: { items: [runSummary()], truncated: false },
  }));
  store.dispatch(trajectorySnapshotRequested({
    conversationId: 'chat-a',
    runId: 'run-1',
    requestId: 'snapshot',
  }));
  store.dispatch(trajectorySnapshotReceived({
    conversationId: 'chat-a',
    requestId: 'snapshot',
    snapshot: snapshot(prefixSize),
  }));
  store.dispatch(setTrajectoryActiveSurface({ conversationId: 'chat-a', surface }));
  return store;
}

function liveEvent(sequence: number) {
  const normalized = normalizeSseTrajectoryEvent({
    type: 'tool_attempt_started',
    schema_version: 1,
    run_id: 'run-1',
    sequence,
    ts: 1_787_356_800 + sequence / 1000,
    trace_id: 'trace-run-1',
    step_id: `step-live-${sequence}`,
    tool_call_id: null,
    parent_step_id: null,
    tool_attempt_id: `live-attempt-${sequence}`,
    tool_name: 'web_search',
    attempt_index: sequence,
  });
  if (!normalized) throw new Error('性能 fixture 必须通过 trajectory adapter');
  return normalized;
}

function renderForceMountedSurfaces(store: ReturnType<typeof createTestStore>) {
  const TestProvider = Provider as unknown as React.ComponentType<{
    store: typeof store;
    children: React.ReactNode;
  }>;
  const visible = store.getState().trajectory.byConversationId['chat-a']?.activeSurface
    === 'trajectory';
  return render(
    <TestProvider store={store}>
      <ToastProvider>
        <ChatMessageList messages={messages} conversationId="chat-a" />
        <TrajectoryTabView conversationId="chat-a" messages={messages} visible={visible} />
      </ToastProvider>
    </TestProvider>,
  );
}

async function dispatchStreamingEvents(
  store: ReturnType<typeof createTestStore>,
  startSequence: number,
) {
  for (let chunkStart = 0; chunkStart < STREAM_EVENT_COUNT; chunkStart += 100) {
    await act(async () => {
      for (let offset = 0; offset < 100; offset += 1) {
        store.dispatch(mergeLiveTrajectoryEvent({
          conversationId: 'chat-a',
          event: liveEvent(startSequence + chunkStart + offset),
        }));
      }
      await Promise.resolve();
    });
  }
}

describe('Trajectory force-mount 流式性能', () => {
  const animationFrames: FrameRequestCallback[] = [];
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

  beforeEach(() => {
    projectionProbe.calls = 0;
    trajectoryRenderProbe.calls = 0;
    getTrajectoryRunsMock.mockReset();
    getTrajectorySnapshotMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    animationFrames.splice(0);
    vi.restoreAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
  });

  it('Chat surface 首次停留和逐条接收 5000 events 都不调用 full projector', async () => {
    const store = createTestStore(20, 'chat');
    const startedAt = performance.now();
    renderForceMountedSurfaces(store);
    trajectoryRenderProbe.calls = 0;
    await dispatchStreamingEvents(store, 20);
    const elapsedMs = performance.now() - startedAt;

    expect(projectionProbe.calls).toBe(0);
    expect(trajectoryRenderProbe.calls).toBeLessThanOrEqual(2);
    expect(elapsedMs, `Chat surface 5000 条真实 dispatch 耗时 ${elapsedMs.toFixed(2)}ms`)
      .toBeLessThan(STREAM_TIME_BUDGET_MS);
  });

  it('Trajectory surface 对 5000 个逐条 dispatch 只做有界帧投影且 DOM 不超过 200', async () => {
    const store = createTestStore(20, 'trajectory');
    renderForceMountedSurfaces(store);
    projectionProbe.calls = 0;
    trajectoryRenderProbe.calls = 0;

    const startedAt = performance.now();
    await dispatchStreamingEvents(store, 20);
    expect(projectionProbe.calls).toBe(0);
    expect(trajectoryRenderProbe.calls).toBeLessThanOrEqual(2);

    await act(async () => {
      const callbacks = animationFrames.splice(0);
      callbacks.forEach(callback => callback(performance.now()));
      await Promise.resolve();
    });
    const elapsedMs = performance.now() - startedAt;

    expect(projectionProbe.calls).toBeLessThanOrEqual(2);
    expect(trajectoryRenderProbe.calls).toBeLessThanOrEqual(3);
    expect(document.querySelectorAll('[role="option"]').length).toBeLessThanOrEqual(200);
    expect(elapsedMs, `Trajectory surface 5000 条真实 dispatch + 投影耗时 ${elapsedMs.toFixed(2)}ms`)
      .toBeLessThan(STREAM_TIME_BUDGET_MS + PROJECTION_TIME_BUDGET_MS);
  });
});
