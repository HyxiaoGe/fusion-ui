import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import {
  getAdminAuditEvents,
  getAdminConversation,
  getAdminConversationAgentRuns,
  getAdminConversations,
  getAdminConversationToolCalls,
  getAdminPerformanceRun,
  getAdminPerformanceRuns,
  getAdminUsers,
  importAdminPerformanceRun,
} from './adminAudit';

describe('管理员审计 API', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ items: [] });
  });

  it('只序列化有值的用户筛选并传递 AbortSignal', async () => {
    const signal = new AbortController().signal;

    await getAdminUsers({ page: 2, page_size: 50, q: ' sean@example.com ', is_superuser: false }, signal);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/admin/audit/users?page=2&page_size=50&q=sean%40example.com&is_superuser=false',
      { signal },
    );
  });

  it('编码组合对话筛选且不会丢失 false', async () => {
    await getAdminConversations({
      page: 1,
      page_size: 25,
      user_id: 'user/a',
      model_id: 'gpt 5',
      has_tools: true,
      has_files: false,
      created_from: '2026-07-01',
      created_to: '2026-07-11',
    });

    expect(apiRequestMock.mock.calls[0][0]).toBe(
      '/api/admin/audit/conversations?page=1&page_size=25&user_id=user%2Fa&model_id=gpt+5&has_tools=true&has_files=false&created_from=2026-07-01T00%3A00%3A00.000%2B08%3A00&created_to=2026-07-11T23%3A59%3A59.999%2B08%3A00',
    );
  });

  it('用户注册日期筛选按东八区覆盖完整开始日和结束日', async () => {
    await getAdminUsers({
      page: 1,
      page_size: 25,
      created_from: '2026-07-01',
      created_to: '2026-07-11',
    });

    expect(apiRequestMock.mock.calls[0][0]).toBe(
      '/api/admin/audit/users?page=1&page_size=25&created_from=2026-07-01T00%3A00%3A00.000%2B08%3A00&created_to=2026-07-11T23%3A59%3A59.999%2B08%3A00',
    );
  });

  it('安全编码详情资源 ID', async () => {
    await getAdminConversation('conv/a b');
    await getAdminPerformanceRun('perf/a b');
    expect(apiRequestMock.mock.calls).toEqual([
      ['/api/admin/audit/conversations/conv%2Fa%20b', {}],
      ['/api/admin/audit/performance-runs/perf%2Fa%20b', {}],
    ]);
  });

  it('压测导入只发送 JSON 请求体', async () => {
    const payload = { schema_version: 1, run_id: 'perf-1', environment: 'prod', status: 'completed', safe_summary: { rps: 10 } };

    await importAdminPerformanceRun(payload);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/audit/performance-runs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('访问审计和压测列表都使用有界分页', async () => {
    await getAdminAuditEvents({ page: 3, page_size: 100, action: 'conversation.view' });
    await getAdminPerformanceRuns({ page: 1, page_size: 25, environment: 'prod' });

    expect(apiRequestMock.mock.calls.map(call => call[0])).toEqual([
      '/api/admin/audit/events?page=3&page_size=100&action=conversation.view',
      '/api/admin/audit/performance-runs?page=1&page_size=25&environment=prod',
    ]);
  });

  it('Agent runs 与 tool calls 分别编码各自页码', async () => {
    await getAdminConversationAgentRuns('conv/a', { page: 2, page_size: 25 });
    await getAdminConversationToolCalls('conv/a', { page: 3, page_size: 10 });

    expect(apiRequestMock.mock.calls.map(call => call[0])).toEqual([
      '/api/admin/audit/conversations/conv%2Fa/agent-runs?page=2&page_size=25',
      '/api/admin/audit/conversations/conv%2Fa/tool-calls?page=3&page_size=10',
    ]);
  });
});
