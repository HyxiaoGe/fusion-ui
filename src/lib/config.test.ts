import { afterEach, describe, expect, it, vi } from 'vitest';

describe('AUTH_SERVICE_CONFIG headless endpoint', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('显式配置时仅让 headless JSON API 使用独立地址', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_SERVICE_BASE_URL', 'https://auth-hosted.example.com');
    vi.stubEnv('NEXT_PUBLIC_AUTH_HEADLESS_SERVICE_BASE_URL', 'http://127.0.0.1:18100');
    vi.stubEnv('NEXT_PUBLIC_AUTH_ADMIN_SERVICE_BASE_URL', 'http://127.0.0.1:18100');

    const { AUTH_SERVICE_CONFIG } = await import('./config');

    expect(AUTH_SERVICE_CONFIG).toEqual({
      BASE_URL: 'https://auth-hosted.example.com',
      HEADLESS_BASE_URL: 'http://127.0.0.1:18100',
      ADMIN_BASE_URL: 'http://127.0.0.1:18100',
      CLIENT_ID: '',
      CALLBACK_URL: '',
    });
  });

  it('生产未配置独立地址时回退到现有 auth-service，不改变部署行为', async () => {
    vi.stubEnv('NEXT_PUBLIC_AUTH_SERVICE_BASE_URL', 'https://auth.example.com');
    vi.stubEnv('NEXT_PUBLIC_AUTH_HEADLESS_SERVICE_BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_AUTH_ADMIN_SERVICE_BASE_URL', '');

    const { AUTH_SERVICE_CONFIG } = await import('./config');

    expect(AUTH_SERVICE_CONFIG.HEADLESS_BASE_URL).toBe('https://auth.example.com');
    expect(AUTH_SERVICE_CONFIG.ADMIN_BASE_URL).toBe('https://auth.example.com');
  });
});
