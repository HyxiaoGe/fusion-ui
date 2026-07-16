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
      tc({ toolCallId: 's2', status: 'failed', resultSummary: undefined, error: 'reader-service 读取超时，已降级跳过' }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('partial');
    expect(search.summary).toBe('搜索 2 次 · 1 次未使用');
    expect(search.hasExpandableDetails).toBe(true);
    expect(search.shouldShowDetailsByDefault).toBe(true);
    expect(search.details[1].secondary).toBe('部分搜索结果未能使用');
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
      tc({ toolCallId: 's1', status: 'failed', resultSummary: undefined, error: 'web_search 已达到本轮联网预算' }),
      tc({ toolCallId: 's2', status: 'failed', resultSummary: undefined, error: 'TIMEOUT' }),
    ]);

    const search = findGroup(groups, 'web_search');
    expect(search.status).toBe('failed');
    expect(search.summary).toBe('搜索未取得可用结果 · 2 个查询');
    expect(search.shouldShowDetailsByDefault).toBe(true);
    expect(search.details.map(detail => detail.secondary)).toEqual([
      '部分搜索结果未能使用',
      '部分搜索结果未能使用',
    ]);
  });

  it('url_read 失败不透出 HTTP 状态等底层错误', () => {
    const groups = groupToolCalls([
      tc({
        toolCallId: 'u1',
        toolName: 'url_read',
        status: 'failed',
        arguments: { url: 'https://example.com/a' },
        resultSummary: undefined,
        error: 'HTTP 404',
      }),
    ]);

    const read = findGroup(groups, 'url_read');
    expect(read.details[0].secondary).toBe('网页暂时无法读取');
  });

  it('degraded 状态显示部分可用摘要', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'u1', toolName: 'url_read', status: 'degraded', arguments: { url: 'https://example.com/a' }, resultSummary: undefined }),
    ]);

    const read = findGroup(groups, 'url_read');
    expect(read.status).toBe('degraded');
    expect(read.summary).toBe('网页读取部分可用 · 已跳过部分页面');
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

  it('未知工具按 toolName 聚合，优先用结果标题且不显示内部 alias', () => {
    const groups = groupToolCalls([
      tc({ toolCallId: 'x1', toolName: 'mcp__learn__microsoft_docs_search', arguments: { query: 'Responses API' }, resultSummary: { kind: 'mcp', title: '找到 2 篇官方文档', truncated: false } }),
      tc({ toolCallId: 'x2', toolName: 'mcp__learn__microsoft_docs_search', arguments: { query: 'Agents SDK' }, resultSummary: { kind: 'mcp', title: '找到 3 篇官方文档', truncated: false } }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].toolName).toBe('mcp__learn__microsoft_docs_search');
    expect(groups[0].kind).toBe('other');
    expect(groups[0].summary).toBe('调用 2 个工具');
    expect(groups[0].details.map(detail => detail.primary)).toEqual([
      '找到 2 篇官方文档',
      '找到 3 篇官方文档',
    ]);
    expect(JSON.stringify(groups[0].details)).not.toContain('mcp__learn__microsoft_docs_search');
  });

  it('未知工具没有安全结果标题时使用外部工具兜底', () => {
    const groups = groupToolCalls([
      tc({
        toolCallId: 'x1',
        toolName: 'mcp__learn__microsoft_docs_search',
        arguments: { query: 'Responses API' },
        resultSummary: {
          kind: 'mcp',
          title: 'mcp__learn__microsoft_docs_search 已完成',
          truncated: false,
        },
      }),
    ]);

    expect(groups[0].details[0].primary).toBe('外部工具');
    expect(JSON.stringify(groups[0].details)).not.toContain('mcp__learn__microsoft_docs_search');
  });

  it('未知工具失败时不透出错误里的内部 alias', () => {
    const groups = groupToolCalls([
      tc({
        toolCallId: 'x1',
        toolName: 'mcp__learn__microsoft_docs_search',
        status: 'failed',
        arguments: { query: 'Responses API' },
        resultSummary: undefined,
        error: 'mcp__learn__microsoft_docs_search upstream unavailable',
      }),
    ]);

    expect(groups[0].details[0]).toMatchObject({
      primary: '外部工具',
      secondary: '部分工具结果未能使用',
    });
    expect(JSON.stringify(groups[0].details)).not.toContain('mcp__learn__microsoft_docs_search');
  });

  it.each(['failed', 'degraded'] as const)(
    'MCP %s 不透传固定错误、MCP 术语或原始错误',
    (status) => {
      const groups = groupToolCalls([
        tc({
          toolCallId: 'x1',
          toolName: 'mcp_3xYzSafeToken',
          status,
          arguments: { keywords: '民治 烤肉' },
          resultSummary: undefined,
          error: status === 'failed'
            ? 'MCP 工具暂时不可用'
            : '高德 MCP upstream degraded',
        }),
      ]);

      expect(groups[0].details[0]).toMatchObject({
        primary: '外部工具',
        secondary: '部分工具结果未能使用',
      });
      expect(JSON.stringify(groups[0].details)).not.toMatch(/MCP|mcp_|upstream|高德/i);
    },
  );

  it('稳定地点与路线工具分别分组并显示中文动作和目标', () => {
    const groups = groupToolCalls([
      tc({
        toolCallId: 'place-1',
        toolName: 'local_place_search',
        status: 'running',
        arguments: { query: '烤肉', location: '深圳民治' },
        resultSummary: undefined,
      }),
      tc({
        toolCallId: 'route-1',
        toolName: 'route_compare',
        status: 'running',
        arguments: { origin: '民治地铁站', destination: '星河 WORLD' },
        resultSummary: undefined,
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(findGroup(groups, 'local_place_search')).toMatchObject({
      label: '搜索附近地点',
      summary: '正在搜索附近地点 · 1 个任务',
    });
    expect(findGroup(groups, 'local_place_search').details[0].primary).toBe('深圳民治 · 烤肉');
    expect(findGroup(groups, 'route_compare')).toMatchObject({
      label: '比较路线',
      summary: '正在比较路线 · 1 个任务',
    });
    expect(findGroup(groups, 'route_compare').details[0].primary).toBe('民治地铁站 → 星河 WORLD');
  });

  it.each([
    ['local_place_search', 'failed', '高德 MCP upstream unavailable'],
    ['route_compare', 'degraded', '高德 route service quota exceeded'],
  ] as const)('稳定工具 %s 的 %s 错误不泄露上游信息', (toolName, status, error) => {
    const groups = groupToolCalls([
      tc({
        toolCallId: `${toolName}-1`,
        toolName,
        status,
        arguments: {},
        resultSummary: undefined,
        error,
      }),
    ]);

    expect(groups[0].details[0].secondary).toBe('部分工具结果未能使用');
    expect(JSON.stringify(groups)).not.toMatch(/MCP|mcp__|upstream|quota|高德/i);
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
