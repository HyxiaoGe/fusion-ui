import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  resumeCentralSessionMock,
  getStoredAccessTokenMock,
  fetchUserProfileAPIMock,
} = vi.hoisted(() => ({
  resumeCentralSessionMock: vi.fn(),
  getStoredAccessTokenMock: vi.fn<() => string | null>(() => null),
  fetchUserProfileAPIMock: vi.fn(),
}));

vi.mock('@/lib/auth/authService', () => ({
  resumeCentralSession: resumeCentralSessionMock,
  getStoredAccessToken: getStoredAccessTokenMock,
  clearAuthStorage: vi.fn(),
  clearFusionProfileStorage: vi.fn(),
  completeSsoCallback: vi.fn(),
  getValidAccessToken: vi.fn(),
  probeSessionLiveness: vi.fn(),
  reconcileSsoSession: vi.fn(),
  revokeSsoSession: vi.fn(),
  clearRemoteSsoSession: vi.fn(),
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

import authReducer, { resumeSsoSession } from './authSlice';

const PROFILE = {
  id: 'user-resumed',
  username: 'resumed',
  email: 'resumed@example.com',
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

describe('resumeSsoSession thunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    fetchUserProfileAPIMock.mockResolvedValue(PROFILE);
  });

  it('adopts the SDK atomically committed token and enters authenticated state', async () => {
    const token = tokenFor(PROFILE.id);
    resumeCentralSessionMock.mockImplementation(async (options) => {
      await options?.beforeCommit?.({ user: PROFILE });
      return { status: 'resumed', user: PROFILE };
    });
    getStoredAccessTokenMock.mockReturnValue(token);
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(resumeSsoSession()).unwrap();

    expect(result).toBe('resumed');
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user?.id).toBe(PROFILE.id);
    expect(store.getState().auth.token).toBe(token);
    expect(store.getState().auth.accountSwitchStatus).toBe('stable');
  });

  it('leaves the host unauthenticated when the central session is absent', async () => {
    resumeCentralSessionMock.mockResolvedValue({ status: 'no_session' });
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(resumeSsoSession()).unwrap();

    expect(result).toBe('no_session');
    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.token).toBeNull();
  });

  it('adopts a sibling-tab local_session through the same cache-clearing boundary', async () => {
    const token = tokenFor(PROFILE.id);
    resumeCentralSessionMock.mockResolvedValue({ status: 'local_session' });
    getStoredAccessTokenMock.mockReturnValue(token);
    const store = configureStore({ reducer: { auth: authReducer } });

    const result = await store.dispatch(resumeSsoSession()).unwrap();

    expect(result).toBe('local_session');
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(store.getState().auth.user?.id).toBe(PROFILE.id);
    expect(store.getState().auth.accountSwitchStatus).toBe('stable');
  });
});
