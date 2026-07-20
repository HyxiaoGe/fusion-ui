import { beforeEach, describe, expect, it, vi } from 'vitest';

const { jwtDecodeMock } = vi.hoisted(() => ({
  jwtDecodeMock: vi.fn(),
}));

vi.mock('jwt-decode', () => ({
  jwtDecode: jwtDecodeMock,
}));

import { accountSessionSwitchStarted } from '@/redux/actions/authSessionActions';
import authReducer, { checkUserState, logout, resolveSession, setToken } from './authSlice';

describe('authSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    jwtDecodeMock.mockReset();
  });

  it('accepts a valid token and persists it', () => {
    jwtDecodeMock.mockReturnValue({
      sub: 'user-1',
      email: 'fusion-user@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const state = authReducer(undefined, setToken('valid-token'));

    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('valid-token');
    expect(state.user).toEqual({
      id: 'user-1',
      username: 'fusion-user',
      avatar: null,
      email: 'fusion-user@example.com',
      nickname: null,
      mobile: null,
      is_superuser: false,
      system_prompt: '',
    });
    expect(localStorage.getItem('auth_token')).toBe('valid-token');
  });

  it('rejects an expired token and clears local auth state', () => {
    localStorage.setItem('auth_token', 'expired-token');
    localStorage.setItem('user_profile', '{"id":"user-1"}');
    localStorage.setItem('user_profile_timestamp', '123');
    jwtDecodeMock.mockReturnValue({
      sub: 'user-1',
      email: 'fusion-user@example.com',
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    const state = authReducer(undefined, setToken('expired-token'));

    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('user_profile_timestamp')).toBeNull();
  });

  it('marks authenticated state as stale when cached profile is older than one day', () => {
    localStorage.setItem(
      'user_profile_timestamp',
      String(Date.now() - (25 * 60 * 60 * 1000))
    );

    const state = authReducer(
      {
        isAuthenticated: true,
        user: {
          id: 'user-1',
          username: 'fusion-user',
          avatar: null,
          email: null,
          nickname: null,
          mobile: null,
        },
        token: 'token-123',
        status: 'succeeded',
        error: null,
        sessionResolved: true,
        accountSwitchStatus: 'stable',
        accountSwitchError: null,
        switchedAccountEmail: null,
      },
      checkUserState()
    );

    expect(state.status).toBe('idle');
  });

  it('logout clears local storage and resets state', () => {
    localStorage.setItem('auth_token', 'token-123');
    localStorage.setItem('user_profile', '{"id":"user-1"}');
    localStorage.setItem('user_profile_timestamp', '123');

    const state = authReducer(
      {
        isAuthenticated: true,
        user: {
          id: 'user-1',
          username: 'fusion-user',
          avatar: null,
          email: null,
          nickname: null,
          mobile: null,
        },
        token: 'token-123',
        status: 'succeeded',
        error: null,
        sessionResolved: true,
        accountSwitchStatus: 'stable',
        accountSwitchError: null,
        switchedAccountEmail: null,
      },
      logout()
    );

    expect(state).toEqual({
      isAuthenticated: false,
      user: null,
      token: null,
      status: 'idle',
      error: null,
      sessionResolved: true,
      accountSwitchStatus: 'stable',
      accountSwitchError: null,
      switchedAccountEmail: null,
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('user_profile_timestamp')).toBeNull();
  });

  // 会话定论标记：未登录态下，只有「已定论登出」才允许头像菜单露出「登录」按钮；
  // 加载时静默 SSO 恢复在途期间保持未定论 → 头像菜单显示中性占位，杜绝登录按钮闪烁。
  it('resolveSession marks the session as definitively resolved', () => {
    const state = authReducer(undefined, resolveSession());
    expect(state.sessionResolved).toBe(true);
  });

  it('setToken resolves the session (a definitive auth verdict)', () => {
    jwtDecodeMock.mockReturnValue({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const state = authReducer(undefined, setToken('valid-token'));
    expect(state.sessionResolved).toBe(true);
  });

  it('switch barrier clears the previous account rich profile before the new token is adopted', () => {
    localStorage.setItem('user_profile', JSON.stringify({ id: 'user-a', nickname: 'A' }));
    localStorage.setItem('user_profile_timestamp', '123');

    const state = authReducer(undefined, accountSessionSwitchStarted());

    expect(state.accountSwitchStatus).toBe('synchronizing');
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('user_profile_timestamp')).toBeNull();
  });

  it('setToken clears a cached A profile when adopting B', () => {
    localStorage.setItem('user_profile', JSON.stringify({ id: 'user-a', nickname: 'A' }));
    localStorage.setItem('user_profile_timestamp', '123');
    jwtDecodeMock.mockReturnValue({
      sub: 'user-b',
      email: 'b@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const state = authReducer({
      isAuthenticated: true,
      user: {
        id: 'user-a', username: 'a', avatar: null, email: 'a@example.com', nickname: 'A',
        mobile: null, system_prompt: '', is_superuser: false,
      },
      token: 'token-a',
      status: 'succeeded',
      error: null,
      sessionResolved: true,
      accountSwitchStatus: 'synchronizing',
      accountSwitchError: null,
      switchedAccountEmail: null,
    }, setToken('token-b'));

    expect(state.user?.id).toBe('user-b');
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('user_profile_timestamp')).toBeNull();
  });

  it('setToken also clears stale A profile when Redux has not hydrated an old user', () => {
    localStorage.setItem('user_profile', JSON.stringify({ id: 'user-a', nickname: 'A' }));
    localStorage.setItem('user_profile_timestamp', '123');
    jwtDecodeMock.mockReturnValue({
      sub: 'user-b',
      email: 'b@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const state = authReducer(undefined, setToken('token-b'));

    expect(state.user?.id).toBe('user-b');
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('user_profile_timestamp')).toBeNull();
  });
});
