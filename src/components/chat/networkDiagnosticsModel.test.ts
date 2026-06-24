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
    total_tool_calls: 4,
    search_calls: 2,
    url_read_calls: 1,
    success_count: 2,
    failed_count: 1,
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
    {
      tool_call_log_id: 'log-3',
      tool_name: 'custom_fetch',
      status: 'failed',
      duration_ms: null,
      target: '自定义工具目标',
      reason: '工具超时',
    },
  ],
};

describe('deriveNetworkDiagnosticsModel', () => {
  it('生成用户可读摘要和完整联网过程', () => {
    const model = deriveNetworkDiagnosticsModel(base);

    expect(model?.summaryText).toBe('联网诊断 · 搜索 2 次 · 读取 1 个网页 · 用时 4.2s · 异常 2 次');
    expect(model?.displaySummaryText).toBe('搜索 2 次 · 读取 1 个网页 · 用时 4.2s · 异常 2 次');
    expect(model?.processItems).toEqual([
      {
        id: 'log-1',
        toolLabel: '搜索',
        status: 'success',
        statusLabel: '成功',
        target: 'G7 AI',
        resultCount: 5,
        durationText: '1.2s',
        detailParts: [],
      },
      {
        id: 'log-2',
        toolLabel: '读取网页',
        status: 'degraded',
        statusLabel: '降级',
        target: 'https://example.com',
        resultCount: null,
        durationText: '3.0s',
        reason: 'reader-service 暂时未返回内容',
        detailParts: [],
      },
      {
        id: 'log-3',
        toolLabel: 'custom_fetch',
        status: 'failed',
        statusLabel: '失败',
        target: '自定义工具目标',
        resultCount: null,
        durationText: '耗时未知',
        reason: '工具超时',
        detailParts: [],
      },
    ]);
    expect(model?.issueItems).toHaveLength(2);
    expect(model?.issueItems[0].reason).toContain('reader-service');
  });

  it('空 diagnostics 不渲染', () => {
    expect(deriveNetworkDiagnosticsModel({ ...base, is_empty: true, tools: [] })).toBeNull();
  });

  it('管理员数据不再开启管理员明细', () => {
    const model = deriveNetworkDiagnosticsModel({
      ...base,
      visibility: 'admin',
      tools: [{ ...base.tools[0], admin: { trace_id: 'trace-1' } }],
    });

    expect(model?.canShowAdminDetails).toBe(false);
  });

  it('为搜索和读取工具生成紧凑详情文案', () => {
    const model = deriveNetworkDiagnosticsModel({
      ...base,
      summary: {
        ...base.summary,
        total_tool_calls: 2,
        search_calls: 1,
        url_read_calls: 1,
      },
      tools: [
        {
          tool_call_log_id: 'log-search',
          tool_name: 'web_search',
          status: 'degraded',
          duration_ms: 900,
          target: 'AI regulation',
          result_count: 7,
          requested_count: 8,
          actual_count: 7,
          context_count: 6,
          intent: 'comparison',
          domains: ['europa.eu', 'whitehouse.gov'],
          recency_days: 30,
          budget_limited: true,
        },
        {
          tool_call_log_id: 'log-read',
          tool_name: 'url_read',
          status: 'success',
          duration_ms: 500,
          target: 'https://example.com/report',
          reason: '需要核实官方原文细节',
        },
      ],
    });

    expect(model?.processItems[0].detailParts).toEqual([
      'intent: comparison',
      '请求 8 条',
      '返回 7 条',
      '用于上下文 6 条',
      '限定域名：europa.eu、whitehouse.gov',
      '近 30 天',
      '已达联网预算',
    ]);
    expect(model?.processItems[1].detailParts).toEqual([
      '读取原因：需要核实官方原文细节',
    ]);
  });
});
