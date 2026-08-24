import { describe, expect, it } from 'vitest';

import type { TrajectorySpan } from '@/types/trajectory';
import type { TrajectoryCell } from './TrajectoryCellProjection';
import type { TrajectoryOverviewProjection } from './trajectoryOverviewModel';
import {
  projectTrajectoryNetworkView,
  resolveTrajectorySelectedCell,
} from './trajectoryNetworkViewModel';

function userCell(key: string, text: string): TrajectoryCell {
  return {
    key,
    type: 'user',
    runId: null,
    userMessageId: key,
    assistantMessageId: null,
    completenessSources: ['message'],
    sourceSequences: [],
    message: {
      id: key,
      role: 'user',
      content: [{ id: `${key}-text`, type: 'text', text }],
    },
  };
}

function messageCell(key: string, text: string): TrajectoryCell {
  return {
    key: `message:assistant:${key}`,
    type: 'message',
    runId: null,
    userMessageId: null,
    assistantMessageId: key,
    completenessSources: ['message'],
    sourceSequences: [],
    message: {
      id: key,
      role: 'assistant',
      content: [{ id: `${key}-text`, type: 'text', text }],
    },
  };
}

function runCell(runId: string, userMessageId: string, hydrated: boolean): TrajectoryCell {
  return {
    key: `run:${runId}`,
    type: 'run',
    runId,
    userMessageId,
    assistantMessageId: `${runId}-answer`,
    completenessSources: ['run-summary'],
    sourceSequences: [],
    summarySource: 'run-summary',
    attemptIndex: 0,
    runStatus: hydrated ? 'completed' : 'running',
    totalSteps: 1,
    totalToolCalls: 1,
    startedAt: '2026-08-24T00:00:00.000Z',
    endedAt: hydrated ? '2026-08-24T00:00:01.000Z' : null,
    isSelected: runId === 'run-a',
    isHydrated: hydrated,
    association: 'explicit',
    trajectoryBadge: {
      status: hydrated ? 'complete' : 'recording',
      source: 'run-summary',
      reason: null,
    },
    records: [],
    spans: [],
    liveTail: [],
  };
}

function toolCell(runId: string, userMessageId: string, sequence: number): TrajectoryCell {
  return {
    key: `run:${runId}:tool:tool-${runId}`,
    type: 'tool',
    runId,
    userMessageId,
    assistantMessageId: `${runId}-answer`,
    completenessSources: ['durable-snapshot'],
    sourceSequences: [sequence],
    toolCallId: `tool-${runId}`,
    stepId: 'step-1',
    toolName: 'web_search',
    status: 'success',
    events: [],
  };
}

function planCell(runId: string, userMessageId: string): TrajectoryCell {
  return {
    key: `run:${runId}:plan:plan-1`,
    type: 'plan',
    runId,
    userMessageId,
    assistantMessageId: `${runId}-answer`,
    completenessSources: ['durable-snapshot'],
    sourceSequences: [3],
    planId: 'plan-1',
    revision: 1,
    payload: {},
  };
}

function overview(): TrajectoryOverviewProjection {
  return {
    mode: 'sequence',
    runBands: [
      {
        runId: 'run-a',
        start: 0,
        end: 0.5,
        hydrated: true,
        selected: true,
        status: 'completed',
      },
      {
        runId: 'run-b',
        start: 0.5,
        end: 1,
        hydrated: false,
        selected: false,
        status: 'running',
      },
    ],
    segments: [{
      key: 'overview:run-a:tools:tool-a',
      runId: 'run-a',
      track: 'tools',
      start: 0.2,
      end: 0.4,
      targetCellKey: 'run:run-a:tool:tool-run-a',
      label: '联网搜索',
      status: 'completed',
      startedAt: '2026-08-24T00:00:00.200Z',
      endedAt: '2026-08-24T00:00:00.400Z',
      startSequence: 4,
      endSequence: 5,
    }],
  };
}

describe('trajectoryNetworkViewModel', () => {
  it('范围使用闭区间命中详细 segment，并把未水合 Run 作为待确认占位与搜索取交集', () => {
    const cells = [
      userCell('user-a', '查询北京天气'),
      runCell('run-a', 'user-a', true),
      toolCell('run-a', 'user-a', 4),
      userCell('user-b', '继续查询'),
      runCell('run-b', 'user-b', false),
    ];

    const result = projectTrajectoryNetworkView({
      cells,
      overview: overview(),
      searchQuery: '搜索',
      range: { start: 0.4, end: 0.75 },
    });

    expect([...result.rangeFocusedCellKeys ?? []]).toEqual([
      'run:run-a:tool:tool-run-a',
      'run:run-b',
    ]);
    expect(result.rows.map(row => row.key)).toEqual([
      'user-a',
      'run:run-a',
      'run:run-a:tool:tool-run-a',
      'user-b',
      'run:run-b',
    ]);
    expect([...result.searchMatchedCellKeys]).toEqual(['run:run-a:tool:tool-run-a']);
    expect(result.hasPendingRangeMatch).toBe(true);
  });

  it('非聚焦 Run 即使已有缓存也只纳入 Run 占位，不拼入其他 Run 详情', () => {
    const projection = overview();
    projection.runBands[1] = { ...projection.runBands[1], hydrated: true };
    const cells = [
      userCell('user-a', '第一轮'),
      runCell('run-a', 'user-a', true),
      toolCell('run-a', 'user-a', 4),
      userCell('user-b', '第二轮'),
      runCell('run-b', 'user-b', true),
      toolCell('run-b', 'user-b', 7),
    ];

    const result = projectTrajectoryNetworkView({
      cells,
      overview: projection,
      searchQuery: '',
      range: { start: 0.7, end: 0.9 },
    });

    expect([...result.rangeFocusedCellKeys ?? []]).toEqual(['run:run-b']);
    expect(result.rows.map(row => row.key)).toEqual(['user-b', 'run:run-b']);
    expect(result.hasPendingRangeMatch).toBe(false);
  });

  it('局部无 span cell 仅在当前 Redux 选择域内生效，失效后按 span、Run、message 回退', () => {
    const cells = [
      userCell('user-a', '第一轮'),
      runCell('run-a', 'user-a', true),
      planCell('run-a', 'user-a'),
      toolCell('run-a', 'user-a', 4),
      userCell('user-b', '第二轮'),
      runCell('run-b', 'user-b', true),
      messageCell('assistant-b', '完成'),
    ];
    const span: TrajectorySpan = {
      span_id: 'tool:tool-run-a',
      kind: 'tool',
      name: 'tool-run-a',
      parent_span_id: null,
      start_sequence: 4,
      end_sequence: 4,
      started_at: '2026-08-24T00:00:00.400Z',
      ended_at: '2026-08-24T00:00:00.400Z',
      duration_ms: null,
      status: 'completed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: null,
      record_sequences: [4],
    };

    expect(resolveTrajectorySelectedCell({
      cells,
      localSelectedCellKey: 'run:run-a:plan:plan-1',
      selectedMessageId: 'run-a-answer',
      selectedRunId: 'run-a',
      selectedSpan: null,
    })?.key).toBe('run:run-a:plan:plan-1');

    expect(resolveTrajectorySelectedCell({
      cells,
      localSelectedCellKey: 'run:run-a:plan:plan-1',
      selectedMessageId: 'run-b-answer',
      selectedRunId: 'run-b',
      selectedSpan: null,
    })?.key).toBe('run:run-b');

    expect(resolveTrajectorySelectedCell({
      cells,
      localSelectedCellKey: null,
      selectedMessageId: 'run-a-answer',
      selectedRunId: 'run-a',
      selectedSpan: span,
    })?.key).toBe('run:run-a:tool:tool-run-a');

    expect(resolveTrajectorySelectedCell({
      cells,
      localSelectedCellKey: null,
      selectedMessageId: 'assistant-b',
      selectedRunId: null,
      selectedSpan: null,
    })?.key).toBe('message:assistant:assistant-b');
  });
});
