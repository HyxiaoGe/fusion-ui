import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// revalidateToken 服务于跨应用单点登出（SLO）：用户在别处（如 audio）登出后，fusion 这张
// access token 在过期前仍然密码学有效，SDK 的缓存 getter 察觉不到。revalidateToken 强制走
// 服务端往返（authService.forceRefreshAccessToken → SDK refresh）：
//   - 返回 null（refresh token 被吊销）→ fusion 必须翻转为未登录；
//   - 抛错（瞬时网络故障）→ 绝不登出；
//   - 返回（轮转后的）令牌（会话仍在）→ 保持已登录，且不得覆盖已拉取的完整 profile。
const { forceRefreshAccessTokenMock, clearAuthStorageMock } = vi.hoisted(() => ({
  forceRefreshAccessTokenMock: vi.fn(),
  clearAuthStorageMock: vi.fn(),
}));

vi.mock('@/lib/auth/authService', () => ({
  forceRefreshAccessToken: forceRefreshAccessTokenMock,
  clearAuthStorage: clearAuthStorageMock,
  // authSlice 在模块加载时还会引用这些导出（getInitialAuthState 等），给出惰性桩。
  completeSsoCallback: vi.fn(),
  getStoredAccessToken: vi.fn(() => null),
  revokeSsoSession: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auth/sso-probe', () => ({
  takeSsoReturnPath: vi.fn(() => null),
  markSsoProbed: vi.fn(),
  isSafeReturnPath: vi.fn(() => true),
}));

vi.mock('../../lib/api/user', () => ({
  fetchUserProfileAPI: vi.fn(),
  updateUserSettingsAPI: vi.fn(),
}));

import authReducer, { revalidateToken } from './authSlice';

const AUTHED = {
  isAuthenticated: true,
  user: {
    id: 'u1',
    username: 'a',
    email: 'a@b.c',
    nickname: 'Nick',
    avatar: 'AV',
    mobile: null,
    system_prompt: '',
    is_superuser: false,
  },
  token: 'old-token',
  status: 'succeeded' as const,
  error: null,
};

const makeStore = () =>
  configureStore({ reducer: { auth: authReducer }, preloadedState: { auth: { ...AUTHED } } });

describe('revalidateToken thunk (SLO force-refresh)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('flips the store to unauthenticated when refresh returns null (logged out elsewhere)', async () => {
    forceRefreshAccessTokenMock.mockResolvedValue(null);
    const store = makeStore();

    await store.dispatch(revalidateToken());

    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.token).toBeNull();
    expect(store.getState().auth.user).toBeNull();
  });

  it('stays authenticated on a transient throw (a network blip must not log out)', async () => {
    forceRefreshAccessTokenMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const store = makeStore();

    await store.dispatch(revalidateToken());

    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('stays authenticated and preserves the rich profile when the session is still alive', async () => {
    forceRefreshAccessTokenMock.mockResolvedValue('rotated-token');
    const store = makeStore();

    await store.dispatch(revalidateToken());

    expect(store.getState().auth.isAuthenticated).toBe(true);
    // 成功路径不得 dispatch setToken —— 否则 buildTokenUser 会用最小信息覆盖 nickname/avatar
    expect(store.getState().auth.user?.nickname).toBe('Nick');
    expect(store.getState().auth.user?.avatar).toBe('AV');
  });

  it('forces a server round-trip (does not trust the locally-cached token)', async () => {
    forceRefreshAccessTokenMock.mockResolvedValue('rotated-token');
    const store = makeStore();

    await store.dispatch(revalidateToken());

    expect(forceRefreshAccessTokenMock).toHaveBeenCalledTimes(1);
  });
});
