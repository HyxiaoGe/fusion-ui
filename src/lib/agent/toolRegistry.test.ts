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

  it('getToolMeta 未知工具返回兜底元数据', () => {
    const meta = getToolMeta('mcp__learn__microsoft_docs_search');
    expect(meta.label).toBe('外部工具');
    expect(meta.label).not.toContain('mcp__');
    expect(meta.color).toBe('neutral');
    expect(meta.summarize({})).toBe('');
  });
});
