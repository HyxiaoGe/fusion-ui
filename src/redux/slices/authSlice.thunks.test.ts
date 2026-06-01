import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

const {
  completeSsoCallbackMock,
  revokeSsoSessionMock,
  getStoredAccessTokenMock,
  clearAuthStorageMock,
  fetchUserProfileAPIMock,
  updateUserSettingsAPIMock,
  jwtDecodeMock,
} = vi.hoisted(() => ({
  completeSsoCallbackMock: vi.fn(),
  revokeSsoSessionMock: vi.fn(async () => undefined),
  getStoredAccessTokenMock: vi.fn(),
  clearAuthStorageMock: vi.fn(),
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

  it('still resets local auth state even if the revoke call rejects', async () => {
    revokeSsoSessionMock.mockRejectedValue(new Error('network down'));
    const store = makeStore();

    await store.dispatch(logoutWithSso());

    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
