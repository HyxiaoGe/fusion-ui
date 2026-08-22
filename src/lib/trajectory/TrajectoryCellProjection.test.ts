import { describe, expect, it } from 'vitest';

import type { Message } from '@/types/conversation';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import {
  projectTrajectoryCells,
  type TrajectoryCellProjectionInput,
} from './TrajectoryCellProjection';

const timestamp = '2026-08-22T00:00:00.000Z';

function message(id: string, role: Message['role'], agentRun: Message['agent_run'] = null): Message {
  return {
    id,
    role,
    content: [{ type: 'text', id: `content-${id}`, text: id }],
    agent_run: agentRun,
  };
}

function runSummary(
  runId: string,
  overrides: Partial<TrajectoryRunSummary> = {},
): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: `assistant-${runId}`,
    turn_message_id: `user-${runId}`,
    attempt_index: 0,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 1,
    duration_ms: 120,
    started_at: timestamp,
    ended_at: '2026-08-22T00:00:00.120Z',
    ...overrides,
  };
}

function event(
  runId: string,
  sequence: number,
  eventType: string,
  overrides: Partial<NormalizedTrajectoryEvent> = {},
): NormalizedTrajectoryEvent {
  return {
    runId,
    sequence,
    eventType,
    schemaVersion: 1,
    timestamp,
    stepId: null,
    toolCallId: null,
    parentStepId: null,
    traceId: `trace-${runId}`,
    payload: {},
    ...overrides,
  };
}

function input(overrides: Partial<TrajectoryCellProjectionInput> = {}): TrajectoryCellProjectionInput {
  return {
    messages: [],
    runs: [],
    runSummariesById: {},
    snapshotsByRunId: {},
    liveEventsByRunId: {},
    selectedRunId: null,
    runsTruncated: false,
    ...overrides,
  };
}

describe('TrajectoryCellProjection', () => {
  it('按新协议分别将 turn_message_id join 到 user、message_id join 到 assistant，并稳定排列同 turn attempts', () => {
    const messages = [
      message('user-turn-1', 'user'),
      message('assistant-turn-1', 'assistant'),
      message('user-turn-2', 'user'),
      message('assistant-turn-2', 'assistant'),
    ];
    const attempt2 = runSummary('run-attempt-2', {
      message_id: 'assistant-turn-1',
      turn_message_id: 'user-turn-1',
      attempt_index: 2,
      started_at: '2026-08-22T00:00:02.000Z',
    });
    const attempt1 = runSummary('run-attempt-1', {
      message_id: 'assistant-turn-1',
      turn_message_id: 'user-turn-1',
      attempt_index: 1,
      started_at: '2026-08-22T00:00:01.000Z',
    });
    const secondTurn = runSummary('run-turn-2', {
      message_id: 'assistant-turn-2',
      turn_message_id: 'user-turn-2',
    });

    const projection = projectTrajectoryCells(input({
      messages,
      runs: [attempt2, secondTurn, attempt1],
      runSummariesById: {
        'run-attempt-2': attempt2,
        'run-attempt-1': attempt1,
        'run-turn-2': secondTurn,
      },
    }));

    expect(projection.cells.map(cell => cell.key)).toEqual([
      'message:user:user-turn-1',
      'run:run-attempt-1',
      'run:run-attempt-2',
      'message:assistant:assistant-turn-1',
      'message:user:user-turn-2',
      'run:run-turn-2',
      'message:assistant:assistant-turn-2',
    ]);
    expect(projection.joins).toEqual([
      {
        runId: 'run-attempt-1',
        userMessageId: 'user-turn-1',
        assistantMessageId: 'assistant-turn-1',
        strategy: 'explicit',
        bucket: 'conversation',
      },
      {
        runId: 'run-attempt-2',
        userMessageId: 'user-turn-1',
        assistantMessageId: 'assistant-turn-1',
        strategy: 'explicit',
        bucket: 'conversation',
      },
      {
        runId: 'run-turn-2',
        userMessageId: 'user-turn-2',
        assistantMessageId: 'assistant-turn-2',
        strategy: 'explicit',
        bucket: 'conversation',
      },
    ]);
  });

  it('真实 legacy assistant-id 只回看同会话相邻 user', () => {
    const adjacent = runSummary('legacy-adjacent', {
      message_id: 'assistant-adjacent',
      turn_message_id: 'assistant-adjacent',
      attempt_index: null,
      trajectory_status: 'legacy',
    });

    const projection = projectTrajectoryCells(input({
      messages: [
        message('user-adjacent', 'user'),
        message('assistant-adjacent', 'assistant'),
      ],
      runs: [adjacent],
      runSummariesById: { 'legacy-adjacent': adjacent },
    }));

    expect(projection.joins).toEqual([{
      runId: 'legacy-adjacent',
      userMessageId: 'user-adjacent',
      assistantMessageId: 'assistant-adjacent',
      strategy: 'legacy-adjacent-user',
      bucket: 'conversation',
    }]);
  });

  it('真实 legacy assistant-id 没有紧邻 user 时进入未关联运行', () => {
    const legacy = runSummary('legacy-not-adjacent', {
      message_id: 'assistant-not-adjacent',
      turn_message_id: 'assistant-not-adjacent',
      attempt_index: null,
      trajectory_status: 'legacy',
    });
    const projection = projectTrajectoryCells(input({
      messages: [
        message('user-before-divider', 'user'),
        message('assistant-divider', 'assistant'),
        message('assistant-not-adjacent', 'assistant'),
      ],
      runs: [legacy],
      runSummariesById: { 'legacy-not-adjacent': legacy },
    }));

    expect(projection.joins).toEqual([{
      runId: 'legacy-not-adjacent',
      userMessageId: null,
      assistantMessageId: 'assistant-not-adjacent',
      strategy: 'unassociated',
      bucket: 'unassociated',
    }]);
    expect(projection.unassociatedCells.map(cell => cell.key)).toEqual(['run:legacy-not-adjacent']);
  });

  it('未选中或未水合 run 只给骨架，selected hydrated run 才投影完整细节与 live tail', () => {
    const selected = runSummary('selected', {
      message_id: 'assistant-selected',
      turn_message_id: 'user-selected',
      total_steps: 2,
      total_tool_calls: 1,
    });
    const other = runSummary('other', {
      message_id: 'assistant-other',
      turn_message_id: 'user-other',
    });
    const unhydrated = runSummary('unhydrated', {
      message_id: 'assistant-unhydrated',
      turn_message_id: 'user-unhydrated',
    });
    const durableEvents = [
      event('selected', 0, 'run_started'),
      event('selected', 1, 'plan_snapshot', {
        payload: { plan_id: 'plan-a', revision: 1, items: [{ id: 'p1', title: '查询' }] },
      }),
      event('selected', 2, 'context_status_updated', {
        payload: {
          phase: 'after',
          status: 'compacted',
          round_index: 1,
          removed_turns: 2,
          removed_messages: 3,
          removed_tool_transactions: 1,
        },
      }),
      event('selected', 3, 'tool_call_started', {
        stepId: 'step-1',
        toolCallId: 'tool-1',
        payload: { tool_name: 'web_search', plan_item_id: 'p1' },
      }),
      event('selected', 4, 'tool_attempt_started', {
        stepId: 'step-1',
        toolCallId: 'tool-1',
        payload: { tool_attempt_id: 'attempt-1', tool_name: 'web_search', attempt_index: 0 },
      }),
      event('selected', 5, 'tool_attempt_completed', {
        stepId: 'step-1',
        toolCallId: 'tool-1',
        payload: { tool_attempt_id: 'attempt-1', status: 'success', duration_ms: 40 },
      }),
      event('selected', 6, 'tool_call_completed', {
        stepId: 'step-1',
        toolCallId: 'tool-1',
        payload: { tool_name: 'web_search', status: 'success', duration_ms: 80 },
      }),
    ];
    const liveTail = event('selected', 7, 'run_completed', {
      payload: { total_steps: 2, total_tool_calls: 1, finish_reason: 'stop' },
    });

    const projection = projectTrajectoryCells(input({
      messages: [
        message('user-selected', 'user'),
        message('assistant-selected', 'assistant'),
        message('user-other', 'user'),
        message('assistant-other', 'assistant'),
        message('user-unhydrated', 'user'),
        message('assistant-unhydrated', 'assistant'),
      ],
      runs: [selected, other, unhydrated],
      runSummariesById: { selected, other, unhydrated },
      selectedRunId: 'selected',
      snapshotsByRunId: {
        selected: {
          run: selected,
          spans: [{
            span_id: 'run:selected',
            kind: 'run',
            name: 'selected',
            parent_span_id: null,
            start_sequence: 0,
            end_sequence: 6,
            started_at: timestamp,
            ended_at: timestamp,
            duration_ms: 120,
            status: 'completed',
            terminal_source: 'explicit',
            inferred_reason: null,
            ttft_ms: 20,
            record_sequences: [0, 1, 2, 3, 4, 5, 6],
          }],
          completeness: {
            status: 'complete',
            degraded_reason: null,
            event_count: 7,
            expected_last_sequence: 6,
            loaded_event_count: 7,
            first_sequence: 0,
            last_sequence: 6,
          },
          truncated: false,
          durableLastSequence: 6,
          events: durableEvents,
        },
        other: {
          run: other,
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
          durableLastSequence: 0,
          events: [event('other', 0, 'run_started')],
        },
      },
      liveEventsByRunId: {
        selected: [liveTail],
        unhydrated: [event('unhydrated', 0, 'run_started')],
      },
    }));

    const runCells = [...projection.cells, ...projection.unassociatedCells]
      .filter(cell => cell.type === 'run');
    expect(runCells.map(cell => ({
      runId: cell.runId,
      hydrated: cell.isHydrated,
      selected: cell.isSelected,
      records: cell.records.map(record => record.sequence),
      spans: cell.spans.map(span => span.span_id),
      liveTail: cell.liveTail.map(record => record.sequence),
    }))).toEqual([
      {
        runId: 'selected',
        hydrated: true,
        selected: true,
        records: [0, 1, 2, 3, 4, 5, 6],
        spans: ['run:selected'],
        liveTail: [7],
      },
      {
        runId: 'other',
        hydrated: true,
        selected: false,
        records: [],
        spans: [],
        liveTail: [],
      },
      {
        runId: 'unhydrated',
        hydrated: false,
        selected: false,
        records: [],
        spans: [],
        liveTail: [],
      },
    ]);
    expect(projection.cells.filter(cell => cell.runId === 'selected').map(cell => cell.type)).toEqual([
      'run',
      'plan',
      'context',
      'compacted',
      'tool',
      'subtool',
    ]);
    expect(projection.cells.filter(cell => cell.runId === 'other').map(cell => cell.type)).toEqual(['run']);
    expect(projection.cells.filter(cell => cell.runId === 'unhydrated').map(cell => cell.type)).toEqual(['run']);
  });

  it('selected 但未水合的 run 保留选中态且仍不投影实时细节', () => {
    const selected = runSummary('selected-unhydrated', {
      message_id: 'assistant-selected-unhydrated',
      turn_message_id: 'user-selected-unhydrated',
      status: 'running',
      trajectory_status: 'recording',
    });
    const projection = projectTrajectoryCells(input({
      messages: [
        message('user-selected-unhydrated', 'user'),
        message('assistant-selected-unhydrated', 'assistant'),
      ],
      runs: [selected],
      runSummariesById: { 'selected-unhydrated': selected },
      selectedRunId: 'selected-unhydrated',
      liveEventsByRunId: {
        'selected-unhydrated': [event('selected-unhydrated', 0, 'run_started')],
      },
    }));

    expect(projection.cells.filter(cell => cell.runId === 'selected-unhydrated')).toEqual([
      expect.objectContaining({
        type: 'run',
        isSelected: true,
        isHydrated: false,
        records: [],
        spans: [],
        liveTail: [],
      }),
    ]);
  });

  it('run 主状态与 trajectory badge 独立，并将 legacy/degraded/truncated 明确标注', () => {
    const legacy = runSummary('legacy', {
      message_id: 'assistant-legacy',
      turn_message_id: null,
      status: 'completed',
      trajectory_status: 'complete',
    });
    const degraded = runSummary('degraded', {
      message_id: 'assistant-degraded',
      turn_message_id: 'user-degraded',
      status: 'failed',
      trajectory_status: 'degraded',
    });

    const projection = projectTrajectoryCells(input({
      messages: [
        message('user-legacy', 'user'),
        message('assistant-legacy', 'assistant'),
        message('user-degraded', 'user'),
        message('assistant-degraded', 'assistant'),
      ],
      runs: [legacy, degraded],
      runSummariesById: { legacy, degraded },
      snapshotsByRunId: {
        legacy: {
          run: legacy,
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
          durableLastSequence: 0,
          events: [event('legacy', 0, 'run_started', { schemaVersion: 0 })],
        },
        degraded: {
          run: degraded,
          spans: [],
          completeness: {
            status: 'degraded',
            degraded_reason: 'writer_timeout',
            event_count: 4,
            expected_last_sequence: 5,
            loaded_event_count: 3,
            first_sequence: 0,
            last_sequence: 5,
          },
          truncated: true,
          durableLastSequence: 5,
          events: [event('degraded', 0, 'run_started')],
        },
      },
    }));

    const cells = projection.cells.filter(cell => cell.type === 'run');
    expect(cells.map(cell => ({
      runId: cell.runId,
      runStatus: cell.runStatus,
      badge: cell.trajectoryBadge,
    }))).toEqual([
      {
        runId: 'legacy',
        runStatus: 'completed',
        badge: {
          status: 'legacy',
          source: 'durable-snapshot',
          reason: 'schema-version-0',
        },
      },
      {
        runId: 'degraded',
        runStatus: 'failed',
        badge: {
          status: 'truncated',
          source: 'durable-snapshot',
          reason: 'writer_timeout',
        },
      },
    ]);
  });

  it('直接识别 P1 legacy 摘要与空 records legacy snapshot，且 truncated 优先', () => {
    const unhydrated = runSummary('legacy-unhydrated', {
      message_id: 'assistant-legacy-unhydrated',
      turn_message_id: 'user-legacy-unhydrated',
      trajectory_status: 'legacy',
    });
    const hydrated = runSummary('legacy-hydrated', {
      message_id: 'assistant-legacy-hydrated',
      turn_message_id: 'user-legacy-hydrated',
      trajectory_status: 'legacy',
    });
    const truncated = runSummary('legacy-truncated', {
      message_id: 'assistant-legacy-truncated',
      turn_message_id: 'user-legacy-truncated',
      trajectory_status: 'legacy',
    });
    const legacyCompleteness = {
      status: 'legacy',
      degraded_reason: null,
      event_count: null,
      expected_last_sequence: null,
      loaded_event_count: 0,
      first_sequence: null,
      last_sequence: null,
    };
    const projection = projectTrajectoryCells(input({
      messages: [
        message('user-legacy-unhydrated', 'user'),
        message('assistant-legacy-unhydrated', 'assistant'),
        message('user-legacy-hydrated', 'user'),
        message('assistant-legacy-hydrated', 'assistant'),
        message('user-legacy-truncated', 'user'),
        message('assistant-legacy-truncated', 'assistant'),
      ],
      runs: [unhydrated, hydrated, truncated],
      runSummariesById: { unhydrated, hydrated, truncated },
      snapshotsByRunId: {
        'legacy-hydrated': {
          run: hydrated,
          spans: [],
          completeness: legacyCompleteness,
          truncated: false,
          durableLastSequence: null,
          events: [],
        },
        'legacy-truncated': {
          run: truncated,
          spans: [],
          completeness: legacyCompleteness,
          truncated: true,
          durableLastSequence: null,
          events: [],
        },
      },
    }));

    expect(projection.cells.filter(cell => cell.type === 'run').map(cell => ({
      runId: cell.runId,
      badge: cell.trajectoryBadge,
    }))).toEqual([
      {
        runId: 'legacy-unhydrated',
        badge: { status: 'legacy', source: 'run-summary', reason: null },
      },
      {
        runId: 'legacy-hydrated',
        badge: { status: 'legacy', source: 'durable-snapshot', reason: null },
      },
      {
        runId: 'legacy-truncated',
        badge: { status: 'truncated', source: 'durable-snapshot', reason: null },
      },
    ]);
  });

  it('仅以 message.agent_run 生成高置信摘要 fallback，明确来源且不伪造 records/spans', () => {
    const projection = projectTrajectoryCells(input({
      messages: [
        message('user-fallback', 'user'),
        message('assistant-fallback', 'assistant', {
          runId: 'fallback-run',
          messageId: 'assistant-fallback',
          status: 'limit_reached',
          config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
          totalSteps: 3,
          totalToolCalls: 5,
          steps: [{
            stepId: 'should-not-project',
            stepNumber: 1,
            status: 'completed',
            toolCalls: [{
              toolCallId: 'should-not-project',
              toolName: 'web_search',
              arguments: {},
              status: 'success',
              startedAt: 1,
              completedAt: 2,
            }],
            contentBlockIds: [],
            startedAt: 1,
            completedAt: 2,
          }],
          lastSequence: 9,
        }),
      ],
    }));

    const fallback = projection.cells.find(cell => cell.type === 'run');
    expect(fallback).toMatchObject({
      key: 'run:fallback-run',
      type: 'run',
      runId: 'fallback-run',
      userMessageId: 'user-fallback',
      assistantMessageId: 'assistant-fallback',
      summarySource: 'message.agent_run',
      runStatus: 'limit_reached',
      totalSteps: 3,
      totalToolCalls: 5,
      isHydrated: false,
      records: [],
      spans: [],
      liveTail: [],
      trajectoryBadge: {
        status: 'summary-only',
        source: 'message.agent_run',
        reason: 'durable-trajectory-unavailable',
      },
    });
    expect(projection.cells.filter(cell => ['tool', 'subtool'].includes(cell.type))).toHaveLength(0);
  });

  it('缺少工具关联键的合法记录仍由 run cell 承接，不从事件投影中静默丢失', () => {
    const run = runSummary('missing-tool-id', {
      message_id: 'assistant-missing-tool-id',
      turn_message_id: 'user-missing-tool-id',
    });
    const projection = projectTrajectoryCells(input({
      messages: [
        message('user-missing-tool-id', 'user'),
        message('assistant-missing-tool-id', 'assistant'),
      ],
      runs: [run],
      runSummariesById: { 'missing-tool-id': run },
      selectedRunId: 'missing-tool-id',
      snapshotsByRunId: {
        'missing-tool-id': {
          run,
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
          durableLastSequence: 0,
          events: [event('missing-tool-id', 0, 'tool_call_started', {
            payload: { tool_name: 'web_search' },
          })],
        },
      },
    }));

    expect(projection.cells.filter(cell => cell.runId === 'missing-tool-id')).toEqual([
      expect.objectContaining({ type: 'run', sourceSequences: [0] }),
    ]);
  });

  it('5000 event 以单批次投影且耗时不超过 750ms', () => {
    const run = runSummary('benchmark', {
      message_id: 'assistant-benchmark',
      turn_message_id: 'user-benchmark',
      total_steps: 5000,
      total_tool_calls: 0,
    });
    const events = Array.from({ length: 5000 }, (_, sequence) => event(
      'benchmark',
      sequence,
      sequence === 0 ? 'run_started' : 'run_progress_updated',
      { payload: { completed_steps: sequence } },
    ));
    const benchmarkInput = input({
      messages: [message('user-benchmark', 'user'), message('assistant-benchmark', 'assistant')],
      runs: [run],
      runSummariesById: { benchmark: run },
      selectedRunId: 'benchmark',
      snapshotsByRunId: {
        benchmark: {
          run,
          spans: [],
          completeness: {
            status: 'complete',
            degraded_reason: null,
            event_count: 5000,
            expected_last_sequence: 4999,
            loaded_event_count: 5000,
            first_sequence: 0,
            last_sequence: 4999,
          },
          truncated: false,
          durableLastSequence: 4999,
          events,
        },
      },
    });

    const startedAt = performance.now();
    const projection = projectTrajectoryCells(benchmarkInput);
    const elapsedMs = performance.now() - startedAt;

    const projectedRun = projection.cells.find(cell => cell.type === 'run');
    expect(projectedRun?.records).toHaveLength(5000);
    expect(elapsedMs).toBeLessThanOrEqual(750);
  });
});
