import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTrajectoryLlmNodeDetailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryLlmNodeDetail: getTrajectoryLlmNodeDetailMock,
}));

import { settleTrajectoryLlmNodeDetail } from './settleTrajectoryLlmNodeDetail';

describe('settleTrajectoryLlmNodeDetail', () => {
  beforeEach(() => getTrajectoryLlmNodeDetailMock.mockReset());

  it('只轮询 pending，available 后返回有界 preview 且不重拉快照', async () => {
    getTrajectoryLlmNodeDetailMock
      .mockResolvedValueOnce({
        status: 'pending',
        node_type: 'llm',
        available_sections: ['summary', 'timing'],
        detail: null,
        redacted_fields: [],
        truncated_fields: [],
        reason: 'detail pending',
      })
      .mockResolvedValueOnce({
        status: 'available',
        node_type: 'llm',
        available_sections: ['summary', 'thinking', 'output', 'timing'],
        detail: {
          llm_round_id: 'round-1',
          reasoning_text: '先分析。',
          output_text: '结论'.repeat(120),
        },
        redacted_fields: [],
        truncated_fields: [],
        reason: null,
      });

    await expect(settleTrajectoryLlmNodeDetail({
      conversationId: 'conversation-1',
      runId: 'run-1',
      llmRoundId: 'round-1',
      retryDelayMs: 0,
    })).resolves.toEqual({
      llm_round_id: 'round-1',
      reasoning_preview: '先分析。',
      output_preview: '结论'.repeat(100),
    });
    expect(getTrajectoryLlmNodeDetailMock).toHaveBeenCalledTimes(2);
  });

  it('degraded 是终态，不进入无界刷新', async () => {
    getTrajectoryLlmNodeDetailMock.mockResolvedValue({
      status: 'degraded',
      node_type: 'llm',
      available_sections: ['summary', 'timing'],
      detail: null,
      redacted_fields: [],
      truncated_fields: [],
      reason: 'detail missing',
    });

    await expect(settleTrajectoryLlmNodeDetail({
      conversationId: 'conversation-1',
      runId: 'run-1',
      llmRoundId: 'round-1',
      retryDelayMs: 0,
    })).resolves.toBeNull();
    expect(getTrajectoryLlmNodeDetailMock).toHaveBeenCalledTimes(1);
  });
});
