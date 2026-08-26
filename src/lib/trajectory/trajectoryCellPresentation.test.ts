import { describe, expect, it } from 'vitest';

import type { TrajectoryCell } from './TrajectoryCellProjection';
import { getTrajectoryCellPresentation } from './trajectoryCellPresentation';

function runCell(attemptIndex: number | null): Extract<TrajectoryCell, { type: 'run' }> {
  return {
    key: 'run:run-1',
    type: 'run',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['run-summary'],
    sourceSequences: [],
    summarySource: 'run-summary',
    attemptIndex,
    runStatus: 'completed',
    totalSteps: 2,
    totalToolCalls: 1,
    startedAt: '2026-08-26T00:00:00.000Z',
    endedAt: '2026-08-26T00:00:01.000Z',
    isSelected: false,
    isHydrated: true,
    association: 'explicit',
    trajectoryBadge: { status: 'complete', source: 'run-summary', reason: null },
    records: [],
    spans: [],
    liveTail: [],
  };
}

function attemptCell(attemptIndex: number | null): Extract<TrajectoryCell, { type: 'subtool' }> {
  return {
    key: 'run:run-1:subtool:attempt-1',
    type: 'subtool',
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [3],
    toolCallId: 'tool-1',
    toolAttemptId: 'attempt-1',
    toolName: 'web_search',
    attemptIndex,
    status: 'success',
    events: [],
  };
}

function contextCell(payload: Record<string, unknown>): Extract<TrajectoryCell, { type: 'context' }> {
  return {
    key: 'run:run-1:context:context_status_updated:1',
    type: 'context',
    turnMessageId: 'message-1',
    source: 'durable-snapshot',
    sequenceStart: 2,
    sequenceEnd: 3,
    timestampStart: '2026-08-25T11:43:40.000Z',
    timestampEnd: '2026-08-25T11:43:43.000Z',
    runId: 'run-1',
    contextId: 'context_status_updated:1',
    eventType: 'context_status_updated',
    payload,
  };
}

describe('轨迹单元格展示', () => {
  it.each([
    { attemptIndex: 1, expected: '第 1 次执行' },
    { attemptIndex: 2, expected: '第 2 次执行' },
    { attemptIndex: null, expected: '执行' },
  ])('Run 摘要使用后端序号 $attemptIndex，未知时不补序号', ({ attemptIndex, expected }) => {
    expect(getTrajectoryCellPresentation(runCell(attemptIndex)).kindLabel).toBe(expected);
  });

  it.each([
    { attemptIndex: 1, expected: '搜索 · 第 1 次' },
    { attemptIndex: 2, expected: '搜索 · 第 2 次' },
    { attemptIndex: null, expected: '搜索' },
  ])('工具 Attempt 摘要使用后端序号 $attemptIndex，未知时不补序号', ({ attemptIndex, expected }) => {
    expect(getTrajectoryCellPresentation(attemptCell(attemptIndex)).summary).toBe(expected);
  });

  it('把 final 上下文协议阶段展示为实际 Token 用量而不是内部枚举值', () => {
    const presentation = getTrajectoryCellPresentation(contextCell({
      phase: 'final',
      status: 'no_op_fast_path',
      actual_prompt_tokens: 8459,
      window_tokens: 1_000_000,
    }));

    expect(presentation.summary).toBe('上下文充足 · 实际 8,459 / 1,000,000 Token');
    expect(presentation.summary).not.toContain('final');
  });
});
