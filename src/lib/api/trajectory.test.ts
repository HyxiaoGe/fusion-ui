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
  getTrajectorySkillsNodeDetail,
  getTrajectorySystemPromptNodeDetail,
  getTrajectoryToolNodeDetail,
} from './trajectory';

describe('普通用户轨迹 API', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('系统提示词正文走普通用户专用详情端点，编码路径、透传取消信号且不写 HTTP 缓存', async () => {
    const signal = new AbortController().signal;
    const response = {
      status: 'available' as const,
      node_type: 'system_prompt' as const,
      available_sections: ['summary', 'prompt'] as const,
      detail: {
        template_version: 'v1',
        fingerprint: 'fingerprint-1',
        char_count: 19,
        sections: [{ section_id: 'base', content: '  # 原始正文\n\n末行  ' }],
      },
      redacted_fields: [],
      truncated_fields: [],
      reason: null,
    };
    apiRequestMock.mockResolvedValue(response);

    await expect(getTrajectorySystemPromptNodeDetail('conversation/a b', 'run/a b', signal))
      .resolves.toBe(response);
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/conversations/conversation%2Fa%20b/runs/run%2Fa%20b/node-detail/system-prompt',
      { signal, cache: 'no-store' },
    );
  });

  it('Skills 正文走普通用户专用详情端点，编码路径、透传取消信号且不写 HTTP 缓存', async () => {
    const signal = new AbortController().signal;
    const response = {
      status: 'available' as const,
      node_type: 'skills' as const,
      available_sections: ['summary', 'prompt'] as const,
      detail: {
        status: 'loaded' as const,
        activation_source: 'capability_package' as const,
        skills: [{
          skill_id: 'verified-research', version: '1.0.0', content_sha256: 'b'.repeat(64),
          allowed_tool_names: ['web_search', 'url_read'], section_id: 'skill:verified-research@1.0.0',
          char_count: 12, content: '# 研究流程\n',
        }],
      },
      redacted_fields: [], truncated_fields: [], reason: null,
    };
    apiRequestMock.mockResolvedValue(response);

    await expect(getTrajectorySkillsNodeDetail('conversation/a b', 'run/a b', signal))
      .resolves.toBe(response);
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/conversations/conversation%2Fa%20b/runs/run%2Fa%20b/node-detail/skills',
      { signal, cache: 'no-store' },
    );
  });

  it('系统提示词旧记录的 not_recorded 与权限或不存在的 404 保持区分', async () => {
    const response = {
      status: 'not_recorded',
      node_type: 'system_prompt',
      available_sections: ['summary'],
      detail: null,
      redacted_fields: [],
      truncated_fields: [],
      reason: 'system_prompt_not_recorded',
    };
    const notFound = new ApiError('NOT_FOUND', '会话或轨迹不存在，或无权访问', 'req-404');
    apiRequestMock.mockResolvedValueOnce(response).mockRejectedValueOnce(notFound);

    await expect(getTrajectorySystemPromptNodeDetail('conversation-1', 'run-legacy'))
      .resolves.toBe(response);
    await expect(getTrajectorySystemPromptNodeDetail('conversation-1', 'run-inaccessible'))
      .rejects.toBe(notFound);
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
