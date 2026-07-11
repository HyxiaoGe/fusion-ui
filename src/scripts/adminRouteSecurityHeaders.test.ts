import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const nextConfig = require('../../next.config.js') as {
  headers: () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>;
};

describe('/admin 防点击劫持响应头', () => {
  it('仅对管理员路由覆盖完整 CSP 并禁止任何 frame 嵌入', async () => {
    const rules = await nextConfig.headers();
    const adminRule = rules.find(rule => rule.source === '/admin/:path*');
    const headers = Object.fromEntries(
      adminRule?.headers.map(header => [header.key.toLowerCase(), header.value]) ?? [],
    );

    expect(adminRule).toBeDefined();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['content-security-policy']).toContain('default-src');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  it('不会把 X-Frame-Options 全局扩散到普通页面规则', async () => {
    const rules = await nextConfig.headers();
    const globalRule = rules.find(rule => rule.source === '/:path*');

    expect(globalRule?.headers.some(header => header.key === 'X-Frame-Options')).toBe(false);
  });
});
