import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n';
import { LoginDialog } from './LoginDialog';

const { isAuthConfiguredMock, supportsEmailCodeLoginMock, startSsoLoginMock, toastMock } = vi.hoisted(() => ({
  isAuthConfiguredMock: vi.fn(() => true),
  supportsEmailCodeLoginMock: vi.fn<() => Promise<boolean>>(),
  startSsoLoginMock: vi.fn<(provider: 'github' | 'google' | 'email') => Promise<void>>(),
  toastMock: vi.fn(),
}));

vi.mock('@/lib/auth/auth-sdk', () => ({
  isAuthConfigured: isAuthConfiguredMock,
}));

vi.mock('@/lib/auth/authService', () => ({
  supportsEmailCodeLogin: supportsEmailCodeLoginMock,
  startSsoLogin: startSsoLoginMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe('LoginDialog', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    isAuthConfiguredMock.mockReturnValue(true);
    supportsEmailCodeLoginMock.mockResolvedValue(true);
    startSsoLoginMock.mockResolvedValue(undefined);
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('能力开启时通过集中式 SSO provider=email 发起邮箱验证码登录，并与既有入口互斥 loading', async () => {
    render(<LoginDialog open onOpenChange={vi.fn()} />);

    const emailButton = await screen.findByRole('button', { name: '使用邮箱验证码登录' });
    const githubButton = screen.getByRole('button', { name: '使用 GitHub 登录' });
    const googleButton = screen.getByRole('button', { name: '使用 Google 登录' });

    fireEvent.click(emailButton);

    expect(startSsoLoginMock).toHaveBeenCalledWith('email');
    expect(emailButton).toBeDisabled();
    expect(githubButton).toBeDisabled();
    expect(googleButton).toBeDisabled();
    expect(emailButton.querySelector('svg.animate-spin')).not.toBeNull();
  });

  it.each([
    ['GitHub', 'github'],
    ['Google', 'google'],
  ] as const)('保留既有 %s OAuth 登录入口', (label, provider) => {
    render(<LoginDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: `使用 ${label} 登录` }));

    expect(startSsoLoginMock).toHaveBeenCalledWith(provider);
  });

  it('邮箱登录启动失败时沿用统一错误提示并恢复全部入口', async () => {
    startSsoLoginMock.mockRejectedValue(new Error('network down'));
    render(<LoginDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '使用邮箱验证码登录' }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith({
        message: '登录失败，请重试',
        type: 'error',
      });
      expect(screen.getByRole('button', { name: '使用邮箱验证码登录' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '使用 GitHub 登录' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '使用 Google 登录' })).toBeEnabled();
    });
  });

  it('认证配置缺失时邮箱入口沿用现有配置错误提示且不调用 SDK', async () => {
    isAuthConfiguredMock.mockReturnValue(false);
    render(<LoginDialog open onOpenChange={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: '使用邮箱验证码登录' }));

    expect(startSsoLoginMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      message: '登录配置缺失，请稍后再试',
      type: 'error',
    });
    expect(screen.getByRole('button', { name: '使用邮箱验证码登录' })).toBeEnabled();
  });

  it('邮箱验证码入口使用英文语言包文案', async () => {
    await i18n.changeLanguage('en-US');
    render(<LoginDialog open onOpenChange={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Sign in with email verification code' })).toBeInTheDocument();
  });

  it('能力探测中、能力关闭或网络失败时隐藏邮箱入口，既有 OAuth 入口不受影响', async () => {
    let resolveCapability: (value: boolean) => void = () => undefined;
    supportsEmailCodeLoginMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveCapability = resolve;
    }));
    const { rerender } = render(<LoginDialog open onOpenChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: '使用邮箱验证码登录' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用 GitHub 登录' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '使用 Google 登录' })).toBeEnabled();

    resolveCapability(false);
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '使用邮箱验证码登录' })).not.toBeInTheDocument();
    });

    supportsEmailCodeLoginMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    rerender(<LoginDialog open={false} onOpenChange={vi.fn()} />);
    rerender(<LoginDialog open onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(supportsEmailCodeLoginMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('button', { name: '使用邮箱验证码登录' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '使用 GitHub 登录' })).toBeEnabled();
      expect(screen.getByRole('button', { name: '使用 Google 登录' })).toBeEnabled();
    });
  });

  it('每次重新打开都会刷新能力，旧后端关闭后升级为支持时可显示邮箱入口', async () => {
    supportsEmailCodeLoginMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const { rerender } = render(<LoginDialog open onOpenChange={vi.fn()} />);

    await waitFor(() => expect(supportsEmailCodeLoginMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '使用邮箱验证码登录' })).not.toBeInTheDocument();

    rerender(<LoginDialog open={false} onOpenChange={vi.fn()} />);
    rerender(<LoginDialog open onOpenChange={vi.fn()} />);

    expect(await screen.findByRole('button', { name: '使用邮箱验证码登录' })).toBeInTheDocument();
    expect(supportsEmailCodeLoginMock).toHaveBeenCalledTimes(2);
  });
});
