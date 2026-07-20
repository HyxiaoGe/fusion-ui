import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureStore, type Middleware } from '@reduxjs/toolkit';

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
  clearFusionProfileStorage: vi.fn(),
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

import authReducer, {
  completeEmailCodeLogin,
  completeLogin,
  fetchUserProfile,
  logout,
  logoutWithSso,
  setToken,
} from './authSlice';

const makeStore = (observedActions?: unknown[]) => {
  const observer: Middleware = () => (next) => (action) => {
    observedActions?.push(action);
    return next(action);
  };
  return configureStore({
    reducer: { auth: authReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(observer),
  });
};

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

  it('post-logout bounce (no_callback): soft-lands to "/" with no error and no profile fetch (Single Logout return)', async () => {
    // Global Single Logout 302s the browser back to fusion's registered redirect_uri
    // (/auth/callback) with NO ?code=. The SDK returns { status: 'no_callback' } — it does NOT
    // throw — so fusion's soft gate collapses it to a clean "/" landing like any other
    // non-authenticated result. This is why fusion (unlike audio) needs no callback-page change:
    // the error path only fires when the SDK THROWS with no stored token, never on no_callback.
    completeSsoCallbackMock.mockResolvedValue({ status: 'no_callback' });

    const store = makeStore();
    const action = await store.dispatch(completeLogin());

    expect(completeLogin.fulfilled.match(action)).toBe(true);
    expect(action.payload).toEqual({ redirectPath: '/' });
    expect(fetchUserProfileAPIMock).not.toHaveBeenCalled();
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

  it('已有 A 会话时 B 的 callback 失败必须拒绝，不能把 A 的旧 token 当成 B 登录成功', async () => {
    completeSsoCallbackMock.mockRejectedValue(new Error('userinfo failed (502)'));
    getStoredAccessTokenMock.mockReturnValue('access-token-a');
    jwtDecodeMock.mockReturnValue({
      sub: 'account-a',
      email: 'a@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const observedActions: unknown[] = [];
    const store = makeStore(observedActions);
    store.dispatch(setToken('access-token-a'));
    observedActions.length = 0;
    const action = await store.dispatch(completeLogin());

    expect(completeLogin.rejected.match(action)).toBe(true);
    expect(action.payload).toBe('userinfo failed (502)');
    expect(getStoredAccessTokenMock).not.toHaveBeenCalled();
    expect(fetchUserProfileAPIMock).not.toHaveBeenCalled();
    expect(observedActions).not.toContainEqual(expect.objectContaining({ type: setToken.type }));
    expect(store.getState().auth).toMatchObject({
      isAuthenticated: true,
      token: 'access-token-a',
      user: { id: 'account-a', email: 'a@example.com' },
    });
  });
});

describe('completeEmailCodeLogin thunk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('SDK headless completion 成功后立即注入 token，并在后台刷新 Fusion profile', async () => {
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
    const action = await store.dispatch(completeEmailCodeLogin());

    expect(completeEmailCodeLogin.fulfilled.match(action)).toBe(true);
    expect(fetchUserProfileAPIMock).toHaveBeenCalledTimes(1);
    expect(store.getState().auth).toMatchObject({ isAuthenticated: true, token: 'access-jwt' });
    await vi.waitFor(() => {
      expect(store.getState().auth.user).toMatchObject({ nickname: 'Nick' });
    });
  });

  it('profile 请求永不完成时 thunk 仍立即 fulfilled，verify critical 不被后台刷新挂住', async () => {
    getStoredAccessTokenMock.mockReturnValue('access-jwt');
    jwtDecodeMock.mockReturnValue({
      sub: 'u1',
      email: 'a@b.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    fetchUserProfileAPIMock.mockReturnValue(new Promise(() => undefined));

    const store = makeStore();
    const actionPromise = store.dispatch(completeEmailCodeLogin());
    const outcome = await Promise.race([
      actionPromise.then((action) => ({ kind: 'action' as const, action })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), 50);
      }),
    ]);

    expect(outcome.kind).toBe('action');
    if (outcome.kind !== 'action') return;
    expect(completeEmailCodeLogin.fulfilled.match(outcome.action)).toBe(true);
    expect(fetchUserProfileAPIMock).toHaveBeenCalledTimes(1);
    expect(store.getState().auth).toMatchObject({
      isAuthenticated: true,
      token: 'access-jwt',
      status: 'loading',
    });
  });

  it('SDK completion 没有原子落库 token 时拒绝，不伪造登录成功', async () => {
    getStoredAccessTokenMock.mockReturnValue(null);

    const store = makeStore();
    const action = await store.dispatch(completeEmailCodeLogin());

    expect(completeEmailCodeLogin.rejected.match(action)).toBe(true);
    expect(fetchUserProfileAPIMock).not.toHaveBeenCalled();
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });

  it('A profile 挂起后 logout→B 登录，A 迟到成功不得覆盖 B profile 或 localStorage', async () => {
    let resolveProfileA: ((profile: Record<string, unknown>) => void) | undefined;
    const profileA = {
      id: 'account-a', username: 'a', email: 'a@example.com', nickname: 'Account A',
      avatar: null, mobile: null, system_prompt: '', is_superuser: false,
    };
    const profileB = {
      id: 'account-b', username: 'b', email: 'b@example.com', nickname: 'Account B',
      avatar: null, mobile: null, system_prompt: '', is_superuser: false,
    };
    fetchUserProfileAPIMock
      .mockReturnValueOnce(new Promise((resolve) => { resolveProfileA = resolve; }))
      .mockResolvedValueOnce(profileB);
    jwtDecodeMock.mockImplementation((token: string) => ({
      sub: token === 'token-a' ? 'account-a' : 'account-b',
      email: token === 'token-a' ? 'a@example.com' : 'b@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }));
    const store = makeStore();
    store.dispatch(setToken('token-a'));
    const requestA = store.dispatch(fetchUserProfile());
    store.dispatch(logout());
    store.dispatch(setToken('token-b'));
    await store.dispatch(fetchUserProfile());
    expect(store.getState().auth.user).toMatchObject({ id: 'account-b', nickname: 'Account B' });

    resolveProfileA?.(profileA);
    await requestA;

    expect(store.getState().auth).toMatchObject({
      token: 'token-b',
      user: { id: 'account-b', nickname: 'Account B' },
      status: 'succeeded',
    });
    expect(JSON.parse(localStorage.getItem('user_profile') ?? 'null')).toMatchObject({
      id: 'account-b', nickname: 'Account B',
    });
  });

  it('logout 后 A profile 迟到成功不得复活 Redux 或重写已清理的 profile 存储', async () => {
    let resolveProfileA: ((profile: Record<string, unknown>) => void) | undefined;
    fetchUserProfileAPIMock.mockReturnValueOnce(new Promise((resolve) => { resolveProfileA = resolve; }));
    jwtDecodeMock.mockReturnValue({
      sub: 'account-a',
      email: 'a@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const store = makeStore();
    store.dispatch(setToken('token-a'));
    const requestA = store.dispatch(fetchUserProfile());
    store.dispatch(logout());

    resolveProfileA?.({
      id: 'account-a', username: 'a', email: 'a@example.com', nickname: 'Account A',
      avatar: null, mobile: null, system_prompt: '', is_superuser: false,
    });
    await requestA;

    expect(store.getState().auth).toMatchObject({
      isAuthenticated: false,
      token: null,
      user: null,
      status: 'idle',
    });
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('user_profile_timestamp')).toBeNull();
  });

  it('切换到 B 后 A profile 迟到失败不得把 B 状态改成 failed', async () => {
    let rejectProfileA: ((error: Error) => void) | undefined;
    const profileB = {
      id: 'account-b', username: 'b', email: 'b@example.com', nickname: 'Account B',
      avatar: null, mobile: null, system_prompt: '', is_superuser: false,
    };
    fetchUserProfileAPIMock
      .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectProfileA = reject; }))
      .mockResolvedValueOnce(profileB);
    jwtDecodeMock.mockImplementation((token: string) => ({
      sub: token === 'token-a' ? 'account-a' : 'account-b',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }));
    const store = makeStore();
    store.dispatch(setToken('token-a'));
    const requestA = store.dispatch(fetchUserProfile());
    store.dispatch(setToken('token-b'));
    await store.dispatch(fetchUserProfile());

    rejectProfileA?.(new Error('A profile late failure'));
    await requestA;

    expect(store.getState().auth).toMatchObject({
      token: 'token-b',
      user: { id: 'account-b', nickname: 'Account B' },
      status: 'succeeded',
      error: null,
    });
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
