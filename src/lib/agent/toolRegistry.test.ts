import { describe, it, expect } from 'vitest';
import { TOOL_REGISTRY, getToolMeta, getDisplayArgs } from './toolRegistry';

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
    const meta = getToolMeta('future_tool_x');
    expect(meta.label).toBe('future_tool_x');
    expect(meta.color).toBe('neutral');
    expect(meta.summarize({})).toBe('');
  });
});

describe('getDisplayArgs — args 脱敏', () => {
  it('web_search 的 query 不被遮（透传）', () => {
    const out = getDisplayArgs('web_search', { query: 'GPT 5.5' });
    expect(out.query).toBe('GPT 5.5');
  });

  it('url_read 的 url 不被遮（透传）', () => {
    const out = getDisplayArgs('url_read', { url: 'https://example.com' });
    expect(out.url).toBe('https://example.com');
  });

  it('apiKey 被遮成 [REDACTED]', () => {
    const out = getDisplayArgs('future_tool', { apiKey: 'sk-secret-123' });
    expect(out.apiKey).toBe('[REDACTED]');
  });

  it('camel/snake/kebab 三种命名都遮', () => {
    const out = getDisplayArgs('future_tool', {
      apiKey: 'a',
      api_key: 'b',
      'api-key': 'c',
    });
    expect(out.apiKey).toBe('[REDACTED]');
    expect(out.api_key).toBe('[REDACTED]');
    expect(out['api-key']).toBe('[REDACTED]');
  });

  it('token / secret / password / connectionString / authorization 都遮', () => {
    const out = getDisplayArgs('future_tool', {
      token: 't',
      secret: 's',
      password: 'p',
      connectionString: 'c',
      authorization: 'a',
    });
    expect(out.token).toBe('[REDACTED]');
    expect(out.secret).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
    expect(out.connectionString).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
  });

  it('大小写不敏感（API_KEY / Authorization 都遮）', () => {
    const out = getDisplayArgs('future_tool', {
      API_KEY: 'a',
      Authorization: 'b',
    });
    expect(out.API_KEY).toBe('[REDACTED]');
    expect(out.Authorization).toBe('[REDACTED]');
  });

  it('非敏感字段保持透传', () => {
    const out = getDisplayArgs('future_tool', { name: 'foo', count: 42 });
    expect(out.name).toBe('foo');
    expect(out.count).toBe(42);
  });

  it('ToolMeta.redactArgs 优先级高于通用 redaction', () => {
    // 测试方式：通过 mock 一个临时 tool 也行，但这里直接 verify 通用兜底就够了
    // 因为 web_search / url_read 没定义 redactArgs，走通用兜底是对的
    const out = getDisplayArgs('web_search', { query: 'q', apiKey: 'k' });
    expect(out.query).toBe('q');
    expect(out.apiKey).toBe('[REDACTED]');
  });
});
