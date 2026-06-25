import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolCallSummary } from './ToolCallSummary';
import type { ToolCallGroup } from '@/lib/agent/toolCallGroups';

const group = (over: Partial<ToolCallGroup>): ToolCallGroup => ({
  id: 'web_search',
  kind: 'web_search',
  toolName: 'web_search',
  label: '搜索',
  count: 2,
  resultCount: 10,
  status: 'success',
  summary: '搜索 2 次 · 共 10 条结果',
  details: [
    { id: 's1', primary: 'Global AI Standards Forum', secondary: '5 条结果', status: 'success', truncated: false, fullValue: 'Global AI Standards Forum' },
    { id: 's2', primary: 'AI CEOs G7', secondary: '5 条结果', status: 'success', truncated: false, fullValue: 'AI CEOs G7' },
  ],
  hasExpandableDetails: true,
  shouldShowDetailsByDefault: false,
  ...over,
});

describe('ToolCallSummary', () => {
  it('summary 模式显示聚合文案，不逐个重复工具名', () => {
    render(<ToolCallSummary group={group({})} mode="summary" />);
    expect(screen.getByText('搜索 2 次 · 共 10 条结果')).toBeInTheDocument();
    expect(screen.queryByText('Global AI Standards Forum')).not.toBeInTheDocument();
  });

  it('details 模式显示 query 和结果摘要', () => {
    render(<ToolCallSummary group={group({})} mode="details" />);
    expect(screen.getByText('Global AI Standards Forum')).toBeInTheDocument();
    expect(screen.getByText('AI CEOs G7')).toBeInTheDocument();
    expect(screen.getAllByText('5 条结果')).toHaveLength(2);
  });

  it('url_read details 展示 hostname 和标题', () => {
    render(<ToolCallSummary group={group({
      id: 'url_read',
      kind: 'url_read',
      toolName: 'url_read',
      label: '读取',
      summary: '读取 2 个网页',
      details: [
        { id: 'u1', primary: 'www.semafor.com', secondary: 'AI CEOs pitch G7 leaders', status: 'success', truncated: false, fullValue: 'https://www.semafor.com/article/06/17/2026/ai-ceos-talk-global-standards-at-g7' },
        { id: 'u2', primary: 'letsdatascience.com', secondary: 'AI CEOs Attend G7', status: 'success', truncated: false, fullValue: 'https://letsdatascience.com/news/ai-ceos-attend-g7-pitch-global-standards-f3bc1bca' },
      ],
    })} mode="details" />);

    expect(screen.getByText('www.semafor.com')).toBeInTheDocument();
    expect(screen.getByText('letsdatascience.com')).toBeInTheDocument();
    expect(screen.getByText('AI CEOs pitch G7 leaders')).toBeInTheDocument();
  });

  it('failed details 显示失败目标和用户可读说明', () => {
    render(<ToolCallSummary group={group({
      status: 'failed',
      summary: '搜索未取得可用结果 · 2 个查询',
      details: [
        { id: 's1', primary: 'Global AI Standards Forum', secondary: '部分搜索结果未能使用', status: 'failed', truncated: false, fullValue: 'Global AI Standards Forum' },
      ],
    })} mode="details" />);

    expect(screen.getByText('Global AI Standards Forum')).toBeInTheDocument();
    expect(screen.getByText('部分搜索结果未能使用')).toBeInTheDocument();
    expect(screen.queryByText(/TIMEOUT/)).not.toBeInTheDocument();
  });

  it('running summary 显示 spinner 和运行中文案', () => {
    const { container } = render(<ToolCallSummary group={group({
      status: 'running',
      summary: '正在搜索 · 2 个查询',
    })} mode="summary" />);

    expect(screen.getByText('正在搜索 · 2 个查询')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('truncated detail 显示截断提示', () => {
    render(<ToolCallSummary group={group({
      details: [
        { id: 's1', primary: 'Global AI Standards Forum', secondary: '部分结果', status: 'success', truncated: true, fullValue: 'Global AI Standards Forum' },
      ],
    })} mode="details" />);

    expect(screen.getByText(/截断/)).toBeInTheDocument();
  });

  it('长文本节点保留 truncate 和 min-w-0 class', () => {
    const longText = '一段非常非常非常长的搜索关键词'.repeat(20);
    const { container } = render(<ToolCallSummary group={group({
      details: [
        { id: 's1', primary: longText, secondary: longText, status: 'success', truncated: false, fullValue: longText },
      ],
    })} mode="details" />);

    const truncateSpans = container.querySelectorAll('span.truncate');
    expect(truncateSpans.length).toBeGreaterThanOrEqual(2);
    truncateSpans.forEach(el => {
      expect(el.className).toMatch(/min-w-0/);
    });
  });
});
