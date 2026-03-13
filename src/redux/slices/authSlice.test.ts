import { beforeEach, describe, expect, it, vi } from 'vitest';

const { jwtDecodeMock } = vi.hoisted(() => ({
  jwtDecodeMock: vi.fn(),
}));

vi.mock('jwt-decode', () => ({
  jwtDecode: jwtDecodeMock,
}));

import authReducer, { checkUserState, logout, setToken } from './authSlice';

describe('authSlice', () => {
  beforeEach(() => {
    localStorage.clear();
    jwtDecodeMock.mockReset();
  });

  it('accepts a valid token and persists it', () => {
    jwtDecodeMock.mockReturnValue({
      id: 'user-1',
      login: 'fusion-user',
      avatar_url: 'https://example.com/avatar.png',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const state = authReducer(undefined, setToken('valid-token'));

    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('valid-token');
    expect(state.user).toEqual({
      id: 'user-1',
      username: 'fusion-user',
      avatar: 'https://example.com/avatar.png',
      email: null,
      nickname: null,
      mobile: null,
    });
    expect(localStorage.getItem('auth_token')).toBe('valid-token');
  });

  it('rejects an expired token and clears local auth state', () => {
    localStorage.setItem('auth_token', 'expired-token');
    localStorage.setItem('user_profile', '{"id":"user-1"}');
    localStorage.setItem('user_profile_timestamp', '123');
    jwtDecodeMock.mockReturnValue({
      id: 'user-1',
      login: 'fusion-user',
      avatar_url: 'https://example.com/avatar.png',
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
      },
      logout()
    );

    expect(state).toEqual({
      isAuthenticated: false,
      user: null,
      token: null,
      status: 'idle',
      error: null,
    });
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('user_profile_timestamp')).toBeNull();
  });
});
