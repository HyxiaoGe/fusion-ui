import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import i18n from '@/lib/i18n';
import { EmailCodeLoginPanel, type EmailCodeLoginPanelProps } from './EmailCodeLoginPanel';

const challenge = {
  interactionToken: 'interaction-1',
  maskedDestination: 'u***@example.com',
  expiresInSeconds: 300,
  resendAfterSeconds: 60,
  codeLength: 6,
};

function createProps(overrides: Partial<EmailCodeLoginPanelProps> = {}): EmailCodeLoginPanelProps {
  return {
    active: true,
    start: vi.fn(async () => challenge),
    resend: vi.fn(async () => ({ ...challenge, interactionToken: 'interaction-2' })),
    verify: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
    onBackToMethods: vi.fn(),
    onAuthenticated: vi.fn(),
    onCriticalOperationChange: vi.fn(),
    ...overrides,
  };
}

function PanelHarness(props: EmailCodeLoginPanelProps) {
  return (
    <Dialog open>
      <DialogContent>
        <EmailCodeLoginPanel {...props} />
      </DialogContent>
    </Dialog>
  );
}

function renderPanel(props: EmailCodeLoginPanelProps) {
  return render(<PanelHarness {...props} />);
}

async function reachCodeEntry(props: EmailCodeLoginPanelProps) {
  renderPanel(props);
  fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: ' user@example.com ' } });
  fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
  expect(await screen.findByText('验证码已发送至 u***@example.com')).toBeInTheDocument();
}

describe('EmailCodeLoginPanel', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await i18n.changeLanguage('zh-CN');
  });

  afterEach(async () => {
    vi.useRealTimers();
    await i18n.changeLanguage('zh-CN');
  });

  it('首次使用自动创建账户说明始终展示', () => {
    renderPanel(createProps());

    expect(
      screen.getByText('输入邮箱地址，我们会向你发送登录验证码。首次使用该邮箱将自动创建账户。'),
    ).toBeInTheDocument();
  });

  it('无效邮箱只显示行内错误，不调用 start，并把焦点留在邮箱字段', () => {
    const props = createProps();
    renderPanel(props);

    const input = screen.getByLabelText('邮箱地址');
    fireEvent.change(input, { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    expect(props.start).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('请输入有效的邮箱地址');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
  });

  it('发送时传递 trim 后邮箱与 AbortSignal，成功后只展示服务端脱敏邮箱', async () => {
    const props = createProps();
    await reachCodeEntry(props);

    expect(props.start).toHaveBeenCalledTimes(1);
    expect(props.start).toHaveBeenCalledWith({
      email: 'user@example.com',
      signal: expect.any(AbortSignal),
    });
    expect(screen.queryByText('user@example.com')).not.toBeInTheDocument();
  });

  it('验证码字段具备 OTP 可访问性属性，六位数字才可提交并完成登录', async () => {
    const props = createProps();
    await reachCodeEntry(props);

    const codeInput = screen.getByLabelText('验证码');
    expect(codeInput).toHaveAttribute('inputmode', 'numeric');
    expect(codeInput).toHaveAttribute('autocomplete', 'one-time-code');
    expect(codeInput).toHaveAttribute('maxlength', '6');
    expect(codeInput).toHaveFocus();

    const verifyButton = screen.getByRole('button', { name: '验证并登录' });
    expect(verifyButton).toBeDisabled();
    fireEvent.change(codeInput, { target: { value: '12a34 56' } });
    expect(codeInput).toHaveValue('123456');
    expect(verifyButton).toBeEnabled();
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(props.verify).toHaveBeenCalledWith({
        interactionToken: 'interaction-1',
        verificationCode: '123456',
        signal: expect.any(AbortSignal),
      });
      expect(props.onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('请求进行中按钮互斥，重复点击不会发送两个请求', async () => {
    let resolveStart: ((value: typeof challenge) => void) | undefined;
    const start = vi.fn(() => new Promise<typeof challenge>((resolve) => { resolveStart = resolve; }));
    const props = createProps({ start });
    renderPanel(props);
    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });

    const sendButton = screen.getByRole('button', { name: '发送验证码' });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '正在发送...' })).toBeDisabled();
    await act(async () => resolveStart?.(challenge));
  });

  it('invalid_code 清空验证码、显示行内错误并重新聚焦', async () => {
    const verify = vi.fn(async () => { throw { code: 'invalid_code' }; });
    const props = createProps({ verify });
    await reachCodeEntry(props);
    const input = screen.getByLabelText('验证码');
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));

    await waitFor(() => {
      expect(input).toHaveValue('');
      expect(input).toHaveFocus();
      expect(screen.getByRole('alert')).toHaveTextContent('验证码不正确，请重新输入');
    });
    expect(props.onAuthenticated).not.toHaveBeenCalled();
  });

  it('verify 从请求发出到 callback 完成持续标记 critical', async () => {
    let resolveVerify: (() => void) | undefined;
    const verify = vi.fn(() => new Promise<void>((resolve) => { resolveVerify = resolve; }));
    const props = createProps({ verify });
    await reachCodeEntry(props);
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '123456' } });

    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));

    expect(props.onCriticalOperationChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: '更换邮箱' })).toBeDisabled();

    await act(async () => resolveVerify?.());
    await waitFor(() => {
      expect(props.onCriticalOperationChange).toHaveBeenLastCalledWith(false);
      expect(props.onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('严格使用服务端重发冷却，重发成功后清空旧验证码并轮换 interaction', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    const props = createProps({
      start: vi.fn(async () => ({ ...challenge, resendAfterSeconds: 2 })),
      resend: vi.fn(async () => ({ ...challenge, interactionToken: 'interaction-2', resendAfterSeconds: 30 })),
    });
    renderPanel(props);
    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
      await Promise.resolve();
    });
    expect(screen.getByText('验证码已发送至 u***@example.com')).toBeInTheDocument();

    const codeInput = screen.getByLabelText('验证码');
    fireEvent.change(codeInput, { target: { value: '123456' } });
    expect(screen.getByRole('button', { name: '2 秒后可重新发送' })).toBeDisabled();

    await act(async () => vi.advanceTimersByTime(2_000));
    fireEvent.click(screen.getByRole('button', { name: '重新发送验证码' }));
    await act(async () => Promise.resolve());

    expect(props.resend).toHaveBeenCalledWith({
      interactionToken: 'interaction-1',
      signal: expect.any(AbortSignal),
    });
    expect(codeInput).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('新的验证码已发送');

    fireEvent.change(codeInput, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));
    await act(async () => Promise.resolve());
    expect(props.verify).toHaveBeenCalledWith(expect.objectContaining({ interactionToken: 'interaction-2' }));
  });

  it('rate_limited 按 retryAfterSeconds 禁用发送按钮并显示倒计时', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    const start = vi.fn(async () => { throw { code: 'rate_limited', retryAfterSeconds: 2 }; });
    const props = createProps({ start });
    renderPanel(props);
    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    await act(async () => Promise.resolve());

    expect(screen.getByRole('alert')).toHaveTextContent('请求过于频繁，请在 2 秒后重试');
    expect(screen.getByRole('button', { name: '2 秒后重试' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('rate_limited 缺少 retryAfterSeconds 时采用 1 秒冷却并自动清掉提示', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));
    const start = vi.fn(async () => { throw { code: 'rate_limited' }; });
    const props = createProps({ start });
    renderPanel(props);
    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    await act(async () => Promise.resolve());

    expect(screen.getByRole('alert')).toHaveTextContent('请求过于频繁，请在 1 秒后重试');
    expect(screen.getByRole('button', { name: '1 秒后重试' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole('button', { name: '发送验证码' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('更换邮箱会 cancel 当前 interaction，保留邮箱草稿并回到邮箱输入', async () => {
    const props = createProps();
    await reachCodeEntry(props);

    fireEvent.click(screen.getByRole('button', { name: '更换邮箱' }));

    expect(props.cancel).toHaveBeenCalledWith({ interactionToken: 'interaction-1' });
    expect(screen.getByLabelText('邮箱地址')).toHaveValue('user@example.com');
    expect(screen.queryByLabelText('验证码')).not.toBeInTheDocument();
  });

  it('关闭会中止请求、cancel pending 流程并忽略迟到响应，重新打开是干净邮箱页', async () => {
    let resolveStart: ((value: typeof challenge) => void) | undefined;
    let observedSignal: AbortSignal | undefined;
    const start = vi.fn(({ signal }: { email: string; signal: AbortSignal }) => {
      observedSignal = signal;
      return new Promise<typeof challenge>((resolve) => { resolveStart = resolve; });
    });
    const props = createProps({ start });
    const { rerender } = renderPanel(props);
    fireEvent.change(screen.getByLabelText('邮箱地址'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    rerender(<PanelHarness {...props} active={false} />);
    expect(observedSignal?.aborted).toBe(true);
    expect(props.cancel).toHaveBeenCalledWith({ interactionToken: null });
    await act(async () => resolveStart?.(challenge));
    expect(props.cancel).toHaveBeenCalledWith({ interactionToken: 'interaction-1' });
    expect(screen.queryByLabelText('验证码')).not.toBeInTheDocument();

    rerender(<PanelHarness {...props} active />);
    expect(screen.getByLabelText('邮箱地址')).toHaveValue('');
  });

  it('返回其他登录方式会先清理 headless 流程', () => {
    const props = createProps();
    renderPanel(props);

    fireEvent.click(screen.getByRole('button', { name: '返回其他登录方式' }));
    expect(props.cancel).toHaveBeenCalledWith({ interactionToken: null });
    expect(props.onBackToMethods).toHaveBeenCalledTimes(1);
  });

  it('英文环境覆盖标题、字段和动作，且不渲染额外跳转入口', async () => {
    await i18n.changeLanguage('en-US');
    const props = createProps();
    renderPanel(props);

    expect(screen.getByRole('heading', { name: 'Sign in with email' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send verification code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to sign-in methods' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
