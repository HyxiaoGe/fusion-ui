import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const {
  completeSsoCallbackMock,
  revokeSsoSessionMock,
  getStoredAccessTokenMock,
  clearAuthStorageMock,
  takeSsoReturnPathMock,
  markSsoProbedMock,
  isSafeReturnPathMock,
  fetchUserProfileAPIMock,
  updateUserSettingsAPIMock,
  jwtDecodeMock,
} = vi.hoisted(() => ({
  completeSsoCallbackMock: vi.fn(),
  revokeSsoSessionMock: vi.fn(async () => undefined),
  getStoredAccessTokenMock: vi.fn(),
  clearAuthStorageMock: vi.fn(),
  takeSsoReturnPathMock: vi.fn((): string | null => null),
  markSsoProbedMock: vi.fn(),
  isSafeReturnPathMock: vi.fn(() => true),
  fetchUserProfileAPIMock: vi.fn(),
  updateUserSettingsAPIMock: vi.fn(),
  jwtDecodeMock: vi.fn(),
}));

vi.mock('@/lib/auth/authService', () => ({
  completeSsoCallback: completeSsoCallbackMock,
  revokeSsoSession: revokeSsoSessionMock,
  getStoredAccessToken: getStoredAccessTokenMock,
  clearAuthStorage: clearAuthStorageMock,
}));

vi.mock('@/lib/auth/sso-probe', () => ({
  takeSsoReturnPath: takeSsoReturnPathMock,
  markSsoProbed: markSsoProbedMock,
  isSafeReturnPath: isSafeReturnPathMock,
}));

vi.mock('../../lib/api/user', () => ({
  fetchUserProfileAPI: fetchUserProfileAPIMock,
  updateUserSettingsAPI: updateUserSettingsAPIMock,
}));

vi.mock('jwt-decode', () => ({ jwtDecode: jwtDecodeMock }));

import authReducer, { completeLogin, logoutWithSso } from './authSlice';

const makeStore = () => configureStore({ reducer: { auth: authReducer } });

describe('completeLogin thunk (SDK callback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // clearAllMocks wipes call history but NOT mockReturnValue impls; reset the probe path
    // to "no silent return" so each test starts clean (interactive-login default).
    takeSsoReturnPathMock.mockReturnValue(null);
    isSafeReturnPathMock.mockReturnValue(true);
  });

  it('on an authenticated callback sets the token, fetches the fusion profile, and returns the SDK redirect path', async () => {
    completeSsoCallbackMock.mockResolvedValue({
      status: 'authenticated',
      user: { id: 'u1' },
      redirectPath: '/chat/9',
    });
    getStoredAccessTokenMock.mockReturnValue('access-jwt');
    jwtDecodeMock.mockReturnValue({
      sub: 'u1',
      email: 'a@b.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    fetchUserProfileAPIMock.mockResolvedValue({
      id: 'u1',
      username: 'a',
      email: 'a@b.com',
      nickname: 'Nick',
      avatar: null,
      mobile: null,
      system_prompt: '',
      is_superuser: false,
    });

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(completeLogin.fulfilled.match(action)).toBe(true);
    expect(action.payload).toEqual({ redirectPath: '/chat/9' });
    expect(fetchUserProfileAPIMock).toHaveBeenCalledTimes(1);
    const state = store.getState().auth;
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.nickname).toBe('Nick');
  });

  it('soft-lands at "/" without fetching a profile when the callback is not authenticated (login_required)', async () => {
    completeSsoCallbackMock.mockResolvedValue({ status: 'unauthenticated', error: 'login_required' });

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(completeLogin.fulfilled.match(action)).toBe(true);
    expect(action.payload).toEqual({ redirectPath: '/' });
    expect(fetchUserProfileAPIMock).not.toHaveBeenCalled();
  });

  it('returns to the captured origin path on a silent-probe HIT (overrides the SDK redirect path)', async () => {
    // This callback originated from a load-time silent probe: the probe stored the user's
    // original path; on success we return there, not the SDK's default redirect.
    takeSsoReturnPathMock.mockReturnValue('/settings');
    completeSsoCallbackMock.mockResolvedValue({
      status: 'authenticated',
      user: { id: 'u1' },
      redirectPath: '/',
    });
    getStoredAccessTokenMock.mockReturnValue('access-jwt');
    jwtDecodeMock.mockReturnValue({
      sub: 'u1',
      email: 'a@b.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    fetchUserProfileAPIMock.mockResolvedValue({
      id: 'u1',
      username: 'a',
      email: 'a@b.com',
      nickname: 'Nick',
      avatar: null,
      mobile: null,
      system_prompt: '',
      is_superuser: false,
    });

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(completeLogin.fulfilled.match(action)).toBe(true);
    expect(action.payload).toEqual({ redirectPath: '/settings' });
    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('soft-lands back at the captured origin path on a silent-probe MISS (login_required)', async () => {
    // The probe found no IdP session; we must return the user to where they were, not "/".
    takeSsoReturnPathMock.mockReturnValue('/chat/7');
    completeSsoCallbackMock.mockResolvedValue({ status: 'unauthenticated', error: 'login_required' });

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(completeLogin.fulfilled.match(action)).toBe(true);
    expect(action.payload).toEqual({ redirectPath: '/chat/7' });
    expect(fetchUserProfileAPIMock).not.toHaveBeenCalled();
  });

  it('soft-lands to the captured path for ANY non-authenticated status, not only login_required (fusion is a soft gate)', async () => {
    // Fusion deliberately diverges from audio (which gates non-login_required to /login): with no
    // /login route, every non-authenticated result soft-lands back to the origin path.
    takeSsoReturnPathMock.mockReturnValue('/chat/7');
    completeSsoCallbackMock.mockResolvedValue({ status: 'unauthenticated', error: 'access_denied' });

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(action.payload).toEqual({ redirectPath: '/chat/7' });
  });

  it('drops an unsafe off-origin silent return path and falls back to the SDK redirect (open-redirect guard)', async () => {
    // Even if a protocol-relative path reaches the return slot, completeLogin must not echo it as
    // a redirect target (defense-in-depth at the router.replace sink).
    takeSsoReturnPathMock.mockReturnValue('//evil.com/x');
    isSafeReturnPathMock.mockReturnValue(false);
    completeSsoCallbackMock.mockResolvedValue({
      status: 'authenticated',
      user: { id: 'u1' },
      redirectPath: '/chat/9',
    });
    getStoredAccessTokenMock.mockReturnValue('access-jwt');
    jwtDecodeMock.mockReturnValue({
      sub: 'u1',
      email: 'a@b.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    fetchUserProfileAPIMock.mockResolvedValue({
      id: 'u1',
      username: 'a',
      email: 'a@b.com',
      nickname: 'Nick',
      avatar: null,
      mobile: null,
      system_prompt: '',
      is_superuser: false,
    });

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(action.payload).toEqual({ redirectPath: '/chat/9' });
  });

  it('rejects when the SDK callback throws and no token was persisted (CSRF/state mismatch or token-exchange failure)', async () => {
    completeSsoCallbackMock.mockRejectedValue(new Error('state mismatch'));
    getStoredAccessTokenMock.mockReturnValue(null);

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(completeLogin.rejected.match(action)).toBe(true);
  });

  it('recovers a successful login when the SDK callback throws AFTER tokens were persisted (transient /userinfo blip)', async () => {
    // handleCallback persists tokens, THEN fetches auth-service /userinfo (which fusion does not use);
    // a transient /userinfo failure throws — but the exchange succeeded and a valid token is in storage.
    completeSsoCallbackMock.mockRejectedValue(new Error('userinfo failed (502)'));
    getStoredAccessTokenMock.mockReturnValue('access-jwt');
    jwtDecodeMock.mockReturnValue({
      sub: 'u1',
      email: 'a@b.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    fetchUserProfileAPIMock.mockResolvedValue({
      id: 'u1',
      username: 'a',
      email: 'a@b.com',
      nickname: 'Nick',
      avatar: null,
      mobile: null,
      system_prompt: '',
      is_superuser: false,
    });

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(completeLogin.fulfilled.match(action)).toBe(true);
    expect(action.payload).toEqual({ redirectPath: '/' });
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user?.nickname).toBe('Nick');
    expect(fetchUserProfileAPIMock).toHaveBeenCalledTimes(1);
  });
});

describe('logoutWithSso thunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('best-effort revokes the SSO session then resets local auth state', async () => {
    const store = makeStore();

    await store.dispatch(logoutWithSso());

    expect(revokeSsoSessionMock).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.token).toBeNull();
  });

  it('marks the SSO probe guard so logout is not silently undone by a load-time re-probe', async () => {
    const store = makeStore();

    await store.dispatch(logoutWithSso());

    expect(markSsoProbedMock).toHaveBeenCalledTimes(1);
  });

  it('still resets local auth state even if the revoke call rejects', async () => {
    revokeSsoSessionMock.mockRejectedValue(new Error('network down'));
    const store = makeStore();

    await store.dispatch(logoutWithSso());

    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it('still marks the SSO probe guard even when revoke REJECTS (guard must survive revoke failure)', async () => {
    // The whole point of markSsoProbed-before-revoke: a thrown revoke must not leave the guard
    // unset, else the next load silently SSO-re-logs-in the user who just logged out.
    revokeSsoSessionMock.mockRejectedValue(new Error('network down'));
    const store = makeStore();

    await store.dispatch(logoutWithSso());

    expect(markSsoProbedMock).toHaveBeenCalledTimes(1);
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
