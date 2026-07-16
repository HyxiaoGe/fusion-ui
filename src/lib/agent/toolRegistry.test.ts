import { describe, it, expect } from 'vitest';
import { TOOL_REGISTRY, getToolMeta } from './toolRegistry';

describe('toolRegistry', () => {
  it('包含 web_search 的元数据', () => {
    expect(TOOL_REGISTRY.web_search).toBeDefined();
    expect(TOOL_REGISTRY.web_search.label).toBe('搜索');
  });

  it('包含 url_read 的元数据', () => {
    expect(TOOL_REGISTRY.url_read).toBeDefined();
    expect(TOOL_REGISTRY.url_read.label).toBe('读取');
  });

  it('summarize web_search 提取 query', () => {
    const summary = TOOL_REGISTRY.web_search.summarize({ query: 'GPT 5.5 评测' });
    expect(summary).toBe('GPT 5.5 评测');
  });

  it('summarize url_read 提取 url', () => {
    const summary = TOOL_REGISTRY.url_read.summarize({ url: 'https://example.com' });
    expect(summary).toBe('https://example.com');
  });

  it('包含地点搜索与路线比较的稳定产品工具元数据', () => {
    expect(TOOL_REGISTRY.local_place_search).toMatchObject({
      label: '搜索附近地点',
      color: 'teal',
    });
    expect(TOOL_REGISTRY.route_compare).toMatchObject({
      label: '比较路线',
      color: 'info',
    });

    expect(TOOL_REGISTRY.local_place_search.summarize({
      query: '烤肉',
      location: '深圳民治',
    })).toBe('深圳民治 · 烤肉');
    expect(TOOL_REGISTRY.route_compare.summarize({
      origin: '民治地铁站',
      destination: '星河 WORLD',
    })).toBe('民治地铁站 → 星河 WORLD');
  });

  it('getToolMeta 未知工具返回兜底元数据', () => {
    const meta = getToolMeta('mcp__learn__microsoft_docs_search');
    expect(meta.label).toBe('外部工具');
    expect(meta.label).not.toContain('mcp__');
    expect(meta.color).toBe('neutral');
    expect(meta.summarize({})).toBe('');
  });
});
