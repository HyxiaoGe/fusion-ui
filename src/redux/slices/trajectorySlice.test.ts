import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { normalizeSseTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import type { TrajectoryRunSummary, TrajectorySnapshot } from '@/types/trajectory';
import streamReducer, { initRun, startStream } from './streamSlice';
import trajectoryReducer, {
  consumeTrajectoryInspectRequest,
  mergeLiveTrajectoryEvent,
  requestTrajectoryInspect,
  selectMergedTrajectoryEvents,
  selectTrajectoryTarget,
  setTrajectoryActiveSurface,
  setTrajectoryInspectorOpen,
  setTrajectoryScrollMode,
  trajectoryRunListFailed,
  trajectoryRunListReceived,
  trajectoryRunListRequested,
  trajectorySnapshotFailed,
  trajectorySnapshotReceived,
  trajectorySnapshotRequested,
} from './trajectorySlice';

const reducer = trajectoryReducer;

function runSummary(runId: string, overrides: Partial<TrajectoryRunSummary> = {}): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: `message-${runId}`,
    turn_message_id: `turn-${runId}`,
    attempt_index: 0,
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

function snapshot(runId: string, sequences: number[]): TrajectorySnapshot {
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
  };
}

function liveEvent(
  runId: string,
  sequence: number,
  overrides: Record<string, unknown> = {},
) {
  const event = normalizeSseTrajectoryEvent({
    type: sequence === 0 ? 'run_started' : 'step_started',
    schema_version: 1,
    run_id: runId,
    sequence,
    ts: 1787356800 + sequence,
    trace_id: `trace-${runId}`,
    step_id: sequence === 0 ? null : `step-${sequence}`,
    tool_call_id: null,
    parent_step_id: null,
    conversation_id: 'conversation-a',
    message_id: `message-${runId}`,
    step_number: sequence,
    ...overrides,
  });
  if (!event) throw new Error('测试事件必须可归一化');
  return event;
}

describe('trajectorySlice', () => {
  it('按 conversation 隔离 run list 的 loading、结果和错误', () => {
    let state = reducer(undefined, trajectoryRunListRequested({ conversationId: 'conversation-a' }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      response: { items: [runSummary('run-a')], truncated: true },
    }));
    state = reducer(state, trajectoryRunListRequested({ conversationId: 'conversation-b' }));
    state = reducer(state, trajectoryRunListFailed({
      conversationId: 'conversation-b',
      error: '网络异常',
    }));

    expect(state.byConversationId['conversation-a']).toMatchObject({
      runListStatus: 'ready',
      runListError: null,
      runsTruncated: true,
      runs: [expect.objectContaining({ run_id: 'run-a' })],
    });
    expect(state.byConversationId['conversation-b']).toMatchObject({
      runListStatus: 'failed',
      runListError: '网络异常',
      runsTruncated: false,
      runs: [],
    });
  });

  it('维护 surface、选择、滚动、inspector 与可按 requestId 一次消费的 inspect 请求', () => {
    let state = reducer(undefined, setTrajectoryActiveSurface({
      conversationId: 'conversation-a',
      surface: 'trajectory',
    }));
    state = reducer(state, selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'message-a',
      runId: 'run-a',
      spanId: 'span-a',
    }));
    state = reducer(state, setTrajectoryScrollMode({
      conversationId: 'conversation-a',
      mode: 'manual',
    }));
    state = reducer(state, setTrajectoryInspectorOpen({
      conversationId: 'conversation-a',
      isOpen: true,
    }));
    state = reducer(state, requestTrajectoryInspect({
      conversationId: 'conversation-a',
      requestId: 'inspect-1',
      messageId: 'message-a',
      runId: 'run-a',
      spanId: 'span-a',
    }));
    state = reducer(state, consumeTrajectoryInspectRequest({
      conversationId: 'conversation-a',
      requestId: 'stale-request',
    }));

    expect(state.byConversationId['conversation-a']).toMatchObject({
      activeSurface: 'trajectory',
      selectedMessageId: 'message-a',
      selectedRunId: 'run-a',
      selectedSpanId: 'span-a',
      scrollMode: 'manual',
      isInspectorOpen: true,
      inspectRequest: { requestId: 'inspect-1', runId: 'run-a', spanId: 'span-a' },
    });

    state = reducer(state, consumeTrajectoryInspectRequest({
      conversationId: 'conversation-a',
      requestId: 'inspect-1',
    }));
    expect(state.byConversationId['conversation-a'].inspectRequest).toBeNull();
  });

  it('按 sequence 排序并幂等合并 live，且同 key 异内容保留首值并记录冲突', () => {
    const later = liveEvent('run-a', 2);
    const earlier = liveEvent('run-a', 1);
    const conflict = liveEvent('run-a', 1, { step_number: 99 });
    let state = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: later,
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: earlier,
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: earlier,
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: conflict,
    }));

    const conversation = state.byConversationId['conversation-a'];
    expect(conversation.liveEventsByRunId['run-a'].map(event => event.sequence)).toEqual([1, 2]);
    expect(conversation.liveEventsByRunId['run-a'][0].payload).toEqual({ step_number: 1 });
    expect(conversation.reconciliationByRunId['run-a'].conflicts).toEqual([
      expect.objectContaining({ kind: 'live-live', runId: 'run-a', sequence: 1 }),
    ]);
  });

  it('以 durable snapshot 覆盖最大 sequence 内 live 前缀并保留 tail 与冲突审计', () => {
    let state = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 1, { step_number: 99 }),
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 3),
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      snapshot: snapshot('run-a', [0, 1, 2]),
    }));

    const conversation = state.byConversationId['conversation-a'];
    expect(conversation.liveEventsByRunId['run-a'].map(event => event.sequence)).toEqual([3]);
    expect(selectMergedTrajectoryEvents({ trajectory: state }, 'conversation-a', 'run-a')
      .map(event => [event.sequence, event.payload])).toEqual([
      [0, { conversation_id: 'conversation-a', message_id: 'message-run-a' }],
      [1, { step_number: 1 }],
      [2, { step_number: 2 }],
      [3, { step_number: 3 }],
    ]);
    expect(conversation.reconciliationByRunId['run-a']).toMatchObject({
      status: 'ready',
      error: null,
      conflicts: [expect.objectContaining({
        kind: 'snapshot-live',
        sequence: 1,
        retainedSource: 'snapshot',
      })],
    });
  });

  it('durable 已缓存时忽略迟到的同值 live，并对异值 live 记录冲突', () => {
    let state = reducer(undefined, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      snapshot: snapshot('run-a', [0, 1]),
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 1),
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 1, { step_number: 99 }),
    }));

    const conversation = state.byConversationId['conversation-a'];
    expect(conversation.liveEventsByRunId['run-a']).toEqual([]);
    expect(conversation.reconciliationByRunId['run-a'].conflicts).toEqual([
      expect.objectContaining({ kind: 'snapshot-live', retainedSource: 'snapshot', sequence: 1 }),
    ]);
  });

  it('terminal live 到达后进入 reconciling，refetch 成功或失败结束请求生命周期', () => {
    const terminal = normalizeSseTrajectoryEvent({
      type: 'run_completed',
      schema_version: 1,
      run_id: 'run-a',
      sequence: 4,
      ts: 1787356804,
      trace_id: 'trace-run-a',
      step_id: null,
      tool_call_id: null,
      parent_step_id: null,
      total_steps: 1,
      total_tool_calls: 0,
      finish_reason: 'stop',
    });
    if (!terminal) throw new Error('测试终态事件必须可归一化');

    let state = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: terminal,
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'].status)
      .toBe('reconciling');

    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'].status)
      .toBe('reconciling');

    state = reducer(state, trajectorySnapshotFailed({
      conversationId: 'conversation-a',
      runId: 'run-a',
      error: '读取失败',
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'])
      .toMatchObject({ status: 'failed', error: '读取失败' });

    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      snapshot: snapshot('run-a', [0, 1, 2, 3, 4]),
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'])
      .toMatchObject({ status: 'ready', error: null });
  });

  it('snapshot LRU 最多保留 8 个且驱逐不删摘要、selection 或 live tail', () => {
    let state = reducer(undefined, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      response: { items: [runSummary('run-0')], truncated: false },
    }));
    state = reducer(state, selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'message-run-0',
      runId: 'run-0',
      spanId: null,
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-0', 10),
    }));

    for (let index = 0; index < 9; index += 1) {
      state = reducer(state, trajectorySnapshotReceived({
        conversationId: 'conversation-a',
        snapshot: snapshot(`run-${index}`, [0]),
      }));
    }

    const conversation = state.byConversationId['conversation-a'];
    expect(conversation.snapshotLru).toEqual([
      'run-1', 'run-2', 'run-3', 'run-4', 'run-5', 'run-6', 'run-7', 'run-8',
    ]);
    expect(Object.keys(conversation.snapshotsByRunId)).toHaveLength(8);
    expect(conversation.snapshotsByRunId['run-0']).toBeUndefined();
    expect(conversation.runs.some(run => run.run_id === 'run-0')).toBe(true);
    expect(conversation.selectedRunId).toBe('run-0');
    expect(conversation.liveEventsByRunId['run-0'].map(event => event.sequence)).toEqual([10]);
  });

  it('run_started 登记 provisional run 并自动选择真实 run id，且不改变 stream.currentRun', () => {
    const rootReducer = combineReducers({ trajectory: reducer, stream: streamReducer });
    const testStore = configureStore({ reducer: rootReducer });
    testStore.dispatch(startStream({ conversationId: 'conversation-a', messageId: 'placeholder' }));
    testStore.dispatch(initRun({
      runId: 'stream-run',
      messageId: 'placeholder',
      sequence: 0,
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
    }));
    testStore.dispatch(mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('server-run', 0, { message_id: 'server-message' }),
    }));
    testStore.dispatch(mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('server-run', 0, { message_id: 'conflicting-message' }),
    }));

    const state = testStore.getState();
    expect(state.trajectory.byConversationId['conversation-a']).toMatchObject({
      selectedMessageId: 'server-message',
      selectedRunId: 'server-run',
      runs: [expect.objectContaining({
        run_id: 'server-run',
        message_id: 'server-message',
        status: 'running',
        trajectory_status: 'recording',
      })],
    });
    expect(state.stream.currentRun?.runId).toBe('stream-run');
  });
});
