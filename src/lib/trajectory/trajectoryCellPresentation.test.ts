import { describe, expect, it } from 'vitest';

import type { TrajectoryCell } from './TrajectoryCellProjection';
import { getTrajectoryCellPresentation } from './trajectoryCellPresentation';

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
