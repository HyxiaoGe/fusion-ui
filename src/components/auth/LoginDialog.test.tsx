import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import i18n from '@/lib/i18n';
import { LoginDialog } from './LoginDialog';

const {
  cancelEmailCodeLoginMock,
  completeEmailCodeLoginMock,
  dispatchMock,
  getEmailLoginCapabilitiesMock,
  isAuthConfiguredMock,
  onOpenChangeMock,
  resendEmailCodeLoginMock,
  startEmailCodeLoginMock,
  startSsoLoginMock,
  toastMock,
  unwrapMock,
  verifyEmailCodeLoginMock,
} = vi.hoisted(() => ({
  cancelEmailCodeLoginMock: vi.fn(),
  completeEmailCodeLoginMock: vi.fn(() => ({ type: 'auth/completeEmailCodeLogin' })),
  dispatchMock: vi.fn(),
  getEmailLoginCapabilitiesMock: vi.fn<() => Promise<{ headless: boolean }>>(),
  isAuthConfiguredMock: vi.fn(() => true),
  onOpenChangeMock: vi.fn(),
  resendEmailCodeLoginMock: vi.fn(),
  startEmailCodeLoginMock: vi.fn(),
  startSsoLoginMock: vi.fn<(provider: 'github' | 'google') => Promise<void>>(),
  toastMock: vi.fn(),
  unwrapMock: vi.fn(),
  verifyEmailCodeLoginMock: vi.fn(),
}));

vi.mock('@/lib/auth/auth-sdk', () => ({
  isAuthConfigured: isAuthConfiguredMock,
}));

vi.mock('@/lib/auth/authService', () => ({
  getEmailLoginCapabilities: getEmailLoginCapabilitiesMock,
  startSsoLogin: startSsoLoginMock,
}));

vi.mock('@/lib/auth/emailCodeAuth', () => ({
  startEmailCodeLogin: startEmailCodeLoginMock,
  resendEmailCodeLogin: resendEmailCodeLoginMock,
  verifyEmailCodeLogin: verifyEmailCodeLoginMock,
  cancelEmailCodeLogin: cancelEmailCodeLoginMock,
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock('@/redux/slices/authSlice', () => ({
  completeEmailCodeLogin: completeEmailCodeLoginMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

const challenge = {
  interactionToken: 'oauth-state-1',
  maskedDestination: 'u***@example.com',
  expiresInSeconds: 300,
  resendAfterSeconds: 60,
  codeLength: 6,
};

async function enterEmailPanel() {
  fireEvent.click(await screen.findByRole('button', { name: '使用邮箱验证码登录' }));
  return screen.findByLabelText('邮箱地址');
}

async function reachCodePanel() {
  const emailInput = await enterEmailPanel();
  fireEvent.change(emailInput, { target: { value: 'user@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
  return screen.findByLabelText('验证码');
}

describe('LoginDialog', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    isAuthConfiguredMock.mockReturnValue(true);
    getEmailLoginCapabilitiesMock.mockResolvedValue({ headless: true });
    startSsoLoginMock.mockResolvedValue(undefined);
    startEmailCodeLoginMock.mockResolvedValue(challenge);
    resendEmailCodeLoginMock.mockResolvedValue(challenge);
    verifyEmailCodeLoginMock.mockResolvedValue({ status: 'authenticated', user: { id: 'u1' }, redirectPath: '/' });
    unwrapMock.mockResolvedValue(undefined);
    dispatchMock.mockReturnValue({ unwrap: unwrapMock });
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('headless 能力开启时邮箱入口只进入弹窗两步流程，不触发任何 SDK 跳转', async () => {
    render(<LoginDialog open onOpenChange={onOpenChangeMock} />);

    const emailInput = await enterEmailPanel();

    expect(emailInput).toBeInTheDocument();
    expect(startSsoLoginMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '使用 GitHub 登录' })).not.toBeInTheDocument();
  });

  it('没有 headless 能力时隐藏邮箱入口且不调用 SDK', async () => {
    getEmailLoginCapabilitiesMock.mockResolvedValue({ headless: false });
    render(<LoginDialog open onOpenChange={onOpenChangeMock} />);

    await waitFor(() => expect(getEmailLoginCapabilitiesMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '使用邮箱验证码登录' })).not.toBeInTheDocument();
    expect(startSsoLoginMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('邮箱地址')).not.toBeInTheDocument();
  });

  it.each([
    ['GitHub', 'github'],
    ['Google', 'google'],
  ] as const)('保留既有 %s OAuth 登录入口', async (label, provider) => {
    render(<LoginDialog open onOpenChange={onOpenChangeMock} />);

    fireEvent.click(screen.getByRole('button', { name: `使用 ${label} 登录` }));

    expect(startSsoLoginMock).toHaveBeenCalledWith(provider);
  });

  it('headless verify 完成 SDK 会话后注入 Redux、拉 profile 并关闭弹窗', async () => {
    render(<LoginDialog open onOpenChange={onOpenChangeMock} />);
    const codeInput = await reachCodePanel();
    fireEvent.change(codeInput, { target: { value: '123456' } });

    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));

    await waitFor(() => {
      expect(verifyEmailCodeLoginMock).toHaveBeenCalledWith({
        interactionToken: 'oauth-state-1',
        verificationCode: '123456',
        signal: expect.any(AbortSignal),
      });
      expect(completeEmailCodeLoginMock).toHaveBeenCalledTimes(1);
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/completeEmailCodeLogin' });
      expect(unwrapMock).toHaveBeenCalledTimes(1);
      expect(onOpenChangeMock).toHaveBeenCalledWith(false);
    });
  });

  it('verify 临界区隐藏 X、忽略 Escape 和外部 open=false，直到 SDK/Redux 完成', async () => {
    let resolveVerify: (() => void) | undefined;
    verifyEmailCodeLoginMock.mockReturnValueOnce(new Promise((resolve) => { resolveVerify = () => resolve({}); }));
    const { rerender } = render(<LoginDialog open onOpenChange={onOpenChangeMock} />);
    const codeInput = await reachCodePanel();
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));

    await waitFor(() => expect(verifyEmailCodeLoginMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: '关闭登录' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChangeMock).not.toHaveBeenCalledWith(false);

    rerender(<LoginDialog open={false} onOpenChange={onOpenChangeMock} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => resolveVerify?.());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('verify 消费后失败会回邮箱输入页并保持弹窗打开', async () => {
    verifyEmailCodeLoginMock.mockRejectedValueOnce({ code: 'interaction_consumed' });
    render(<LoginDialog open onOpenChange={onOpenChangeMock} />);
    const codeInput = await reachCodePanel();
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('该验证码已使用，请重新获取验证码');
    expect(screen.getByLabelText('邮箱地址')).toHaveValue('user@example.com');
    expect(completeEmailCodeLoginMock).not.toHaveBeenCalled();
    expect(onOpenChangeMock).not.toHaveBeenCalledWith(false);
  });

  it('认证配置缺失时不进入 headless，也不调用 SDK', async () => {
    isAuthConfiguredMock.mockReturnValue(false);
    render(<LoginDialog open onOpenChange={onOpenChangeMock} />);

    fireEvent.click(await screen.findByRole('button', { name: '使用邮箱验证码登录' }));

    expect(startEmailCodeLoginMock).not.toHaveBeenCalled();
    expect(startSsoLoginMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      message: '登录配置缺失，请稍后再试',
      type: 'error',
    });
  });

  it('能力探测中、能力关闭或网络失败时隐藏邮箱入口，OAuth 不受影响', async () => {
    let resolveCapability: ((value: { headless: boolean }) => void) | undefined;
    getEmailLoginCapabilitiesMock.mockReturnValueOnce(new Promise((resolve) => { resolveCapability = resolve; }));
    const { rerender } = render(<LoginDialog open onOpenChange={onOpenChangeMock} />);

    expect(screen.queryByRole('button', { name: '使用邮箱验证码登录' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '使用 GitHub 登录' })).toBeEnabled();
    resolveCapability?.({ headless: false });
    await waitFor(() => expect(screen.queryByRole('button', { name: '使用邮箱验证码登录' })).not.toBeInTheDocument());

    getEmailLoginCapabilitiesMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    rerender(<LoginDialog open={false} onOpenChange={onOpenChangeMock} />);
    rerender(<LoginDialog open onOpenChange={onOpenChangeMock} />);
    await waitFor(() => expect(getEmailLoginCapabilitiesMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '使用 Google 登录' })).toBeEnabled();
  });

  it('非受控 trigger 也由 LoginDialog 内部 open 状态控制', async () => {
    render(<LoginDialog trigger={<button type="button">打开登录</button>} />);

    fireEvent.click(screen.getByRole('button', { name: '打开登录' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关闭登录' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('英文环境覆盖登录方式、邮箱表单和关闭按钮', async () => {
    await i18n.changeLanguage('en-US');
    render(<LoginDialog open onOpenChange={onOpenChangeMock} />);

    expect(screen.getByRole('heading', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with email verification code' }));
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sign in with email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close sign-in dialog' })).toBeInTheDocument();
  });
});
