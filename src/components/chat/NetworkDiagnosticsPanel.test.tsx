import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { NetworkDiagnosticsResponse } from '@/types/networkDiagnostics';
import { deriveNetworkDiagnosticsModel } from './networkDiagnosticsModel';
import NetworkDiagnosticsPanel from './NetworkDiagnosticsPanel';

const diagnostics: NetworkDiagnosticsResponse = {
  conversation_id: 'conv-1',
  message_id: 'msg-1',
  run_id: 'run-1',
  visibility: 'admin',
  is_empty: false,
  summary: {
    total_duration_ms: 1500,
    total_steps: 2,
    total_tool_calls: 2,
    search_calls: 1,
    url_read_calls: 1,
    success_count: 1,
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
      requested_count: 8,
      actual_count: 5,
      context_count: 4,
      intent: 'comparison',
      domains: ['europa.eu'],
      recency_days: 7,
      budget_limited: true,
      admin: {
        trace_id: 'trace-1',
        input_params: { query: 'secret query' },
        step_number: 1,
      },
    },
    {
      tool_call_log_id: 'log-2',
      tool_name: 'url_read',
      status: 'degraded',
      duration_ms: 300,
      target: 'https://example.com',
      reason: 'reader-service 暂时未返回内容',
      admin: {
        trace_id: 'trace-2',
        input_params: { url: 'https://example.com' },
        step_number: 2,
      },
    },
  ],
};

describe('NetworkDiagnosticsPanel', () => {
  it('渲染用户可读联网过程，不展示管理员明细或 raw admin 字段', () => {
    render(<NetworkDiagnosticsPanel model={deriveNetworkDiagnosticsModel(diagnostics)} />);

    expect(screen.getByRole('heading', { name: '联网过程' })).toBeInTheDocument();
    expect(screen.getByText('搜索 1 次 · 读取 1 个网页 · 用时 1.5s · 异常 1 次')).toBeInTheDocument();
    expect(screen.getByText('搜索')).toBeInTheDocument();
    expect(screen.getByText('成功')).toBeInTheDocument();
    expect(screen.queryByText('5 条结果')).not.toBeInTheDocument();
    expect(screen.queryByText('intent: comparison')).not.toBeInTheDocument();
    expect(screen.queryByText('请求 8 条')).not.toBeInTheDocument();
    expect(screen.queryByText('返回 5 条')).not.toBeInTheDocument();
    expect(screen.queryByText('用于上下文 4 条')).not.toBeInTheDocument();
    expect(screen.queryByText('限定域名：europa.eu')).not.toBeInTheDocument();
    expect(screen.queryByText('近 7 天')).not.toBeInTheDocument();
    expect(screen.queryByText('已达联网预算')).not.toBeInTheDocument();
    expect(screen.getByText('G7 AI')).toBeInTheDocument();
    expect(screen.getByText('读取网页')).toBeInTheDocument();
    expect(screen.getByText('降级')).toBeInTheDocument();
    expect(screen.getByText('reader-service 暂时未返回内容')).toBeInTheDocument();

    expect(screen.queryByText('管理员明细')).not.toBeInTheDocument();
    expect(screen.queryByText('trace-1')).not.toBeInTheDocument();
    expect(screen.queryByText('trace-2')).not.toBeInTheDocument();
    expect(screen.queryByText('input_params')).not.toBeInTheDocument();
    expect(screen.queryByText('step_number')).not.toBeInTheDocument();
    expect(screen.queryByText('secret query')).not.toBeInTheDocument();
  });
});
