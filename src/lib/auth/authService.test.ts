import { beforeEach, describe, expect, it, vi } from 'vitest';

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
}));

import {
  clearAuthStorage,
  completeSsoCallback,
  forceRefreshAccessToken,
  getStoredAccessToken,
  getStoredRefreshToken,
  getValidAccessToken,
  revokeSsoSession,
  startSsoLogin,
} from './authService';

describe('authService SDK adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('startSsoLogin configures the SDK then delegates with provider + redirect path', async () => {
    await startSsoLogin('github', '/chat/abc');

    expect(configureAuthMock).toHaveBeenCalledTimes(1);
    expect(loginMock).toHaveBeenCalledWith('github', { redirectPath: '/chat/abc' });
  });

  it('startSsoLogin omits redirectPath option when none is given', async () => {
    await startSsoLogin('google');

    expect(loginMock).toHaveBeenCalledWith('google', undefined);
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
