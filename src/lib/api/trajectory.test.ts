import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/types/api';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import {
  getTrajectoryLlmNodeDetail,
  getTrajectoryRuns,
  getTrajectorySnapshot,
  getTrajectoryToolNodeDetail,
} from './trajectory';

describe('普通用户轨迹 API', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('通过普通 LLM Detail 端点编码路径并原样返回统一详情信封', async () => {
    const response = {
      status: 'available' as const,
      node_type: 'llm' as const,
      available_sections: ['summary', 'thinking', 'output', 'timing'] as const,
      detail: {
        llm_round_id: 'round/a b',
        reasoning_text: '先分析依赖关系。',
        output_text: '分析完成。',
      },
      redacted_fields: [],
      truncated_fields: ['output_text'],
      reason: null,
    };
    apiRequestMock.mockResolvedValue(response);

    await expect(getTrajectoryLlmNodeDetail('conversation/a b', 'run/a b', 'round/a b'))
      .resolves.toBe(response);
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/conversations/conversation%2Fa%20b/runs/run%2Fa%20b/node-detail/llm/round%2Fa%20b',
      {},
    );
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
      truncated_fields: [],
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

  it('Tool Detail 响应缺少新增的截断字段时在 API 边界补为空数组', async () => {
    apiRequestMock.mockResolvedValue({
      status: 'available',
      node_type: 'tool',
      available_sections: ['summary', 'payload', 'result', 'timing'],
      detail: {
        tool_call_id: 'tool-legacy-wire',
        tool_name: 'web_search',
        status: 'success',
        duration_ms: 2186,
        payload: { query: '国际金价' },
        result: { result_count: 5 },
        error: null,
      },
      redacted_fields: ['result.sources.0.url.query.id'],
      reason: null,
    });

    await expect(getTrajectoryToolNodeDetail(
      'conversation-1',
      'run-1',
      'tool-legacy-wire',
    )).resolves.toMatchObject({
      redacted_fields: ['result.sources.0.url.query.id'],
      truncated_fields: [],
    });
  });
});
