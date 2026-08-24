import { describe, expect, it } from 'vitest';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import type { TrajectoryCell } from './TrajectoryCellProjection';
import { projectTrajectoryOverview } from './trajectoryOverviewModel';

function run(
  runId: string,
  startedAt: string,
  durationMs: number | null,
  overrides: Partial<TrajectoryRunSummary> = {},
): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: `${runId}-answer`,
    turn_message_id: `${runId}-question`,
    attempt_index: 0,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 1,
    duration_ms: durationMs,
    started_at: startedAt,
    ended_at: durationMs === null
      ? null
      : new Date(Date.parse(startedAt) + durationMs).toISOString(),
    ...overrides,
  };
}

function event(
  runId: string,
  sequence: number,
  eventType: string,
  timestamp: string,
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
    traceId: runId,
    payload: {},
    ...overrides,
  };
}

function runCell(runId: string, hydrated = true): TrajectoryCell {
  return {
    key: `run:${runId}`,
    type: 'run',
    runId,
    userMessageId: `${runId}-question`,
    assistantMessageId: `${runId}-answer`,
    completenessSources: ['run-summary'],
    sourceSequences: [],
    summarySource: 'run-summary',
    attemptIndex: 0,
    runStatus: 'completed',
    totalSteps: 1,
    totalToolCalls: 1,
    startedAt: '2026-08-24T00:00:00.000Z',
    endedAt: '2026-08-24T00:00:01.000Z',
    isSelected: true,
    isHydrated: hydrated,
    association: 'explicit',
    trajectoryBadge: { status: 'complete', source: 'run-summary', reason: null },
    records: [],
    spans: [],
    liveTail: [],
  };
}

function toolCell(runId: string, toolCallId: string, sequences: number[]): TrajectoryCell {
  return {
    key: `run:${runId}:tool:${toolCallId}`,
    type: 'tool',
    runId,
    userMessageId: null,
    assistantMessageId: null,
    completenessSources: ['durable-snapshot'],
    sourceSequences: sequences,
    toolCallId,
    stepId: 'step-1',
    toolName: '联网搜索',
    status: 'success',
    events: [],
  };
}

function subtoolCell(runId: string, attemptId: string, sequences: number[]): TrajectoryCell {
  return {
    key: `run:${runId}:subtool:${attemptId}`,
    type: 'subtool',
    runId,
    userMessageId: null,
    assistantMessageId: null,
    completenessSources: ['durable-snapshot'],
    sourceSequences: sequences,
    toolCallId: 'tool-1',
    toolAttemptId: attemptId,
    toolName: '联网搜索',
    attemptIndex: 0,
    status: 'success',
    events: [],
  };
}

describe('trajectoryOverviewModel', () => {
  it('sequence 模式按会话顺序给 run 等宽，并在聚焦 run 内按 sequence 定位', () => {
    const runs = [
      run('run-a', '2026-08-24T00:00:00.000Z', 100),
      run('run-b', '2026-08-24T00:10:00.000Z', 900),
    ];
    const events = [
      event('run-b', 10, 'llm_round_started', '2026-08-24T00:10:00.000Z', {
        payload: { llm_round_id: 'round-1', model: 'deepseek-chat' },
      }),
      event('run-b', 11, 'llm_round_completed', '2026-08-24T00:10:00.900Z', {
        payload: { llm_round_id: 'round-1', status: 'success' },
      }),
    ];

    const result = projectTrajectoryOverview({
      runs,
      focusedRunId: 'run-b',
      focusedRunEvents: events,
      cells: [runCell('run-a', false), runCell('run-b')],
      mode: 'sequence',
    });

    expect(result.runBands).toEqual([
      expect.objectContaining({ runId: 'run-a', start: 0, end: 0.5, hydrated: false }),
      expect.objectContaining({ runId: 'run-b', start: 0.5, end: 1, hydrated: true }),
    ]);
    expect(result.segments).toEqual([
      expect.objectContaining({
        runId: 'run-b',
        track: 'model',
        start: 0.5,
        end: 1,
        startSequence: 10,
        endSequence: 11,
      }),
    ]);
  });

  it('actual 模式按 run 自身时长串联，压缩 run 之间的墙钟等待', () => {
    const result = projectTrajectoryOverview({
      runs: [
        run('run-a', '2026-08-24T00:00:00.000Z', 100),
        run('run-b', '2026-08-24T04:00:00.000Z', 300),
      ],
      focusedRunId: null,
      focusedRunEvents: [],
      cells: [],
      mode: 'actual',
    });

    expect(result.runBands.map(({ start, end }) => [start, end])).toEqual([
      [0, 0.25],
      [0.25, 1],
    ]);
  });

  it('actual 模式用聚焦 run 的 live timestamp 持续更新 run band 权重', () => {
    const runs = [
      run('run-done', '2026-08-24T00:00:00.000Z', 1_000),
      run('run-live', '2026-08-24T01:00:00.000Z', null),
    ];
    const firstProjection = projectTrajectoryOverview({
      runs,
      focusedRunId: 'run-live',
      focusedRunEvents: [
        event('run-live', 0, 'run_started', '2026-08-24T01:00:00.000Z'),
        event('run-live', 1, 'run_progress_updated', '2026-08-24T01:00:05.000Z'),
      ],
      cells: [runCell('run-done'), runCell('run-live')],
      mode: 'actual',
    });
    const appendedProjection = projectTrajectoryOverview({
      runs,
      focusedRunId: 'run-live',
      focusedRunEvents: [
        event('run-live', 0, 'run_started', '2026-08-24T01:00:00.000Z'),
        event('run-live', 1, 'run_progress_updated', '2026-08-24T01:00:05.000Z'),
        event('run-live', 2, 'run_progress_updated', '2026-08-24T01:00:10.000Z'),
      ],
      cells: [runCell('run-done'), runCell('run-live')],
      mode: 'actual',
    });

    expect(firstProjection.runBands[0].end).toBeCloseTo(1 / 6, 6);
    expect(appendedProjection.runBands[0].end).toBeCloseTo(1 / 11, 6);
    expect(appendedProjection.runBands[1].end).toBe(1);
  });

  it('actual 模式在聚焦 run 自身时间域内定位详细 segment', () => {
    const runId = 'run-a';
    const result = projectTrajectoryOverview({
      runs: [run(runId, '2026-08-24T00:00:00.000Z', 1_000)],
      focusedRunId: runId,
      focusedRunEvents: [
        event(runId, 0, 'tool_call_started', '2026-08-24T00:00:00.200Z', {
          toolCallId: 'tool-1',
          payload: { tool_name: '联网搜索' },
        }),
        event(runId, 1, 'tool_call_completed', '2026-08-24T00:00:00.500Z', {
          toolCallId: 'tool-1',
          payload: { tool_name: '联网搜索', status: 'success' },
        }),
      ],
      cells: [runCell(runId), toolCell(runId, 'tool-1', [0, 1])],
      mode: 'actual',
    });

    expect(result.segments[0]).toEqual(expect.objectContaining({
      start: 0.2,
      end: 0.5,
      startedAt: '2026-08-24T00:00:00.200Z',
      endedAt: '2026-08-24T00:00:00.500Z',
    }));
  });

  it('只为当前聚焦且已水合 run 生成详情，缓存其他 run 不改变会话域', () => {
    const runs = [
      run('run-a', '2026-08-24T00:00:00.000Z', 100),
      run('run-b', '2026-08-24T00:00:01.000Z', 100),
    ];
    const cachedOtherRun = runCell('run-a');
    const focusedRun = runCell('run-b');
    const runBEvents = [event(
      'run-b',
      0,
      'run_started',
      '2026-08-24T00:00:01.000Z',
    )];

    const focused = projectTrajectoryOverview({
      runs,
      focusedRunId: 'run-b',
      focusedRunEvents: runBEvents,
      cells: [cachedOtherRun, focusedRun],
      mode: 'sequence',
    });
    expect(focused.segments).toHaveLength(1);
    expect(focused.segments[0].runId).toBe('run-b');

    const loading = projectTrajectoryOverview({
      runs,
      focusedRunId: 'run-b',
      focusedRunEvents: runBEvents,
      cells: [cachedOtherRun, runCell('run-b', false)],
      mode: 'sequence',
    });
    expect(loading.segments).toEqual([]);
    expect(loading.runBands).toHaveLength(2);
  });

  it('按稳定生命周期 id 聚合 Model/Tools/Input，并优先命中精确 cell', () => {
    const runId = 'run-a';
    const events = [
      event(runId, 0, 'run_started', '2026-08-24T00:00:00.000Z'),
      event(runId, 1, 'llm_round_started', '2026-08-24T00:00:00.100Z', {
        payload: { llm_round_id: 'round-1', model: 'deepseek-chat' },
      }),
      event(runId, 2, 'tool_call_started', '2026-08-24T00:00:00.200Z', {
        toolCallId: 'tool-1',
        payload: { tool_name: '联网搜索' },
      }),
      event(runId, 3, 'tool_call_completed', '2026-08-24T00:00:00.500Z', {
        toolCallId: 'tool-1',
        payload: { tool_name: '联网搜索', status: 'success' },
      }),
      event(runId, 4, 'llm_round_completed', '2026-08-24T00:00:00.600Z', {
        payload: { llm_round_id: 'round-1', status: 'success' },
      }),
    ];

    const result = projectTrajectoryOverview({
      runs: [run(runId, '2026-08-24T00:00:00.000Z', 600)],
      focusedRunId: runId,
      focusedRunEvents: events,
      cells: [runCell(runId), toolCell(runId, 'tool-1', [2, 3])],
      mode: 'sequence',
    });

    expect(result.segments.map(segment => [
      segment.track,
      segment.startSequence,
      segment.endSequence,
      segment.targetCellKey,
      segment.spanIdentity,
    ])).toEqual([
      ['input', 0, 0, `run:${runId}`, {
        spanId: `run:${runId}`,
        kind: 'run',
        recordSequences: [0],
      }],
      ['model', 1, 4, `run:${runId}`, {
        spanId: 'llm:round-1',
        kind: 'llm',
        recordSequences: [1, 4],
      }],
      ['tools', 2, 3, `run:${runId}:tool:tool-1`, {
        spanId: 'tool:tool-1',
        kind: 'tool',
        recordSequences: [2, 3],
      }],
    ]);
  });

  it('tool attempt 命中 SubtoolCell，retrieval 无细 cell 时明确回退 RunCell', () => {
    const runId = 'run-a';
    const result = projectTrajectoryOverview({
      runs: [run(runId, '2026-08-24T00:00:00.000Z', 1_000)],
      focusedRunId: runId,
      focusedRunEvents: [
        event(runId, 0, 'tool_attempt_started', '2026-08-24T00:00:00.000Z', {
          payload: { tool_attempt_id: 'attempt-1', tool_name: '联网搜索' },
        }),
        event(runId, 1, 'tool_attempt_completed', '2026-08-24T00:00:00.100Z', {
          payload: { tool_attempt_id: 'attempt-1', status: 'success' },
        }),
        event(runId, 2, 'retrieval_started', '2026-08-24T00:00:00.200Z', {
          payload: { retrieval_id: 'retrieval-1', query_summary: '查资料' },
        }),
        event(runId, 3, 'retrieval_completed', '2026-08-24T00:00:00.300Z', {
          payload: { retrieval_id: 'retrieval-1', status: 'success' },
        }),
      ],
      cells: [runCell(runId), subtoolCell(runId, 'attempt-1', [0, 1])],
      mode: 'sequence',
    });

    expect(result.segments.map(segment => [
      segment.label,
      segment.targetCellKey,
      segment.spanIdentity,
    ])).toEqual([
      ['联网搜索', `run:${runId}:subtool:attempt-1`, {
        spanId: 'tool_attempt:attempt-1',
        kind: 'tool_attempt',
        recordSequences: [0, 1],
      }],
      ['查资料', `run:${runId}`, {
        spanId: 'retrieval:retrieval-1',
        kind: 'retrieval',
        recordSequences: [2, 3],
      }],
    ]);
  });

  it('compaction 控制记录优先定位更精确的 CompactedCell', () => {
    const runId = 'run-a';
    const compactedCell: TrajectoryCell = {
      key: `run:${runId}:compacted:8`,
      type: 'compacted',
      runId,
      userMessageId: null,
      assistantMessageId: null,
      completenessSources: ['durable-snapshot'],
      sourceSequences: [8],
      roundIndex: 2,
      removedTurns: 1,
      removedMessages: 2,
      removedToolTransactions: 1,
    };
    const contextCell: TrajectoryCell = {
      key: `run:${runId}:context:2:8`,
      type: 'context',
      runId,
      userMessageId: null,
      assistantMessageId: null,
      completenessSources: ['durable-snapshot'],
      sourceSequences: [8],
      contextId: '2',
      eventType: 'context_status_updated',
      payload: {},
    };
    const result = projectTrajectoryOverview({
      runs: [run(runId, '2026-08-24T00:00:00.000Z', 1_000)],
      focusedRunId: runId,
      focusedRunEvents: [event(
        runId,
        8,
        'context_status_updated',
        '2026-08-24T00:00:00.800Z',
        { payload: { round_index: 2, removed_turns: 1, removed_messages: 2 } },
      )],
      cells: [runCell(runId), contextCell, compactedCell],
      mode: 'sequence',
    });

    expect(result.segments[0]).toEqual(expect.objectContaining({
      track: 'input',
      targetCellKey: compactedCell.key,
      label: '上下文压缩',
    }));
  });

  it('切换聚焦 run 后彻底替换展开内容，即使输入误带缓存事件也不残留', () => {
    const runs = [
      run('run-a', '2026-08-24T00:00:00.000Z', 100),
      run('run-b', '2026-08-24T00:00:01.000Z', 100),
    ];
    const cachedEvents = [
      event('run-a', 0, 'run_started', '2026-08-24T00:00:00.000Z'),
      event('run-b', 0, 'run_started', '2026-08-24T00:00:01.000Z'),
    ];

    const result = projectTrajectoryOverview({
      runs,
      focusedRunId: 'run-b',
      focusedRunEvents: cachedEvents,
      cells: [runCell('run-a'), runCell('run-b')],
      mode: 'sequence',
    });

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].runId).toBe('run-b');
  });

  it('缺失、非法与零时长时间回退 sequence，所有几何仍为有限非负区间', () => {
    const runId = 'run-a';
    const result = projectTrajectoryOverview({
      runs: [run(runId, 'invalid', null, { ended_at: 'also-invalid' })],
      focusedRunId: runId,
      focusedRunEvents: [
        event(runId, 4, 'retrieval_started', 'invalid', {
          payload: { retrieval_id: 'retrieval-1' },
        }),
        event(runId, 5, 'retrieval_completed', 'invalid', {
          payload: { retrieval_id: 'retrieval-1', status: 'success' },
        }),
      ],
      cells: [runCell(runId)],
      mode: 'actual',
    });

    for (const item of [...result.runBands, ...result.segments]) {
      expect(Number.isFinite(item.start)).toBe(true);
      expect(Number.isFinite(item.end)).toBe(true);
      expect(item.start).toBeGreaterThanOrEqual(0);
      expect(item.end).toBeGreaterThan(item.start);
      expect(item.end).toBeLessThanOrEqual(1);
    }
  });

  it('5000 条事件投影在 250ms 内完成', () => {
    const runId = 'run-large';
    const events = Array.from({ length: 5_000 }, (_, sequence) => event(
      runId,
      sequence,
      sequence % 2 === 0 ? 'llm_round_started' : 'llm_round_completed',
      new Date(Date.parse('2026-08-24T00:00:00.000Z') + sequence).toISOString(),
      { payload: { llm_round_id: `round-${Math.floor(sequence / 2)}`, status: 'success' } },
    ));
    const started = performance.now();
    const result = projectTrajectoryOverview({
      runs: [run(runId, '2026-08-24T00:00:00.000Z', 5_000)],
      focusedRunId: runId,
      focusedRunEvents: events,
      cells: [runCell(runId)],
      mode: 'actual',
    });
    const elapsed = performance.now() - started;

    expect(result.segments).toHaveLength(2_500);
    expect(elapsed).toBeLessThanOrEqual(250);
  });
});
