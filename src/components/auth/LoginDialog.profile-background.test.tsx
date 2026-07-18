import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchUserProfileAPIMock,
  getStoredAccessTokenMock,
  jwtDecodeMock,
} = vi.hoisted(() => ({
  fetchUserProfileAPIMock: vi.fn(),
  getStoredAccessTokenMock: vi.fn(),
  jwtDecodeMock: vi.fn(),
}));

vi.mock('@/lib/auth/auth-sdk', () => ({ isAuthConfigured: () => true }));
vi.mock('@/lib/auth/authService', () => ({
  clearAuthStorage: vi.fn(),
  completeSsoCallback: vi.fn(),
  getEmailLoginCapabilities: vi.fn(async () => ({ headless: true })),
  getStoredAccessToken: getStoredAccessTokenMock,
  getValidAccessToken: vi.fn(),
  probeSessionLiveness: vi.fn(),
  revokeSsoSession: vi.fn(),
  startSsoLogin: vi.fn(),
}));
vi.mock('@/lib/auth/emailCodeAuth', () => ({
  cancelEmailCodeLogin: vi.fn(),
  resendEmailCodeLogin: vi.fn(),
  startEmailCodeLogin: vi.fn(async () => ({
    interactionToken: 'oauth-state-1',
    maskedDestination: 'u***@example.com',
    expiresInSeconds: 300,
    resendAfterSeconds: 60,
    codeLength: 6,
  })),
  verifyEmailCodeLogin: vi.fn(async () => ({
    status: 'authenticated',
    user: { id: 'u1' },
    redirectPath: '/',
  })),
}));
vi.mock('@/lib/auth/sso-probe', () => ({
  isSafeReturnPath: vi.fn(() => true),
  markSsoProbed: vi.fn(),
  takeSsoReturnPath: vi.fn(() => null),
}));
vi.mock('@/lib/api/user', () => ({
  fetchUserProfileAPI: fetchUserProfileAPIMock,
  updateUserSettingsAPI: vi.fn(),
}));
vi.mock('jwt-decode', () => ({ jwtDecode: jwtDecodeMock }));
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import i18n from '@/lib/i18n';
import authReducer from '@/redux/slices/authSlice';
import { LoginDialog } from './LoginDialog';

function ControlledLoginDialog() {
  const [open, setOpen] = useState(true);
  return <LoginDialog open={open} onOpenChange={setOpen} />;
}

describe('LoginDialog profile 后台刷新', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    getStoredAccessTokenMock.mockReturnValue('access-jwt');
    jwtDecodeMock.mockReturnValue({
      sub: 'u1',
      email: 'a@b.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    fetchUserProfileAPIMock.mockReturnValue(new Promise(() => undefined));
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('profile Promise 永不完成时，token 注入后 verify critical 仍结束并关闭弹窗', async () => {
    const store = configureStore({ reducer: { auth: authReducer } });
    render(
      <Provider store={store}>
        <ControlledLoginDialog />
      </Provider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '使用邮箱验证码登录' }));
    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    const codeInput = await screen.findByLabelText('验证码');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchUserProfileAPIMock).toHaveBeenCalledTimes(1);
    expect(store.getState().auth).toMatchObject({
      isAuthenticated: true,
      token: 'access-jwt',
      status: 'loading',
    });
  });
});
