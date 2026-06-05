import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentAuthState,
  appDispatchMock,
  reduxDispatchMock,
  useAppDispatchMock,
  useAppSelectorMock,
  initializeModelsMock,
  updateModelsMock,
  updateProvidersMock,
  checkUserStateMock,
  fetchUserProfileMock,
  checkLivenessMock,
  resolveSessionMock,
  setGlobalToastMock,
  maybeSilentLoginMock,
} = vi.hoisted(() => ({
  currentAuthState: {
    isAuthenticated: false,
    status: 'idle',
  } as { isAuthenticated: boolean; status: 'idle' | 'loading' | 'succeeded' | 'failed' },
  appDispatchMock: vi.fn(),
  reduxDispatchMock: vi.fn(),
  useAppDispatchMock: vi.fn(),
  useAppSelectorMock: vi.fn(),
  initializeModelsMock: vi.fn(),
  updateModelsMock: vi.fn((models: unknown) => ({ type: 'models/updateModels', payload: models })),
  updateProvidersMock: vi.fn((providers: unknown) => ({ type: 'models/updateProviders', payload: providers })),
  checkUserStateMock: vi.fn(() => ({ type: 'auth/checkUserState' })),
  fetchUserProfileMock: vi.fn(() => ({ type: 'auth/fetchUserProfile' })),
  checkLivenessMock: vi.fn(() => ({ type: 'auth/checkLiveness' })),
  resolveSessionMock: vi.fn(() => ({ type: 'auth/resolveSession' })),
  setGlobalToastMock: vi.fn(),
  maybeSilentLoginMock: vi.fn(() => false),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: useAppDispatchMock,
  useAppSelector: useAppSelectorMock,
}));

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => reduxDispatchMock,
  };
});

vi.mock('@/lib/config/modelConfig', () => ({
  initializeModels: initializeModelsMock,
}));

vi.mock('@/redux/slices/modelsSlice', () => ({
  updateModels: updateModelsMock,
  updateProviders: updateProvidersMock,
}));

vi.mock('@/redux/slices/authSlice', () => ({
  checkUserState: checkUserStateMock,
  fetchUserProfile: fetchUserProfileMock,
  checkLiveness: checkLivenessMock,
  resolveSession: resolveSessionMock,
  setToken: vi.fn(),
}));

vi.mock('@/lib/auth/sso-probe', () => ({
  maybeSilentLogin: maybeSilentLoginMock,
}));

vi.mock('@/components/ui/toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useToast: () => ({ show: vi.fn() }),
  setGlobalToast: setGlobalToastMock,
}));

vi.mock('@/components/auth/LoginDialog', () => ({
  LoginDialog: ({ open }: { open: boolean }) =>
    React.createElement('div', {
      'data-testid': 'login-dialog',
      'data-open': open ? 'true' : 'false',
    }),
}));

vi.mock('@/components/settings/SettingsDialog', () => ({
  SettingsDialog: () =>
    React.createElement('div', {
      'data-testid': 'settings-dialog',
    }),
}));

vi.mock('react-hot-toast', () => ({
  Toaster: () => null,
}));

import ClientLayout from './ClientLayout';

describe('ClientLayout', () => {
  beforeEach(() => {
    currentAuthState.isAuthenticated = false;
    currentAuthState.status = 'idle';
    appDispatchMock.mockReset();
    reduxDispatchMock.mockReset();
    useAppDispatchMock.mockReturnValue(appDispatchMock);
    useAppSelectorMock.mockImplementation(selector => selector({ auth: currentAuthState }));
    initializeModelsMock.mockReset();
    initializeModelsMock.mockResolvedValue({
      models: [{ id: 'model-1' }],
      providers: [{ id: 'qwen', name: '通义千问', order: 1 }],
    });
    updateModelsMock.mockClear();
    updateProvidersMock.mockClear();
    checkUserStateMock.mockClear();
    fetchUserProfileMock.mockClear();
    checkLivenessMock.mockClear();
    resolveSessionMock.mockClear();
    setGlobalToastMock.mockClear();
    maybeSilentLoginMock.mockReset();
    maybeSilentLoginMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes user profile when authenticated state is stale', async () => {
    currentAuthState.isAuthenticated = true;
    currentAuthState.status = 'idle';

    render(
      React.createElement(
        ClientLayout,
        null,
        React.createElement('div', null, 'child')
      )
    );

    await waitFor(() => {
      expect(checkUserStateMock).toHaveBeenCalledTimes(1);
      expect(fetchUserProfileMock).toHaveBeenCalledTimes(1);
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/checkUserState' });
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/fetchUserProfile' });
    });
  });

  it('loads models and opens login dialog for unauthenticated users after delay', async () => {
    render(
      React.createElement(
        ClientLayout,
        null,
        React.createElement('div', null, 'child')
      )
    );

    await waitFor(() => {
      expect(initializeModelsMock).toHaveBeenCalledTimes(1);
      expect(updateModelsMock).toHaveBeenCalledWith([{ id: 'model-1' }]);
      expect(reduxDispatchMock).toHaveBeenCalledWith({
        type: 'models/updateModels',
        payload: [{ id: 'model-1' }],
      });
    });

    expect(screen.getByTestId('login-dialog').getAttribute('data-open')).toBe('false');

    await new Promise(resolve => setTimeout(resolve, 1100));

    await waitFor(() => {
      expect(screen.getByTestId('login-dialog').getAttribute('data-open')).toBe('true');
    });
  });

  it('runs a read-only liveness probe on window focus when authenticated (SLO)', async () => {
    // 跨应用单点登出：别处登出后本标签页令牌仍密码学有效，重新聚焦时做一次【只读】存活探测。
    currentAuthState.isAuthenticated = true;
    currentAuthState.status = 'succeeded';

    render(
      React.createElement(ClientLayout, null, React.createElement('div', null, 'child'))
    );

    await waitFor(() => expect(checkUserStateMock).toHaveBeenCalled());
    appDispatchMock.mockClear(); // 隔离 focus 触发的派发

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/checkLiveness' });
    });
  });

  it('runs the liveness probe when the tab becomes visible again (visibilitychange → visible)', async () => {
    currentAuthState.isAuthenticated = true;
    currentAuthState.status = 'succeeded';

    render(
      React.createElement(ClientLayout, null, React.createElement('div', null, 'child'))
    );

    await waitFor(() => expect(checkUserStateMock).toHaveBeenCalled());
    appDispatchMock.mockClear();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/checkLiveness' });
    });
  });

  it('coalesces focus + visibilitychange within the 3s debounce into a single probe', async () => {
    // 切回标签页常同时触发 focus + visibilitychange；去抖刻意把它们合并成一次探测，避免双打 /api/auth/me。
    currentAuthState.isAuthenticated = true;
    currentAuthState.status = 'succeeded';

    render(
      React.createElement(ClientLayout, null, React.createElement('div', null, 'child'))
    );

    await waitFor(() => expect(checkUserStateMock).toHaveBeenCalled());
    appDispatchMock.mockClear();

    window.dispatchEvent(new Event('focus'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/checkLiveness' });
    });
    const probeDispatches = appDispatchMock.mock.calls.filter(
      (c) => c[0] && c[0].type === 'auth/checkLiveness'
    );
    expect(probeDispatches).toHaveLength(1);
  });

  it('does NOT probe on focus when unauthenticated (no token to verify)', async () => {
    currentAuthState.isAuthenticated = false;

    render(
      React.createElement(ClientLayout, null, React.createElement('div', null, 'child'))
    );
    appDispatchMock.mockClear();

    window.dispatchEvent(new Event('focus'));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(appDispatchMock).not.toHaveBeenCalledWith({ type: 'auth/checkLiveness' });
  });

  it('runs the low-frequency liveness probe on the 5-minute backstop timer when authenticated', async () => {
    // 兜底盲区：长时间聚焦却空闲、不切标签也不发受保护请求（纯 SSE / 阅读态）的页面，
    // 靠定时只读探测感知别处登出。用假定时器推进 5 分钟，断言 checkLiveness 被派发。
    vi.useFakeTimers();
    currentAuthState.isAuthenticated = true;
    currentAuthState.status = 'succeeded';

    render(
      React.createElement(ClientLayout, null, React.createElement('div', null, 'child'))
    );

    // 清掉挂载期（checkUserState 等）的派发，只观察定时器触发的那一次。
    await vi.advanceTimersByTimeAsync(0);
    appDispatchMock.mockClear();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/checkLiveness' });
  });

  it('does NOT open the login dialog when the silent SSO probe fires (page is navigating away)', async () => {
    maybeSilentLoginMock.mockReturnValue(true);

    render(
      React.createElement(
        ClientLayout,
        null,
        React.createElement('div', null, 'child')
      )
    );

    const expectedPath = window.location.pathname + window.location.search;
    await waitFor(() => {
      expect(maybeSilentLoginMock).toHaveBeenCalledTimes(1);
    });
    // Pin the captured origin argument (a regression passing '' or the wrong value must fail).
    expect(maybeSilentLoginMock).toHaveBeenCalledWith(expectedPath);

    // Wait past the 1500ms dialog timer to prove it was never armed (probe redirected away).
    await new Promise(resolve => setTimeout(resolve, 1700));

    expect(screen.getByTestId('login-dialog').getAttribute('data-open')).toBe('false');
  });

  it('resolves the session (reveals the login terminal) when staying logged-out — no silent probe', async () => {
    // 未登录、没有发起静默 SSO 跳转：会话已定论为登出，派发 resolveSession 解锁头像菜单的「登录」终态。
    maybeSilentLoginMock.mockReturnValue(false);

    render(
      React.createElement(ClientLayout, null, React.createElement('div', null, 'child'))
    );

    await waitFor(() => {
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/resolveSession' });
    });
  });

  it('does NOT resolve the session while a silent SSO recovery is in flight (avoids the login-button flash)', async () => {
    // 静默恢复在途（页面正跳走换码）：会话尚未定论，绝不 resolveSession，否则头像会先闪「登录」再翻头像。
    maybeSilentLoginMock.mockReturnValue(true);

    render(
      React.createElement(ClientLayout, null, React.createElement('div', null, 'child'))
    );

    await waitFor(() => expect(maybeSilentLoginMock).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(appDispatchMock).not.toHaveBeenCalledWith({ type: 'auth/resolveSession' });
  });
});
