import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  configureAuthMock,
  isAuthConfiguredMock,
  clearSsoReturnMock,
  loginMock,
  handleCallbackMock,
  getAccessTokenMock,
  refreshMock,
  logoutMock,
} = vi.hoisted(() => ({
  configureAuthMock: vi.fn(),
  isAuthConfiguredMock: vi.fn(() => true),
  clearSsoReturnMock: vi.fn(),
  loginMock: vi.fn(async () => undefined),
  handleCallbackMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
  refreshMock: vi.fn(),
  logoutMock: vi.fn(async () => undefined),
}));

vi.mock('./auth-sdk', () => ({
  configureAuth: configureAuthMock,
  isAuthConfigured: isAuthConfiguredMock,
}));

vi.mock('./sso-probe', () => ({
  clearSsoReturn: clearSsoReturnMock,
}));

vi.mock('auth-client-web', () => ({
  login: loginMock,
  handleCallback: handleCallbackMock,
  getAccessToken: getAccessTokenMock,
  refresh: refreshMock,
  logout: logoutMock,
  tokenStore: () => ({
    getAccessToken: () => localStorage.getItem('auth_token'),
    getRefreshToken: () => localStorage.getItem('auth_refresh_token'),
    clear: () => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_refresh_token');
      localStorage.removeItem('auth_token_expiry');
      localStorage.removeItem('auth_user_info');
    },
  }),
}));

vi.mock('../config', () => ({
  API_CONFIG: { BASE_URL: '' },
  AUTH_SERVICE_CONFIG: {
    BASE_URL: 'https://auth.example.com/',
    HEADLESS_BASE_URL: 'http://127.0.0.1:18100/',
    CLIENT_ID: 'fusion-app',
  },
  getAuthCallbackUrl: () => 'http://localhost:3000/auth/callback',
}));

import {
  clearAuthStorage,
  completeSsoCallback,
  forceRefreshAccessToken,
  getEmailLoginCapabilities,
  getStoredAccessToken,
  getStoredRefreshToken,
  getValidAccessToken,
  isEmailHeadlessRuntime,
  probeSessionLiveness,
  revokeSsoSession,
  startSsoLogin,
} from './authService';

describe('authService SDK adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('以 no-store GET 探测 headless 邮箱登录能力', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ email_login: true, email_headless_login: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getEmailLoginCapabilities()).resolves.toEqual({ headless: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:18100/auth/capabilities?client_id=fusion-app&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback',
      {
      method: 'GET',
      cache: 'no-store',
      },
    );
  });

  it('旧版响应只有 email_login 时隐藏邮箱入口', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ email_login: true }),
    })));

    await expect(getEmailLoginCapabilities()).resolves.toEqual({ headless: false });
  });

  it.each([
    ['email_login=false', { email_login: false, email_headless_login: true }],
    ['缺少 email_login', { email_headless_login: true }],
  ] as const)('%s 时只要 headless 明确开启就开放弹窗邮箱登录', async (_case, capabilities) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => capabilities })));

    await expect(getEmailLoginCapabilities()).resolves.toEqual({ headless: true });
  });

  it('headless 仅允许 http/https Web runtime', () => {
    expect(isEmailHeadlessRuntime('http:')).toBe(true);
    expect(isEmailHeadlessRuntime('https:')).toBe(true);
    expect(isEmailHeadlessRuntime('file:')).toBe(false);
    expect(isEmailHeadlessRuntime('app:')).toBe(false);
  });

  it.each([
    ['能力关闭', { ok: true, json: async () => ({ email_headless_login: false }) }],
    ['旧后端 404', { ok: false, status: 404, json: async () => ({ email_headless_login: true }) }],
    ['响应格式错误', { ok: true, json: async () => ({ email_headless_login: 'true' }) }],
  ] as const)('getEmailLoginCapabilities 遇到%s时 fail closed', async (_case, response) => {
    vi.stubGlobal('fetch', vi.fn(async () => response));

    await expect(getEmailLoginCapabilities()).resolves.toEqual({ headless: false });
  });

  it('getEmailLoginCapabilities 遇到网络失败时 fail closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(getEmailLoginCapabilities()).resolves.toEqual({ headless: false });
  });

  it('startSsoLogin configures the SDK then delegates with provider + redirect path', async () => {
    await startSsoLogin('github', '/chat/abc');

    expect(configureAuthMock).toHaveBeenCalledTimes(1);
    expect(loginMock).toHaveBeenCalledWith('github', { redirectPath: '/chat/abc' });
    expect(loginMock.mock.calls.map(([provider]) => provider)).not.toContain('email');
  });

  it('startSsoLogin omits redirectPath option when none is given', async () => {
    await startSsoLogin('google');

    expect(loginMock).toHaveBeenCalledWith('google', undefined);
    expect(loginMock.mock.calls.map(([provider]) => provider)).not.toContain('email');
  });

  it('startSsoLogin clears any stale silent-probe return path before redirecting (no hijacked redirect)', async () => {
    await startSsoLogin('github', '/chat/abc');

    expect(clearSsoReturnMock).toHaveBeenCalledTimes(1);
  });

  it('completeSsoCallback configures then returns the SDK callback result', async () => {
    handleCallbackMock.mockResolvedValue({ status: 'authenticated', user: { id: 'u1' }, redirectPath: '/' });

    const result = await completeSsoCallback();

    expect(configureAuthMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'authenticated', user: { id: 'u1' }, redirectPath: '/' });
  });

  it('getValidAccessToken delegates to the SDK token accessor', async () => {
    getAccessTokenMock.mockResolvedValue('fresh-token');

    await expect(getValidAccessToken()).resolves.toBe('fresh-token');
    expect(configureAuthMock).toHaveBeenCalledTimes(1);
  });

  it('forceRefreshAccessToken delegates to the SDK refresh', async () => {
    refreshMock.mockResolvedValue('rotated-token');

    await expect(forceRefreshAccessToken()).resolves.toBe('rotated-token');
  });

  it('revokeSsoSession performs a best-effort GLOBAL SDK logout (Single Logout, not just this app)', async () => {
    await revokeSsoSession();

    expect(configureAuthMock).toHaveBeenCalledTimes(1);
    // { global: true } drives the SDK's top-level POST-form to /auth/logout, destroying the
    // shared IdP session so logging out of fusion logs the user out of every SSO app
    // (「一处登出、处处登出」). A bare logout() would only revoke this app's token.
    expect(logoutMock).toHaveBeenCalledWith({ global: true });
  });

  it('probeSessionLiveness GETs the denylist-protected /api/auth/me with the bearer token and resolves on 2xx', async () => {
    // 同源相对路径（API_CONFIG.BASE_URL=''），绕开 fetchWithAuth 的 401-force-refresh：只读、不轮换。
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeSessionLiveness('tok-123')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', {
      headers: { Authorization: 'Bearer tok-123' },
    });

    vi.unstubAllGlobals();
  });

  it('probeSessionLiveness throws with the HTTP status in the message on 401 (logged out elsewhere)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })));

    await expect(probeSessionLiveness('tok')).rejects.toThrow(/401/);

    vi.unstubAllGlobals();
  });

  it('probeSessionLiveness throws with 403 in the message (isAuthRejection treats it as logged-out)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })));

    await expect(probeSessionLiveness('tok')).rejects.toThrow(/403/);

    vi.unstubAllGlobals();
  });

  it('probeSessionLiveness throws with 5xx in the message (isAuthRejection keeps the session — transient)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })));

    await expect(probeSessionLiveness('tok')).rejects.toThrow(/502/);

    vi.unstubAllGlobals();
  });

  it('probeSessionLiveness propagates a network error (caller treats it as transient → keep session)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(probeSessionLiveness('tok')).rejects.toThrow('Failed to fetch');

    vi.unstubAllGlobals();
  });

  it('storage helpers read fusion keys and clearAuthStorage wipes every auth key', () => {
    localStorage.setItem('auth_token', 'a');
    localStorage.setItem('auth_refresh_token', 'r');
    localStorage.setItem('auth_token_expiry', '123');
    localStorage.setItem('auth_user_info', '{}');
    localStorage.setItem('user_profile', '{}');
    localStorage.setItem('user_profile_timestamp', '123');

    expect(getStoredAccessToken()).toBe('a');
    expect(getStoredRefreshToken()).toBe('r');

    clearAuthStorage();

    for (const key of [
      'auth_token',
      'auth_refresh_token',
      'auth_token_expiry',
      'auth_user_info',
      'user_profile',
      'user_profile_timestamp',
    ]) {
      expect(localStorage.getItem(key)).toBeNull();
    }
  });
});
