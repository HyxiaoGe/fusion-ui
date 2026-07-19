import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchEmailUsageMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/emailUsage', () => ({
  fetchEmailUsageAPI: fetchEmailUsageMock,
}));

import EmailUsageMonitor from './EmailUsageMonitor';
import { createServiceUsageRefreshRegistry, ServiceUsageRefreshProvider } from './serviceUsageRefresh';

const availableUsage = {
  provider: 'resend',
  configured: true,
  available: true,
  used_emails: 1250,
  monthly_quota: 3000,
  remaining_emails: 1750,
  usage_ratio: 0.4167,
  daily_used_emails: 18,
  daily_quota: 100,
  period_start: '2026-07-01T00:00:00Z',
  period_end: '2026-07-31T23:59:59.999999Z',
  synced_at: '2026-07-19T02:03:04Z',
  source: 'resend_response_headers',
};

describe('EmailUsageMonitor', () => {
  let now = Date.UTC(2026, 6, 19, 3, 0, 0);

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchEmailUsageMock.mockReset();
    window.localStorage.clear();
    now += 61_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  it('请求未完成时展示加载状态', () => {
    fetchEmailUsageMock.mockReturnValue(new Promise(() => {}));

    const { container } = render(<EmailUsageMonitor />);

    expect(screen.getByText('正在加载 Resend 用量')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it('请求失败时展示错误但不提供卡片级重试', async () => {
    fetchEmailUsageMock.mockRejectedValueOnce(new Error('邮件用量查询失败'));

    const { container } = render(<EmailUsageMonitor />);

    expect(await screen.findByText('邮件用量查询失败')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试 Resend 用量查询' })).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it('未配置 Resend 时展示未配置状态', async () => {
    fetchEmailUsageMock.mockResolvedValue({
      ...availableUsage,
      configured: false,
      available: false,
      synced_at: null,
      source: 'not_configured',
    });

    const { container } = render(<EmailUsageMonitor />);

    expect(await screen.findByText('Resend API 用量采集尚未配置')).toBeInTheDocument();
    expect(screen.getByText('auth-service 尚未启用 Resend Email API 用量采集；现有 SMTP 发送不受影响。')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it('已配置但尚未同步时展示独立状态', async () => {
    fetchEmailUsageMock.mockResolvedValue({
      ...availableUsage,
      configured: true,
      available: false,
      used_emails: null,
      monthly_quota: null,
      remaining_emails: null,
      usage_ratio: null,
      synced_at: null,
      source: 'not_synced',
    });

    render(<EmailUsageMonitor />);

    expect(await screen.findByText('Resend 用量尚未同步')).toBeInTheDocument();
    expect(screen.getByText('Resend Email API 已配置，等待首次成功投递后同步官方用量快照。')).toBeInTheDocument();
  });

  it('未同步状态保持单卡，并可通过统一刷新恢复', async () => {
    fetchEmailUsageMock
      .mockResolvedValueOnce({
        ...availableUsage,
        available: false,
        used_emails: null,
        monthly_quota: null,
        remaining_emails: null,
        usage_ratio: null,
        synced_at: null,
        source: 'not_synced',
      })
      .mockResolvedValueOnce(availableUsage);

    const registry = createServiceUsageRefreshRegistry();
    const { container } = render(
      <ServiceUsageRefreshProvider registry={registry}>
        <EmailUsageMonitor />
      </ServiceUsageRefreshProvider>
    );

    expect(await screen.findByText('Resend 用量尚未同步')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);

    await act(async () => {
      await registry.refreshAll();
    });

    expect(await screen.findByTestId('email-monthly-usage')).toHaveTextContent('1,250 / 3,000封');
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it('紧凑展示已用额度、进度及弱化的辅助信息', async () => {
    fetchEmailUsageMock.mockResolvedValue(availableUsage);

    render(<EmailUsageMonitor />);

    expect(await screen.findByText('Resend 邮件用量')).toBeInTheDocument();
    expect(screen.getByTestId('email-usage-card')).toHaveClass('h-full', 'border-border');
    expect(screen.getByTestId('email-usage-card')).not.toHaveClass('h-fit', 'border-muted');
    expect(screen.getByText('本月已用 / 月度额度')).toBeInTheDocument();
    expect(screen.getByTestId('email-monthly-usage')).toHaveTextContent('1,250 / 3,000封');
    expect(screen.getByText('已使用 41.7%')).toBeInTheDocument();
    expect(screen.getByTestId('email-remaining-usage')).toHaveTextContent('剩余 1,750 封');
    expect(screen.getByTestId('email-daily-usage')).toHaveTextContent('今日 18 / 100 封');
    expect(screen.getByText('账期 2026/07/01 - 2026/07/31')).toBeInTheDocument();
    expect(screen.getByText('最后同步 2026/07/19 10:03:04')).toBeInTheDocument();
    expect(screen.queryByText('官方用量快照 + 配置额度')).not.toBeInTheDocument();
  });

  it('当日用量缺失时不展示当日区块', async () => {
    fetchEmailUsageMock.mockResolvedValue({
      ...availableUsage,
      daily_used_emails: null,
      daily_quota: null,
    });

    render(<EmailUsageMonitor />);

    expect(await screen.findByText('Resend 邮件用量')).toBeInTheDocument();
    expect(screen.queryByText(/今日/)).not.toBeInTheDocument();
  });

  it('60 秒内按登录用户复用缓存', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchEmailUsageMock.mockResolvedValue(availableUsage);

    const { unmount } = render(<EmailUsageMonitor />);
    expect(await screen.findByTestId('email-monthly-usage')).toHaveTextContent('1,250 / 3,000封');
    unmount();
    render(<EmailUsageMonitor />);

    expect(screen.getByTestId('email-monthly-usage')).toHaveTextContent('1,250 / 3,000封');
    expect(fetchEmailUsageMock).toHaveBeenCalledTimes(1);
  });

  it('登录用户变化时不复用上一用户缓存', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchEmailUsageMock
      .mockResolvedValueOnce(availableUsage)
      .mockResolvedValueOnce({ ...availableUsage, used_emails: 99 });

    const { unmount } = render(<EmailUsageMonitor />);
    expect(await screen.findByTestId('email-monthly-usage')).toHaveTextContent('1,250 / 3,000封');
    unmount();
    window.localStorage.setItem('user_profile', '{"id":"admin-b"}');
    render(<EmailUsageMonitor />);

    await waitFor(() => expect(screen.getByTestId('email-monthly-usage')).toHaveTextContent('99 / 3,000封'));
    expect(fetchEmailUsageMock).toHaveBeenCalledTimes(2);
  });

  it('缓存满 60 秒后重新请求', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchEmailUsageMock
      .mockResolvedValueOnce(availableUsage)
      .mockResolvedValueOnce({ ...availableUsage, used_emails: 88 });

    const { unmount } = render(<EmailUsageMonitor />);
    expect(await screen.findByTestId('email-monthly-usage')).toHaveTextContent('1,250 / 3,000封');
    unmount();
    now += 60_001;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    render(<EmailUsageMonitor />);

    await waitFor(() => expect(screen.getByTestId('email-monthly-usage')).toHaveTextContent('88 / 3,000封'));
    expect(fetchEmailUsageMock).toHaveBeenCalledTimes(2);
  });

  it('错误结果不会写入缓存', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchEmailUsageMock
      .mockRejectedValueOnce(new Error('邮件用量查询失败'))
      .mockResolvedValueOnce(availableUsage);

    const first = render(<EmailUsageMonitor />);
    expect(await screen.findByText('邮件用量查询失败')).toBeInTheDocument();
    first.unmount();
    render(<EmailUsageMonitor />);

    await waitFor(() => expect(fetchEmailUsageMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('email-monthly-usage')).toHaveTextContent('1,250 / 3,000封');
  });

  it('统一刷新会绕过当前用户缓存重新请求且卡片不再提供刷新按钮', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchEmailUsageMock
      .mockResolvedValueOnce(availableUsage)
      .mockResolvedValueOnce({ ...availableUsage, used_emails: 77 });

    const registry = createServiceUsageRefreshRegistry();
    render(
      <ServiceUsageRefreshProvider registry={registry}>
        <EmailUsageMonitor />
      </ServiceUsageRefreshProvider>
    );
    expect(await screen.findByTestId('email-monthly-usage')).toHaveTextContent('1,250 / 3,000封');
    expect(screen.queryByRole('button', { name: '刷新 Resend 用量' })).not.toBeInTheDocument();

    await act(async () => {
      await registry.refreshAll();
    });

    await waitFor(() => expect(screen.getByTestId('email-monthly-usage')).toHaveTextContent('77 / 3,000封'));
    expect(fetchEmailUsageMock).toHaveBeenCalledTimes(2);
  });
});
