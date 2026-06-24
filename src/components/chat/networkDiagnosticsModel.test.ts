import { describe, expect, it } from 'vitest';
import type { NetworkDiagnosticsResponse } from '@/types/networkDiagnostics';
import { deriveNetworkDiagnosticsModel } from './networkDiagnosticsModel';

const base: NetworkDiagnosticsResponse = {
  conversation_id: 'conv-1',
  message_id: 'msg-1',
  run_id: 'run-1',
  visibility: 'user',
  is_empty: false,
  summary: {
    total_duration_ms: 4200,
    total_steps: 2,
    total_tool_calls: 3,
    search_calls: 2,
    url_read_calls: 1,
    success_count: 2,
    failed_count: 0,
    degraded_count: 1,
    interrupted_count: 0,
  },
  tools: [
    {
      tool_call_log_id: 'log-1',
      tool_name: 'web_search',
      status: 'success',
      duration_ms: 1200,
      target: 'G7 AI',
      result_count: 5,
    },
    {
      tool_call_log_id: 'log-2',
      tool_name: 'url_read',
      status: 'degraded',
      duration_ms: 3000,
      target: 'https://example.com',
      reason: 'reader-service 暂时未返回内容',
    },
  ],
};

describe('deriveNetworkDiagnosticsModel', () => {
  it('生成用户摘要和异常列表', () => {
    const model = deriveNetworkDiagnosticsModel(base);

    expect(model?.summaryText).toBe('联网诊断 · 搜索 2 次 · 读取 1 个网页 · 用时 4.2s');
    expect(model?.issueItems).toHaveLength(1);
    expect(model?.issueItems[0].reason).toContain('reader-service');
  });

  it('空 diagnostics 不渲染', () => {
    expect(deriveNetworkDiagnosticsModel({ ...base, is_empty: true, tools: [] })).toBeNull();
  });

  it('管理员可展开明细', () => {
    const model = deriveNetworkDiagnosticsModel({
      ...base,
      visibility: 'admin',
      tools: [{ ...base.tools[0], admin: { trace_id: 'trace-1' } }],
    });

    expect(model?.canShowAdminDetails).toBe(true);
  });
});
