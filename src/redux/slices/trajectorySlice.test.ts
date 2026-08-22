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
  selectTrajectoryRuns,
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
    let state = reducer(undefined, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
      response: { items: [runSummary('run-a')], truncated: true },
    }));
    state = reducer(state, trajectoryRunListRequested({
      conversationId: 'conversation-b',
      requestId: 'runs-b',
    }));
    state = reducer(state, trajectoryRunListFailed({
      conversationId: 'conversation-b',
      requestId: 'runs-b',
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
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-a',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-a',
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
    let state = reducer(undefined, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-a',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-a',
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
      requestId: 'snapshot-a',
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'].status)
      .toBe('reconciling');

    state = reducer(state, trajectorySnapshotFailed({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-a',
      error: '读取失败',
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'])
      .toMatchObject({ status: 'failed', error: '读取失败' });

    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-b',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-b',
      snapshot: snapshot('run-a', [0, 1, 2, 3, 4]),
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'])
      .toMatchObject({ status: 'ready', error: null });
  });

  it('snapshot LRU 最多保留 8 个且驱逐不删摘要、selection 或 live tail', () => {
    let state = reducer(undefined, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
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
      state = reducer(state, trajectorySnapshotRequested({
        conversationId: 'conversation-a',
        runId: `run-${index}`,
        requestId: `snapshot-${index}`,
      }));
      state = reducer(state, trajectorySnapshotReceived({
        conversationId: 'conversation-a',
        requestId: `snapshot-${index}`,
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
      runSummariesById: {
        'server-run': expect.objectContaining({
          run_id: 'server-run',
          message_id: 'server-message',
          status: 'running',
          trajectory_status: 'recording',
        }),
      },
    });
    expect(state.stream.currentRun?.runId).toBe('stream-run');
  });

  it('只接受当前 run-list request 的 success 或 failure', () => {
    let state = reducer(undefined, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'request-old',
    }));
    state = reducer(state, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'request-new',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'request-new',
      response: { items: [runSummary('run-new')], truncated: false },
    }));
    const afterNewSuccess = state;
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'request-old',
      response: { items: [runSummary('run-old')], truncated: true },
    }));
    state = reducer(state, trajectoryRunListFailed({
      conversationId: 'conversation-a',
      requestId: 'request-old',
      error: '旧请求失败',
    }));

    expect(state).toEqual(afterNewSuccess);
    expect(state.byConversationId['conversation-a']).toMatchObject({
      activeRunListRequestId: null,
      runListStatus: 'ready',
      runListError: null,
      runs: [expect.objectContaining({ run_id: 'run-new' })],
    });
  });

  it('只接受当前 snapshot request，较长新快照后到的旧短快照和旧失败均无副作用', () => {
    let state = reducer(undefined, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-old',
    }));
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-new',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-new',
      snapshot: snapshot('run-a', [0, 1, 2, 3]),
    }));
    const afterNewSuccess = state;
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-old',
      snapshot: snapshot('run-a', [0, 1]),
    }));
    state = reducer(state, trajectorySnapshotFailed({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-old',
      error: '旧快照失败',
    }));

    expect(state).toEqual(afterNewSuccess);
    expect(selectMergedTrajectoryEvents({ trajectory: state }, 'conversation-a', 'run-a')
      .map(event => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'])
      .toMatchObject({ activeRequestId: null, status: 'ready', error: null });
  });

  it('滑动窗口刷新时公开 run list 始终最多 500 且保留 provisional 摘要', () => {
    const firstWindow = Array.from({ length: 500 }, (_, index) => runSummary(`run-${index}`));
    const secondWindow = Array.from({ length: 500 }, (_, index) => runSummary(`run-${index + 1}`));
    let state = reducer(undefined, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'runs-first',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'runs-first',
      response: { items: firstWindow, truncated: true },
    }));
    state = reducer(state, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'runs-second',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'runs-second',
      response: { items: secondWindow, truncated: true },
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-live', 0, { message_id: 'message-live' }),
    }));

    const visibleRuns = selectTrajectoryRuns({ trajectory: state }, 'conversation-a');
    const conversation = state.byConversationId['conversation-a'];
    expect(visibleRuns).toHaveLength(500);
    expect(visibleRuns[0].run_id).toBe('run-live');
    expect(visibleRuns.some(run => run.run_id === 'run-0')).toBe(false);
    expect(conversation.runs).toHaveLength(500);
    expect(conversation.runSummariesById['run-live']).toMatchObject({
      run_id: 'run-live',
      message_id: 'message-live',
    });
  });

  it('live 乱序超过 5000 时保留最新有界窗口并公开裁剪状态', () => {
    const baseState = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 1),
    }));
    const seededState = {
      ...baseState,
      byConversationId: {
        ...baseState.byConversationId,
        'conversation-a': {
          ...baseState.byConversationId['conversation-a'],
          liveEventsByRunId: {
            'run-a': Array.from({ length: 5000 }, (_, index) => liveEvent('run-a', index + 1)),
          },
        },
      },
    };
    let state = reducer(seededState, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 5001),
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 1),
    }));

    const conversation = state.byConversationId['conversation-a'];
    expect(conversation.liveEventsByRunId['run-a']).toHaveLength(5000);
    expect(conversation.liveEventsByRunId['run-a'][0].sequence).toBe(2);
    expect(conversation.liveEventsByRunId['run-a'].at(-1)?.sequence).toBe(5001);
    expect(conversation.reconciliationByRunId['run-a'].eventsTruncated).toBe(true);
    expect(selectMergedTrajectoryEvents({ trajectory: state }, 'conversation-a', 'run-a'))
      .toHaveLength(5000);
  });

  it('5000-event snapshot 加乱序 live tail 并 reconcile 后仍保留 tail 且不超过上限', () => {
    const sequences = Array.from({ length: 5000 }, (_, index) => index);
    let state = reducer(undefined, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-a',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-a',
      snapshot: snapshot('run-a', sequences),
    }));
    expect(state.byConversationId['conversation-a'].snapshotsByRunId['run-a'].events)
      .toHaveLength(5000);
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'].eventsTruncated)
      .toBe(false);
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 5001),
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 5000),
    }));

    const conversation = state.byConversationId['conversation-a'];
    const merged = selectMergedTrajectoryEvents({ trajectory: state }, 'conversation-a', 'run-a');
    expect(conversation.snapshotsByRunId['run-a'].events.length).toBe(4998);
    expect(conversation.liveEventsByRunId['run-a'].map(event => event.sequence)).toEqual([5000, 5001]);
    expect(merged).toHaveLength(5000);
    expect(merged[0].sequence).toBe(2);
    expect(merged.at(-1)?.sequence).toBe(5001);
    expect(conversation.snapshotsByRunId['run-a'].truncated).toBe(true);
    expect(conversation.reconciliationByRunId['run-a'].eventsTruncated).toBe(true);
  });

  it('同值 run_started 与 terminal 重放不重复选择或重新进入 reconciling', () => {
    const started = liveEvent('run-live', 0, { message_id: 'message-live' });
    const terminal = normalizeSseTrajectoryEvent({
      type: 'run_completed',
      schema_version: 1,
      run_id: 'run-live',
      sequence: 1,
      ts: 1787356801,
      trace_id: 'trace-run-live',
      step_id: null,
      tool_call_id: null,
      parent_step_id: null,
      total_steps: 0,
      total_tool_calls: 0,
      finish_reason: 'stop',
    });
    if (!terminal) throw new Error('测试终态事件必须可归一化');

    let state = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: started,
    }));
    state = reducer(state, selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'history-message',
      runId: 'history-run',
      spanId: null,
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: started,
    }));
    expect(state.byConversationId['conversation-a']).toMatchObject({
      selectedMessageId: 'history-message',
      selectedRunId: 'history-run',
    });

    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: terminal,
    }));
    const durable = snapshot('run-live', [0, 1]);
    durable.records[1] = {
      sequence: terminal.sequence,
      event_type: terminal.eventType,
      schema_version: terminal.schemaVersion,
      timestamp: terminal.timestamp,
      step_id: terminal.stepId,
      tool_call_id: terminal.toolCallId,
      parent_step_id: terminal.parentStepId,
      trace_id: terminal.traceId,
      span_id: null,
      payload: terminal.payload,
    };
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-live',
      requestId: 'terminal-snapshot',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'terminal-snapshot',
      snapshot: durable,
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-live'].status)
      .toBe('ready');

    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: terminal,
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-live'].status)
      .toBe('ready');
  });

  it('snapshot run_started authority 只修正自动选择，不覆盖用户手动选择', () => {
    const durable = snapshot('run-a', [0]);
    durable.run.message_id = 'durable-message';
    durable.records[0].payload = {
      conversation_id: 'conversation-a',
      message_id: 'durable-message',
    };
    let state = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 0, { message_id: 'live-message' }),
    }));
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-auto',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-auto',
      snapshot: durable,
    }));
    expect(state.byConversationId['conversation-a']).toMatchObject({
      selectedRunId: 'run-a',
      selectedMessageId: 'durable-message',
      selectionSource: 'auto-snapshot',
    });

    let manualState = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-a', 0, { message_id: 'live-message' }),
    }));
    manualState = reducer(manualState, selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'manual-message',
      runId: 'run-a',
      spanId: null,
    }));
    manualState = reducer(manualState, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-manual',
    }));
    manualState = reducer(manualState, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-manual',
      snapshot: durable,
    }));
    expect(manualState.byConversationId['conversation-a']).toMatchObject({
      selectedRunId: 'run-a',
      selectedMessageId: 'manual-message',
      selectionSource: 'manual',
    });
  });
});
