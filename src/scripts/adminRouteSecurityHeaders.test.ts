import { execFileSync } from 'node:child_process';
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
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("object-src 'none'");
    expect(headers['content-security-policy']).toContain("base-uri 'none'");
    expect(headers['content-security-policy']).toContain("form-action 'self'");
    expect(headers['content-security-policy']).toContain("connect-src 'self'");
    expect(headers['content-security-policy']).toContain("script-src 'self' 'unsafe-inline'");
    expect(headers['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(headers['x-frame-options']).toBe('DENY');
  });

  it('仅在 Next 开发服务器为热更新放行 unsafe-eval', () => {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        `process.env.NODE_ENV = 'development';
         const config = require('./next.config.js');
         config.headers().then(rules => {
           const rule = rules.find(item => item.source === '/admin/:path*');
           const csp = rule.headers.find(header => header.key === 'Content-Security-Policy').value;
           process.stdout.write(csp);
         });`,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(output).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  });

  it('禁止管理员页面及详情响应被浏览器或中间缓存保存', async () => {
    const rules = await nextConfig.headers();
    const adminRule = rules.find(rule => rule.source === '/admin/:path*');
    const headers = Object.fromEntries(
      adminRule?.headers.map(header => [header.key.toLowerCase(), header.value]) ?? [],
    );

    expect(headers['cache-control']).toBe('private, no-store');
    expect(headers.pragma).toBe('no-cache');
  });

  it('只在本地开发模式允许 Next 开发运行时求值，生产与测试保持严格 CSP', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      const developmentRules = await nextConfig.headers();
      const developmentCsp = developmentRules
        .find(rule => rule.source === '/admin/:path*')
        ?.headers.find(header => header.key === 'Content-Security-Policy')?.value;
      expect(developmentCsp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");

      process.env.NODE_ENV = 'production';
      const productionRules = await nextConfig.headers();
      const productionCsp = productionRules
        .find(rule => rule.source === '/admin/:path*')
        ?.headers.find(header => header.key === 'Content-Security-Policy')?.value;
      expect(productionCsp).toContain("script-src 'self' 'unsafe-inline'");
      expect(productionCsp).not.toContain("'unsafe-eval'");
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });

  it('不会把 X-Frame-Options 全局扩散到普通页面规则', async () => {
    const rules = await nextConfig.headers();
    const globalRule = rules.find(rule => rule.source === '/:path*');

    expect(globalRule?.headers.some(header => header.key === 'X-Frame-Options')).toBe(false);
  });

  it('仅把配置的 auth-service origin 加入 connect-src 与 form-action', async () => {
    const previous = process.env.NEXT_PUBLIC_AUTH_SERVICE_BASE_URL;
    try {
      delete process.env.NEXT_PUBLIC_AUTH_SERVICE_BASE_URL;
      const withoutAuth = await nextConfig.headers();
      const withoutAuthCsp = withoutAuth
        .find(rule => rule.source === '/admin/:path*')
        ?.headers.find(header => header.key === 'Content-Security-Policy')?.value;
      expect(withoutAuthCsp).toContain("connect-src 'self';");
      expect(withoutAuthCsp).toContain("form-action 'self';");

      process.env.NEXT_PUBLIC_AUTH_SERVICE_BASE_URL = 'https://auth.seanfield.org/oauth/path?ignored=1';
      const withAuth = await nextConfig.headers();
      const withAuthCsp = withAuth
        .find(rule => rule.source === '/admin/:path*')
        ?.headers.find(header => header.key === 'Content-Security-Policy')?.value;
      expect(withAuthCsp).toContain("connect-src 'self' https://auth.seanfield.org;");
      expect(withAuthCsp).toContain("form-action 'self' https://auth.seanfield.org;");
      expect(withAuthCsp).not.toContain('/oauth/path');
      expect(withAuthCsp).not.toContain("connect-src 'self' https:;");
      expect(withAuthCsp).not.toContain("form-action 'self' https:;");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_AUTH_SERVICE_BASE_URL;
      else process.env.NEXT_PUBLIC_AUTH_SERVICE_BASE_URL = previous;
    }
  });
});
