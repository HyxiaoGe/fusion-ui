import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  forceRefreshAccessTokenMock,
  getStoredAccessTokenMock,
  fetchUserProfileAPIMock,
  clearFusionProfileStorageMock,
  clearRemoteSsoSessionMock,
} = vi.hoisted(() => ({
  forceRefreshAccessTokenMock: vi.fn(),
  getStoredAccessTokenMock: vi.fn<() => string | null>(() => null),
  fetchUserProfileAPIMock: vi.fn(),
  clearFusionProfileStorageMock: vi.fn(),
  clearRemoteSsoSessionMock: vi.fn(),
}));

vi.mock('@/lib/auth/authService', () => ({
  forceRefreshAccessToken: forceRefreshAccessTokenMock,
  getStoredAccessToken: getStoredAccessTokenMock,
  clearAuthStorage: vi.fn(),
  clearFusionProfileStorage: clearFusionProfileStorageMock,
  clearRemoteSsoSession: clearRemoteSsoSessionMock,
  completeSsoCallback: vi.fn(),
  getValidAccessToken: vi.fn(),
  probeSessionLiveness: vi.fn(),
  reconcileSsoSession: vi.fn(),
  resumeCentralSession: vi.fn(),
  revokeSsoSession: vi.fn(),
}));

vi.mock('@/lib/auth/sso-probe', () => ({
  isSafeReturnPath: vi.fn(() => true),
  markSsoProbed: vi.fn(),
  takeSsoReturnPath: vi.fn(() => null),
}));

vi.mock('../../lib/api/user', () => ({
  fetchUserProfileAPI: fetchUserProfileAPIMock,
  updateUserSettingsAPI: vi.fn(),
}));

import authReducer, { restoreLocalSession } from './authSlice';

const PROFILE = {
  id: 'user-restored',
  username: 'restored',
  email: 'restored@example.com',
  nickname: '恢复用户',
  avatar: null,
  mobile: null,
  system_prompt: '',
  is_superuser: false,
};

function tokenFor(subject: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    sub: subject,
    email: PROFILE.email,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.signature`;
}

describe('restoreLocalSession thunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getStoredAccessTokenMock.mockReturnValue('expired-token');
    fetchUserProfileAPIMock.mockResolvedValue(PROFILE);
  });

  it('force-refreshes the preserved SDK session and hydrates Redux', async () => {
    const refreshedToken = tokenFor(PROFILE.id);
    forceRefreshAccessTokenMock.mockResolvedValue(refreshedToken);
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(restoreLocalSession()).unwrap();

    expect(result).toBe('restored');
    expect(forceRefreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.sessionResolved).toBe(true);
    expect(store.getState().auth.token).toBe(refreshedToken);
    expect(fetchUserProfileAPIMock).toHaveBeenCalledTimes(1);
    expect(clearFusionProfileStorageMock).not.toHaveBeenCalled();
  });

  it('keeps the session unresolved on a transient refresh failure', async () => {
    forceRefreshAccessTokenMock.mockRejectedValue(new TypeError('network down'));
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(restoreLocalSession()).unwrap();

    expect(result).toBe('transient_failure');
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.sessionResolved).toBe(false);
    expect(clearFusionProfileStorageMock).not.toHaveBeenCalled();
    expect(clearRemoteSsoSessionMock).not.toHaveBeenCalled();
  });

  it('falls back to central SSO when the SDK quarantines an unknown refresh outcome', async () => {
    forceRefreshAccessTokenMock.mockRejectedValue(Object.assign(
      new Error('refresh outcome unknown'),
      { code: 'token_refresh_outcome_unknown', retryable: false },
    ));
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(restoreLocalSession({
      deferNoSessionResolution: true,
    })).unwrap();

    expect(result).toBe('central_recovery_required');
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.sessionResolved).toBe(false);
    expect(clearFusionProfileStorageMock).toHaveBeenCalledTimes(1);
    expect(clearRemoteSsoSessionMock).not.toHaveBeenCalled();
  });

  it('preserves the rotated refresh session when the refreshed access token is malformed', async () => {
    forceRefreshAccessTokenMock.mockResolvedValue('malformed-refreshed-token');
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(restoreLocalSession()).unwrap();

    expect(result).toBe('transient_failure');
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.sessionResolved).toBe(false);
    expect(clearFusionProfileStorageMock).not.toHaveBeenCalled();
    expect(clearRemoteSsoSessionMock).not.toHaveBeenCalled();
  });

  it('converges to logged-out only when the SDK definitively returns null', async () => {
    forceRefreshAccessTokenMock.mockResolvedValue(null);
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(restoreLocalSession()).unwrap();

    expect(result).toBe('no_session');
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.sessionResolved).toBe(true);
    expect(clearFusionProfileStorageMock).toHaveBeenCalledTimes(1);
  });

  it('defers the logged-out verdict while ClientLayout falls back to central SSO', async () => {
    forceRefreshAccessTokenMock.mockResolvedValue(null);
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(restoreLocalSession({
      deferNoSessionResolution: true,
    })).unwrap();

    expect(result).toBe('no_session');
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.sessionResolved).toBe(false);
    expect(clearFusionProfileStorageMock).toHaveBeenCalledTimes(1);
  });
});
