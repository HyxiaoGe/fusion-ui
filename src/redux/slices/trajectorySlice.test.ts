import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { normalizeSseTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import { projectTrajectoryCells } from '@/lib/trajectory/TrajectoryCellProjection';
import { resolveTrajectoryActionPolicy } from '@/lib/trajectory/trajectoryActionPolicy';
import type { TrajectoryRunSummary, TrajectorySnapshot } from '@/types/trajectory';
import streamReducer, { initRun, startStream } from './streamSlice';
import trajectoryReducer, {
  consumeTrajectoryInspectRequest,
  mergeLiveTrajectoryEvent,
  requestTrajectoryInspect,
  resolveTrajectoryInspectRequest,
  selectMergedTrajectoryEvents,
  selectTrajectoryRuns,
  selectTrajectoryTarget,
  setTrajectoryActiveSurface,
  setTrajectoryInspectorOpen,
  setTrajectoryScrollMode,
  trajectoryAuthScopeChanged,
  trajectoryRunListFailed,
  trajectoryRunListReceived,
  trajectoryRunListRequested,
  trajectoryRunListUnavailable,
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
      timestamp: new Date(Date.UTC(2026, 7, 22, 0, 0, sequence)).toISOString(),
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
  it('认证作用域仅在 stable identity 真变化时原子清空全部轨迹状态', () => {
    let state = reducer(undefined, trajectoryAuthScopeChanged({ authScope: 'user-a' }));
    state = reducer(state, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
      response: { items: [runSummary('run-a')], truncated: false },
    }));
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-a',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-a',
      snapshot: snapshot('run-a', [0, 1]),
    }));

    const sameScopeState = reducer(state, trajectoryAuthScopeChanged({ authScope: 'user-a' }));
    expect(sameScopeState).toBe(state);
    expect(sameScopeState.byConversationId['conversation-a']?.selectedRunId).toBe('run-a');
    expect(sameScopeState.byConversationId['conversation-a']?.snapshotsByRunId['run-a'])
      .toBeDefined();

    const nextScopeState = reducer(state, trajectoryAuthScopeChanged({ authScope: 'user-b' }));
    expect(nextScopeState).toEqual({
      authScope: 'user-b',
      byConversationId: {},
    });
  });

  it('run list 到达后默认选择 started_at 最新的 attempt', () => {
    let state = reducer(undefined, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
      response: {
        items: [
          runSummary('run-old', {
            attempt_index: 3,
            started_at: '2026-08-22T00:00:00.000Z',
          }),
          runSummary('run-new', {
            attempt_index: 1,
            started_at: '2026-08-22T02:00:00.000Z',
          }),
          runSummary('run-middle', {
            attempt_index: 9,
            started_at: '2026-08-22T01:00:00.000Z',
          }),
        ],
        truncated: false,
      },
    }));

    expect(state.byConversationId['conversation-a']).toMatchObject({
      selectedMessageId: 'message-run-new',
      selectedRunId: 'run-new',
      selectedSpanId: null,
      selectionSource: 'auto-snapshot',
    });
  });

  it('run list 刷新不会覆盖用户手动选择', () => {
    let state = reducer(undefined, selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'manual-message',
      runId: 'manual-run',
      spanId: 'manual-span',
    }));
    state = reducer(state, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'runs-a',
      response: { items: [runSummary('run-new')], truncated: false },
    }));

    expect(state.byConversationId['conversation-a']).toMatchObject({
      selectedMessageId: 'manual-message',
      selectedRunId: 'manual-run',
      selectedSpanId: 'manual-span',
      selectionSource: 'manual',
    });
  });

  it('普通水合进行中到达 terminal 时，先收下旧快照再保留 reconciling 触发终态 refetch', () => {
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

    let state = reducer(undefined, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'hydrate-a',
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: terminal,
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'hydrate-a',
      snapshot: snapshot('run-a', [0, 1, 2]),
    }));

    expect(state.byConversationId['conversation-a'].snapshotsByRunId['run-a'])
      .toBeDefined();
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'])
      .toMatchObject({ status: 'reconciling', activeRequestId: null });
  });

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

  it('手动选择以单个 action 原子取消 pending inspect 并建立 manual selection', () => {
    let state = reducer(undefined, requestTrajectoryInspect({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      messageId: 'message-run-a',
      runId: 'run-a',
      spanId: 'span-a',
    }));

    state = reducer(state, selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'message-run-b',
      runId: 'run-b',
      spanId: null,
    }));

    expect(state.byConversationId['conversation-a']).toMatchObject({
      selectedMessageId: 'message-run-b',
      selectedRunId: 'run-b',
      selectedSpanId: null,
      selectionSource: 'manual',
      inspectRequest: null,
    });
  });

  it('inspect resolution 以 request、run 与 snapshot identity 原子完成，旧 action 整组 no-op', () => {
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
    state = reducer(state, requestTrajectoryInspect({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      messageId: 'message-run-a',
      runId: 'run-a',
      spanId: 'span-missing',
    }));

    state = reducer(state, resolveTrajectoryInspectRequest({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      runId: 'run-a',
      resultIdentity: { kind: 'snapshot', requestId: 'snapshot-a' },
      fallback: true,
    }));
    expect(state.byConversationId['conversation-a']).toMatchObject({
      selectedMessageId: 'message-run-a',
      selectedRunId: 'run-a',
      selectedSpanId: null,
      selectionSource: 'inspect',
      inspectRequest: null,
    });

    state = reducer(state, requestTrajectoryInspect({
      conversationId: 'conversation-a',
      requestId: 'inspect-b',
      messageId: 'message-run-b',
      runId: 'run-b',
      spanId: 'span-b',
    }));
    const beforeStaleResolution = state;
    state = reducer(state, resolveTrajectoryInspectRequest({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      runId: 'run-a',
      resultIdentity: { kind: 'snapshot', requestId: 'snapshot-a' },
      fallback: true,
    }));
    expect(state).toBe(beforeStaleResolution);
  });

  it('无快照 terminal result identity 会被 retry 失效，并只允许最新失败完成 inspect', () => {
    let state = reducer(undefined, requestTrajectoryInspect({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      messageId: 'message-run-a',
      runId: 'run-a',
      spanId: 'span-missing',
    }));
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-failed-1',
    }));
    state = reducer(state, trajectorySnapshotFailed({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-failed-1',
      error: '第一次失败',
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'])
      .toMatchObject({ status: 'failed', terminalResultRequestId: 'snapshot-failed-1' });

    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-failed-2',
    }));
    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'])
      .toMatchObject({ status: 'loading', terminalResultRequestId: null });
    const duringRetry = state;
    state = reducer(state, resolveTrajectoryInspectRequest({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      runId: 'run-a',
      resultIdentity: { kind: 'terminal', requestId: 'snapshot-failed-1' },
      fallback: true,
    }));
    expect(state).toBe(duringRetry);

    state = reducer(state, trajectorySnapshotFailed({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-failed-2',
      error: '第二次失败',
    }));
    const afterNewFailure = state;
    state = reducer(state, resolveTrajectoryInspectRequest({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      runId: 'run-a',
      resultIdentity: { kind: 'terminal', requestId: 'snapshot-failed-1' },
      fallback: true,
    }));
    expect(state).toBe(afterNewFailure);

    state = reducer(state, resolveTrajectoryInspectRequest({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      runId: 'run-a',
      resultIdentity: { kind: 'terminal', requestId: 'snapshot-failed-2' },
      fallback: true,
    }));
    expect(state.byConversationId['conversation-a']).toMatchObject({
      selectedRunId: 'run-a',
      selectedSpanId: null,
      selectionSource: 'inspect',
      inspectRequest: null,
    });
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

  it.each([
    ['UTC 整秒', '2026-08-22T00:00:01Z', 1787356801],
    ['六位微秒', '2026-08-22T00:00:01.123456Z', 1787356801.123],
    ['带 offset', '2026-08-22T08:00:01.123+08:00', 1787356801.123],
  ])('真实 P1 %s timestamp 与同 instant SSE overlap 不产生冲突', (
    _label,
    durableTimestamp,
    liveTimestamp,
  ) => {
    const durable = snapshot('run-a', [1]);
    durable.records[0].timestamp = durableTimestamp;
    const matchingLive = liveEvent('run-a', 1, { ts: liveTimestamp });
    let state = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: matchingLive,
    }));
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-canonical',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-canonical',
      snapshot: durable,
    }));

    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'].conflicts)
      .toEqual([]);
  });

  it('canonical timestamp 相同时真实 payload 差异仍记录 snapshot-live 冲突', () => {
    const durable = snapshot('run-a', [1]);
    durable.records[0].timestamp = '2026-08-22T00:00:01.123456Z';
    const conflictingLive = liveEvent('run-a', 1, {
      ts: 1787356801.123,
      step_number: 99,
    });
    let state = reducer(undefined, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: conflictingLive,
    }));
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'snapshot-payload-conflict',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-payload-conflict',
      snapshot: durable,
    }));

    expect(state.byConversationId['conversation-a'].reconciliationByRunId['run-a'].conflicts)
      .toEqual([
        expect.objectContaining({
          kind: 'snapshot-live',
          sequence: 1,
          retainedSource: 'snapshot',
        }),
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

  it('run-list unavailable 只接受当前 requestId 并清空 conversation 轨迹缓存', () => {
    let state = reducer(undefined, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'seed-runs',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'seed-runs',
      response: { items: [runSummary('run-a')], truncated: true },
    }));
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-a',
      requestId: 'seed-snapshot',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'seed-snapshot',
      snapshot: snapshot('run-a', [0, 1]),
    }));
    state = reducer(state, requestTrajectoryInspect({
      conversationId: 'conversation-a',
      requestId: 'inspect-a',
      messageId: 'message-run-a',
      runId: 'run-a',
      spanId: 'span-a',
    }));
    state = reducer(state, setTrajectoryScrollMode({
      conversationId: 'conversation-a',
      mode: 'manual',
    }));
    state = reducer(state, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'refresh-current',
    }));

    const beforeStaleUnavailable = state;
    state = reducer(state, trajectoryRunListUnavailable({
      conversationId: 'conversation-a',
      requestId: 'refresh-stale',
    }));
    expect(state).toEqual(beforeStaleUnavailable);

    state = reducer(state, trajectoryRunListUnavailable({
      conversationId: 'conversation-a',
      requestId: 'refresh-current',
    }));
    expect(state.byConversationId['conversation-a']).toMatchObject({
      runs: [],
      runSummariesById: {},
      provisionalRunIds: [],
      runListStatus: 'unavailable',
      runListError: null,
      activeRunListRequestId: null,
      runsTruncated: false,
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
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-0', 1),
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
    expect(conversation.runSummariesById['run-0']).toBeUndefined();
    expect(conversation.liveEventsByRunId['run-0']).toBeUndefined();
    expect(conversation.reconciliationByRunId['run-0']).toBeUndefined();
    expect(Object.keys(conversation.runSummariesById)).toHaveLength(501);
    expect(conversation.runSummariesById['run-live']).toMatchObject({
      run_id: 'run-live',
      message_id: 'message-live',
    });

    const projection = projectTrajectoryCells({
      messages: [],
      runs: visibleRuns,
      runSummariesById: conversation.runSummariesById,
      snapshotsByRunId: conversation.snapshotsByRunId,
      liveEventsByRunId: conversation.liveEventsByRunId,
      selectedRunId: conversation.selectedRunId,
      runsTruncated: conversation.runsTruncated,
    });
    const projectedRunIds = [...projection.cells, ...projection.unassociatedCells]
      .filter(cell => cell.type === 'run')
      .map(cell => cell.runId);
    expect(projectedRunIds).toHaveLength(500);
    expect(projectedRunIds).not.toContain('run-0');

    const actionPolicy = resolveTrajectoryActionPolicy({
      runs: visibleRuns,
      messages: [],
      selectedRunId: conversation.selectedRunId,
      runListStatus: conversation.runListStatus,
      selectedRunHydrated: false,
      selectedTrajectoryStatus: null,
      selectedRunTruncated: false,
      reconciliationStatus: 'idle',
      hasActiveStream: false,
      retryCapabilityAvailable: true,
      modelAvailable: true,
      knowledgeBaseStatus: 'ready',
      knowledgeBaseIds: [],
    });
    expect(actionPolicy.retry.blockers).not.toContain('run-not-selected');
  });

  it('500 run 窗口只额外保留有界的 selected、provisional 与 snapshot 例外', () => {
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
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-snapshot',
      requestId: 'snapshot-exception',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-exception',
      snapshot: snapshot('run-snapshot', [0]),
    }));
    state = reducer(state, mergeLiveTrajectoryEvent({
      conversationId: 'conversation-a',
      event: liveEvent('run-live', 0, { message_id: 'message-live' }),
    }));
    state = reducer(state, selectTrajectoryTarget({
      conversationId: 'conversation-a',
      messageId: 'message-run-0',
      runId: 'run-0',
      spanId: null,
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

    const conversation = state.byConversationId['conversation-a'];
    expect(Object.keys(conversation.runSummariesById)).toHaveLength(503);
    expect(conversation.runSummariesById).toEqual(expect.objectContaining({
      'run-0': expect.objectContaining({ run_id: 'run-0' }),
      'run-live': expect.objectContaining({ run_id: 'run-live' }),
      'run-snapshot': expect.objectContaining({ run_id: 'run-snapshot' }),
    }));
    expect(conversation.provisionalRunIds).toEqual(['run-live']);
    expect(conversation.snapshotLru).toEqual(['run-snapshot']);
    expect(Object.keys(conversation.snapshotsByRunId)).toHaveLength(1);
    expect(Object.keys(conversation.liveEventsByRunId).length).toBeLessThanOrEqual(503);
    expect(Object.keys(conversation.reconciliationByRunId).length).toBeLessThanOrEqual(503);

    const visibleRuns = selectTrajectoryRuns({ trajectory: state }, 'conversation-a');
    const projection = projectTrajectoryCells({
      messages: [],
      runs: visibleRuns,
      runSummariesById: conversation.runSummariesById,
      snapshotsByRunId: conversation.snapshotsByRunId,
      liveEventsByRunId: conversation.liveEventsByRunId,
      selectedRunId: conversation.selectedRunId,
      runsTruncated: conversation.runsTruncated,
    });
    const projectedRunIds = [...projection.cells, ...projection.unassociatedCells]
      .filter(cell => cell.type === 'run')
      .map(cell => cell.runId);
    expect(projectedRunIds).toContain('run-0');
    expect(projectedRunIds).toContain('run-live');
    expect(projectedRunIds).not.toContain('run-snapshot');
    expect(projectedRunIds).toHaveLength(500);

    const actionPolicy = resolveTrajectoryActionPolicy({
      runs: visibleRuns,
      messages: [],
      selectedRunId: 'run-0',
      runListStatus: 'ready',
      selectedRunHydrated: false,
      selectedTrajectoryStatus: null,
      selectedRunTruncated: false,
      reconciliationStatus: 'idle',
      hasActiveStream: false,
      retryCapabilityAvailable: true,
      modelAvailable: true,
      knowledgeBaseStatus: 'ready',
      knowledgeBaseIds: [],
    });
    expect(actionPolicy.retry.blockers).not.toContain('run-not-selected');
  });

  it('连续 provisional run 不会令例外集合和关联 map 无界增长', () => {
    let state = reducer(undefined, { type: '@@init' });
    for (let index = 0; index < 20; index += 1) {
      state = reducer(state, mergeLiveTrajectoryEvent({
        conversationId: 'conversation-a',
        event: liveEvent(`run-live-${index}`, 0, { message_id: `message-live-${index}` }),
      }));
    }

    const conversation = state.byConversationId['conversation-a'];
    expect(conversation.provisionalRunIds).toHaveLength(8);
    expect(Object.keys(conversation.runSummariesById)).toHaveLength(8);
    expect(Object.keys(conversation.liveEventsByRunId)).toHaveLength(8);
    expect(Object.keys(conversation.reconciliationByRunId)).toHaveLength(8);
    expect(conversation.selectedRunId).toBe('run-live-19');

    for (let index = 0; index < 20; index += 1) {
      state = reducer(state, mergeLiveTrajectoryEvent({
        conversationId: 'conversation-a',
        event: liveEvent(`run-orphan-${index}`, 1),
      }));
    }
    const boundedConversation = state.byConversationId['conversation-a'];
    expect(boundedConversation.provisionalRunIds).toHaveLength(8);
    expect(Object.keys(boundedConversation.runSummariesById)).toHaveLength(9);
    expect(Object.keys(boundedConversation.liveEventsByRunId)).toHaveLength(9);
    expect(Object.keys(boundedConversation.reconciliationByRunId)).toHaveLength(9);
  });

  it('snapshot 权威摘要更新 server window 中的公开 run 且列表仍不超过 500', () => {
    const runningWindow = Array.from({ length: 500 }, (_, index) => runSummary(
      `run-${index}`,
      index === 0
        ? {
          message_id: 'running-message',
          status: 'running',
          trajectory_status: 'recording',
          total_steps: 0,
          total_tool_calls: 0,
          ended_at: null,
        }
        : {},
    ));
    let state = reducer(undefined, trajectoryRunListRequested({
      conversationId: 'conversation-a',
      requestId: 'runs-running',
    }));
    state = reducer(state, trajectoryRunListReceived({
      conversationId: 'conversation-a',
      requestId: 'runs-running',
      response: { items: runningWindow, truncated: true },
    }));

    const completedSnapshot = snapshot('run-0', [0, 1]);
    completedSnapshot.run = runSummary('run-0', {
      message_id: 'completed-message',
      status: 'completed',
      trajectory_status: 'complete',
      total_steps: 4,
      total_tool_calls: 2,
    });
    state = reducer(state, trajectorySnapshotRequested({
      conversationId: 'conversation-a',
      runId: 'run-0',
      requestId: 'snapshot-completed',
    }));
    state = reducer(state, trajectorySnapshotReceived({
      conversationId: 'conversation-a',
      requestId: 'snapshot-completed',
      snapshot: completedSnapshot,
    }));

    const visibleRuns = selectTrajectoryRuns({ trajectory: state }, 'conversation-a');
    expect(visibleRuns).toHaveLength(500);
    expect(visibleRuns[0]).toMatchObject({
      run_id: 'run-0',
      message_id: 'completed-message',
      status: 'completed',
      trajectory_status: 'complete',
      total_steps: 4,
      total_tool_calls: 2,
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
