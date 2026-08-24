import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/types/api';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import {
  getTrajectoryRuns,
  getTrajectorySnapshot,
  getTrajectoryToolNodeDetail,
} from './trajectory';

describe('普通用户轨迹 API', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('通过普通 run 列表端点保留后端截断标识', async () => {
    apiRequestMock.mockResolvedValue({ items: [], truncated: true });

    await expect(getTrajectoryRuns('conversation/a b')).resolves.toEqual({
      items: [],
      truncated: true,
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/conversations/conversation%2Fa%20b/runs',
      {},
    );
  });

  it('通过普通快照端点透传 AbortSignal', async () => {
    const signal = new AbortController().signal;
    apiRequestMock.mockResolvedValue({
      run: { run_id: 'run-1' }, records: [], spans: [], completeness: { status: 'complete' }, truncated: false,
    });

    await getTrajectorySnapshot('conversation-1', 'run/a b', signal);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/conversations/conversation-1/runs/run%2Fa%20b/trajectory',
      { signal },
    );
  });

  it('保留 apiRequest 解包后的 404 和 401，供界面区分空态与鉴权失败', async () => {
    const notFound = new ApiError('NOT_FOUND', '会话或轨迹不存在，或无权访问', 'req-404');
    const unauthorized = new ApiError('UNAUTHORIZED', 'Unauthorized', 'req-401');
    apiRequestMock.mockRejectedValueOnce(notFound).mockRejectedValueOnce(unauthorized);

    await expect(getTrajectoryRuns('conversation-1')).rejects.toBe(notFound);
    await expect(getTrajectorySnapshot('conversation-1', 'run-1')).rejects.toBe(unauthorized);
  });

  it('通过普通 Tool Detail 端点编码每个路径段、透传 signal 并原样返回 wire DTO', async () => {
    const signal = new AbortController().signal;
    const response = {
      status: 'available' as const,
      node_type: 'tool' as const,
      available_sections: ['summary', 'payload', 'result', 'timing'] as const,
      detail: {
        tool_call_id: 'tool/a b',
        tool_name: 'weather',
        status: 'completed',
        duration_ms: 42,
        payload: { city: '上海' },
        result: { temperature: 28 },
        error: null,
      },
      redacted_fields: ['payload.api_key'],
      reason: null,
    };
    apiRequestMock.mockResolvedValue(response);

    await expect(getTrajectoryToolNodeDetail('conversation/a b', 'run/a b', 'tool/a b', signal))
      .resolves.toBe(response);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/conversations/conversation%2Fa%20b/runs/run%2Fa%20b/node-detail/tool/tool%2Fa%20b',
      { signal },
    );
  });
});
