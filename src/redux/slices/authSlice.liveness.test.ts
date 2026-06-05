import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

// checkLiveness 服务于跨应用单点登出（SLO），且是【只读】的：用户在别处（如 audio）登出后，
// fusion 这张 access token 在过期前仍然密码学有效，SDK 的缓存 getter 察觉不到。checkLiveness
// 取本地 token（getValidAccessToken，仅临界过期才刷、绝不强制轮换），再打一次查 denylist 的
// 受保护端点（probeSessionLiveness → /api/auth/me）：
//   - getValidAccessToken 返回 null（refresh 被吊销 / 无票）→ 翻转未登录；
//   - getValidAccessToken 抛错（瞬时网络）→ 绝不登出；
//   - 探测 401/403（别处登出）→ 翻转未登录；
//   - 探测 5xx / 网络抖动 → 绝不登出（漏判由下次正常请求 401 或 token 过期兜底）；
//   - 成功路径不得 dispatch setToken（否则 buildTokenUser 用最小信息覆盖完整 profile）。
// 关键不变量：checkLiveness 全程【不调用 forceRefreshAccessToken】——强制轮换正是要根除的 churn。
const {
  getValidAccessTokenMock,
  probeSessionLivenessMock,
  forceRefreshAccessTokenMock,
  clearAuthStorageMock,
} = vi.hoisted(() => ({
  getValidAccessTokenMock: vi.fn(),
  probeSessionLivenessMock: vi.fn(),
  forceRefreshAccessTokenMock: vi.fn(),
  clearAuthStorageMock: vi.fn(),
}));

vi.mock('@/lib/auth/authService', () => ({
  getValidAccessToken: getValidAccessTokenMock,
  probeSessionLiveness: probeSessionLivenessMock,
  // 把强制刷新也桩出来：若日后回归把它塞回 checkLiveness，下面 not.toHaveBeenCalled 会立刻报红。
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

import authReducer, { checkLiveness } from './authSlice';

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
  token: 'cached-token',
  status: 'succeeded' as const,
  error: null,
  sessionResolved: true,
};

const makeStore = () =>
  configureStore({ reducer: { auth: authReducer }, preloadedState: { auth: { ...AUTHED } } });

describe('checkLiveness thunk (read-only SLO probe)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    probeSessionLivenessMock.mockResolvedValue(undefined);
  });

  it('flips to unauthenticated when getValidAccessToken returns null (definitive refresh failure)', async () => {
    getValidAccessTokenMock.mockResolvedValue(null);
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.token).toBeNull();
    expect(store.getState().auth.user).toBeNull();
    expect(probeSessionLivenessMock).not.toHaveBeenCalled(); // 无有效 token，不必探测
  });

  it('stays authenticated when getValidAccessToken throws (a transient network blip must not log out)', async () => {
    getValidAccessTokenMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(probeSessionLivenessMock).not.toHaveBeenCalled();
  });

  it('stays authenticated and preserves the rich profile when the probe succeeds (session alive)', async () => {
    getValidAccessTokenMock.mockResolvedValue('cached-token');
    probeSessionLivenessMock.mockResolvedValue(undefined);
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(store.getState().auth.isAuthenticated).toBe(true);
    // 成功路径不得 dispatch setToken —— 否则 buildTokenUser 会用最小信息覆盖 nickname/avatar
    expect(store.getState().auth.user?.nickname).toBe('Nick');
    expect(store.getState().auth.user?.avatar).toBe('AV');
    expect(probeSessionLivenessMock).toHaveBeenCalledWith('cached-token');
  });

  it('flips to unauthenticated when the probe is rejected with 401 (logged out elsewhere)', async () => {
    getValidAccessTokenMock.mockResolvedValue('cached-token');
    probeSessionLivenessMock.mockRejectedValue(new Error('liveness probe failed (401)'));
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(store.getState().auth.isAuthenticated).toBe(false);
    expect(store.getState().auth.user).toBeNull();
  });

  it('flips to unauthenticated when the probe is rejected with 403', async () => {
    getValidAccessTokenMock.mockResolvedValue('cached-token');
    probeSessionLivenessMock.mockRejectedValue(new Error('liveness probe failed (403)'));
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it('flips to unauthenticated even when the probe rejects with a non-Error 401 string (String(err) fallback)', async () => {
    getValidAccessTokenMock.mockResolvedValue('cached-token');
    probeSessionLivenessMock.mockRejectedValue('liveness probe failed (401)'); // 抛字符串而非 Error
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it('stays authenticated when the probe fails with 5xx (transient, not a logout signal)', async () => {
    getValidAccessTokenMock.mockResolvedValue('cached-token');
    probeSessionLivenessMock.mockRejectedValue(new Error('liveness probe failed (502)'));
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('stays authenticated when the probe throws a bare network error (no status)', async () => {
    getValidAccessTokenMock.mockResolvedValue('cached-token');
    probeSessionLivenessMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(store.getState().auth.isAuthenticated).toBe(true);
  });

  it('NEVER force-refreshes (read-only): the rotation churn that caused passive logout is gone', async () => {
    getValidAccessTokenMock.mockResolvedValue('cached-token');
    const store = makeStore();

    await store.dispatch(checkLiveness());

    expect(getValidAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(forceRefreshAccessTokenMock).not.toHaveBeenCalled();
  });
});
