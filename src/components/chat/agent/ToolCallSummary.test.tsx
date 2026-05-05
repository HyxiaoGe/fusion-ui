import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolCallSummary } from './ToolCallSummary';
import type { ToolCallState } from '@/types/agentRun';

const tc = (over: Partial<ToolCallState>): ToolCallState => ({
  toolCallId: 't1',
  toolName: 'web_search',
  arguments: { query: 'GPT 5.5' },
  status: 'success',
  startedAt: 0,
  ...over,
});

describe('ToolCallSummary', () => {
  it('显示 query → 5 条 结果', () => {
    render(<ToolCallSummary call={tc({
      resultSummary: { kind: 'web_search', title: '5 篇高质量记录', count: 5, truncated: false },
    })} />);
    expect(screen.getByText(/GPT 5.5/)).toBeInTheDocument();
    expect(screen.getByText(/5 条/)).toBeInTheDocument();
    expect(screen.getByText(/5 篇高质量记录/)).toBeInTheDocument();
  });

  it('truncated 时显示「截断」标记', () => {
    render(<ToolCallSummary call={tc({
      resultSummary: { kind: 'web_search', title: '部分内容', count: 3, truncated: true },
    })} />);
    expect(screen.getByText(/截断/)).toBeInTheDocument();
  });

  it('failed 时显示「未完成」', () => {
    render(<ToolCallSummary call={tc({ status: 'failed' })} />);
    expect(screen.getByText(/未完成/)).toBeInTheDocument();
  });

  it('running 时显示 …', () => {
    render(<ToolCallSummary call={tc({ status: 'running', resultSummary: undefined })} />);
    expect(screen.getByText(/…/)).toBeInTheDocument();
  });

  it('url_read 显示 url 文本', () => {
    render(<ToolCallSummary call={tc({
      toolName: 'url_read',
      arguments: { url: 'https://example.com/post' },
      resultSummary: { kind: 'url_read', title: '官方文档', truncated: false },
    })} />);
    expect(screen.getByText(/example.com/)).toBeInTheDocument();
  });

  it('degraded 且无 result 时显示「部分结果不可用」', () => {
    render(<ToolCallSummary call={tc({ status: 'degraded', resultSummary: undefined })} />);
    expect(screen.getByText(/部分结果不可用/)).toBeInTheDocument();
  });

  it('interrupted 且无 result 时显示「已中断」', () => {
    render(<ToolCallSummary call={tc({ status: 'interrupted', resultSummary: undefined })} />);
    expect(screen.getByText(/已中断/)).toBeInTheDocument();
  });

  it('success 但无 result 时不显示状态文案（罕见 edge case）', () => {
    const { container } = render(<ToolCallSummary call={tc({ status: 'success', resultSummary: undefined })} />);
    // 不应出现 "未完成" / "已中断" / "部分结果不可用" / "…" 这些状态文案
    expect(container.textContent).not.toMatch(/未完成|已中断|部分结果不可用|…/);
    // 但 input (query 'GPT 5.5') 仍应显示
    expect(screen.getByText(/GPT 5.5/)).toBeInTheDocument();
  });
});
