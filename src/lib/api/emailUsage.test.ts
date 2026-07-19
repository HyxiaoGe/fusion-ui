import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithAuthMock, authConfigMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  authConfigMock: {
    BASE_URL: 'https://auth.dev.example',
    HEADLESS_BASE_URL: 'http://localhost:8101',
    ADMIN_BASE_URL: 'http://localhost:8101',
  },
}));

vi.mock('./fetchWithAuth', () => ({
  default: fetchWithAuthMock,
}));

vi.mock('../config', () => ({
  AUTH_SERVICE_CONFIG: authConfigMock,
}));

import { fetchEmailUsageAPI } from './emailUsage';

describe('fetchEmailUsageAPI', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    authConfigMock.BASE_URL = 'https://auth.dev.example';
  });

  it('通过可独立联调的 headless auth-service 请求并直接返回原生 JSON', async () => {
    const payload = {
      provider: 'resend',
      configured: true,
      available: true,
      used_emails: 123,
      monthly_quota: 3000,
      remaining_emails: 2877,
      usage_ratio: 0.041,
      daily_used_emails: 7,
      daily_quota: 100,
      period_start: '2026-07-01T00:00:00Z',
      period_end: '2026-08-01T00:00:00Z',
      synced_at: '2026-07-19T02:03:04Z',
      source: 'resend_response_headers',
    };
    fetchWithAuthMock.mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchEmailUsageAPI()).resolves.toEqual(payload);
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      'http://localhost:8101/admin/email-usage',
      { method: 'GET' },
    );
  });

  it('将 auth-service 原生错误 detail 转换为可读异常', async () => {
    fetchWithAuthMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: '只有管理员可以查看邮件用量' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchEmailUsageAPI()).rejects.toThrow('只有管理员可以查看邮件用量');
  });

  it('拒绝伪装成成功的畸形用量契约', async () => {
    fetchWithAuthMock.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchEmailUsageAPI()).rejects.toThrow('邮件用量接口返回了无效数据');
  });

  it('拒绝在未配置状态中夹带已用额度的矛盾数据', async () => {
    fetchWithAuthMock.mockResolvedValue(
      new Response(JSON.stringify({
        provider: 'resend',
        configured: false,
        available: false,
        used_emails: 123,
        monthly_quota: 3000,
        remaining_emails: null,
        usage_ratio: null,
        daily_used_emails: null,
        daily_quota: 100,
        period_start: '2026-07-01T00:00:00Z',
        period_end: '2026-07-31T23:59:59.999999Z',
        synced_at: null,
        source: 'not_configured',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchEmailUsageAPI()).rejects.toThrow('邮件用量接口返回了无效数据');
  });
});
