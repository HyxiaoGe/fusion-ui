import { describe, expect, it } from 'vitest';
import type { ToolCallState } from '@/types/agentRun';
import {
  groupToolCalls,
  getToolGroupStatusClass,
  type ToolCallGroup,
} from './toolCallGroups';

const tc = (over: Partial<ToolCallState>): ToolCallState => ({
  toolCallId: 't1',
  toolName: 'web_search',
  arguments: { query: 'Global AI Standards Forum' },
  status: 'success',
  startedAt: 0,
  resultSummary: { kind: 'web_search', title: '5 条结果', count: 5, truncated: false },
  ...over,
});

const findGroup = (groups: ToolCallGroup[], toolName: string) => {
  const group = groups.find(g => g.toolName === toolName);
  if (!group) throw new Error(`missing group ${toolName}`);
  return group;
};

describe('groupToolCalls', () => {
  it('多个 web_search 聚合成一条搜索摘要并累计结果数', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', arguments: { query: 'Global AI Standards Forum' }, resultSummary: { kind: 'web_search', title: '第一组', count: 5, truncated: false } }),
      tc({ toolCallId: 's2', arguments: { query: 'AI CEOs G7' }, resultSummary: { kind: 'web_search', title: '第二组', count: 5, truncated: false } }),
    ]);

    expect(groups).toHaveLength(1);
    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('success');
    expect(search.count).toBe(2);
    expect(search.resultCount).toBe(10);
    expect(search.summary).toBe('搜索 2 次 · 共 10 条结果');
    expect(search.hasExpandableDetails).toBe(true);
    expect(search.shouldShowDetailsByDefault).toBe(false);
    expect(search.details.map(d => d.primary)).toEqual(['Global AI Standards Forum', 'AI CEOs G7']);
  });

  it('多个 url_read 聚合成一条网页读取摘要并提取 hostname', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'u1', toolName: 'url_read', arguments: { url: 'https://www.semafor.com/article/06/17/2026/ai-ceos-talk-global-standards-at-g7' }, resultSummary: { kind: 'url_read', title: 'AI CEOs pitch G7 leaders', truncated: false } }),
      tc({ toolCallId: 'u2', toolName: 'url_read', arguments: { url: 'https://letsdatascience.com/news/ai-ceos-attend-g7-pitch-global-standards-f3bc1bca' }, resultSummary: { kind: 'url_read', title: 'AI CEOs Attend G7', truncated: false } }),
    ]);

    expect(groups).toHaveLength(1);
    const read = findGroup(groups, 'url_read');
    expect(read.summary).toBe('读取 2 个网页');
    expect(read.details.map(d => d.primary)).toEqual(['www.semafor.com', 'letsdatascience.com']);
    expect(read.details.map(d => d.secondary)).toEqual(['AI CEOs pitch G7 leaders', 'AI CEOs Attend G7']);
  });

  it('同组存在成功和失败时显示 partial 并默认展开详情', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', status: 'success' }),
      tc({ toolCallId: 's2', status: 'failed', resultSummary: undefined, error: 'TIMEOUT: fetch 超时' }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('partial');
    expect(search.summary).toBe('搜索 2 次 · 1 次失败');
    expect(search.hasExpandableDetails).toBe(true);
    expect(search.shouldShowDetailsByDefault).toBe(true);
    expect(search.details[1].secondary).toBe('TIMEOUT: fetch 超时');
  });

  it('running 优先于其他状态并显示正在搜索', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', status: 'success' }),
      tc({ toolCallId: 's2', status: 'running', resultSummary: undefined, arguments: { query: 'OpenAI latest model' } }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('running');
    expect(search.summary).toBe('正在搜索 · 2 个查询');
    expect(search.shouldShowDetailsByDefault).toBe(true);
  });

  it('全部失败时显示失败摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', status: 'failed', resultSummary: undefined, error: 'SERVICE_UNAVAILABLE' }),
      tc({ toolCallId: 's2', status: 'failed', resultSummary: undefined, error: 'TIMEOUT' }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('failed');
    expect(search.summary).toBe('搜索失败 · 2 个查询');
    expect(search.shouldShowDetailsByDefault).toBe(true);
  });

  it('degraded 状态显示降级摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'u1', toolName: 'url_read', status: 'degraded', arguments: { url: 'https://example.com/a' }, resultSummary: undefined }),
    ]);

    const read = findGroup(groups, 'url_read');
    expect(read.status).toBe('degraded');
    expect(read.summary).toBe('网页读取降级 · 已跳过部分页面');
    expect(read.shouldShowDetailsByDefault).toBe(true);
  });

  it('interrupted 状态显示已中断摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'u1', toolName: 'url_read', status: 'interrupted', arguments: { url: 'https://example.com/a' }, resultSummary: undefined }),
    ]);

    const read = findGroup(groups, 'url_read');
    expect(read.status).toBe('interrupted');
    expect(read.summary).toBe('网页读取已中断 · 1 个目标');
    expect(read.shouldShowDetailsByDefault).toBe(true);
  });

  it('未知工具按 toolName 聚合并显示调用工具摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'x1', toolName: 'calculator', arguments: { expression: '1+1' }, resultSummary: { kind: 'calculator', title: '2', truncated: false } }),
      tc({ toolCallId: 'x2', toolName: 'calculator', arguments: { expression: '2+2' }, resultSummary: { kind: 'calculator', title: '4', truncated: false } }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].toolName).toBe('calculator');
    expect(groups[0].kind).toBe('other');
    expect(groups[0].summary).toBe('调用 2 个工具');
  });

  it('截断结果让成功组可展开但不默认展开', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 's1', resultSummary: { kind: 'web_search', title: '部分结果', count: 5, truncated: true } }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.hasExpandableDetails).toBe(true);
    expect(search.shouldShowDetailsByDefault).toBe(false);
    expect(search.details[0].truncated).toBe(true);
  });

  it('状态 class 使用语义色且覆盖所有 group 状态', () => {
    expect(getToolGroupStatusClass('success')).toContain('text-muted-foreground');
    expect(getToolGroupStatusClass('running')).toContain('text-info');
    expect(getToolGroupStatusClass('partial')).toContain('text-warn');
    expect(getToolGroupStatusClass('degraded')).toContain('text-warn');
    expect(getToolGroupStatusClass('failed')).toContain('text-danger');
    expect(getToolGroupStatusClass('interrupted')).toContain('text-muted-foreground');
  });
});
