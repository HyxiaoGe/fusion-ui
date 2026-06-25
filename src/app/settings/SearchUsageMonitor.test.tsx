import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSearchUsageMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/searchUsage', () => ({
  fetchSearchUsageAPI: fetchSearchUsageMock,
}));

import SearchUsageMonitor from './SearchUsageMonitor';

const makeUsageOverview = (overrides = {}) => ({
  generated_at: '2026-06-25T03:00:00Z',
  providers: [
    { provider: 'firecrawl', official_usage: true },
    { provider: 'brave', official_usage: false },
  ],
  firecrawl: {
    provider: 'firecrawl',
    available: true,
    remaining_credits: 84833,
    plan_credits: 500000,
    used_credits: 415167,
    usage_ratio: 0.830334,
    billing_period_start: '2026-06-01T00:00:00Z',
    billing_period_end: '2026-06-30T23:59:59Z',
    recorded_usage: {
      provider: 'firecrawl',
      available: true,
      credits_used: 12,
      request_count: 3,
      period_start: '2026-06-01T00:00:00Z',
      period_end: '2026-06-30T23:59:59Z',
      source: 'search_response_credits_used',
    },
  },
  historical: {
    provider: 'firecrawl',
    available: true,
    by_api_key: false,
    periods: [
      {
        start_date: '2026-06-01T00:00:00Z',
        end_date: '2026-06-30T23:59:59Z',
        api_key: null,
        total_credits: 128,
      },
    ],
  },
  ...overrides,
});

describe('SearchUsageMonitor', () => {
  let now = Date.UTC(2026, 5, 25, 3, 0, 0);

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchSearchUsageMock.mockReset();
    window.localStorage.clear();
    now += 61_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  it('展示 Firecrawl 当前余额、账期和历史消耗', async () => {
    fetchSearchUsageMock.mockResolvedValue(makeUsageOverview());

    render(<SearchUsageMonitor />);

    await waitFor(() => expect(fetchSearchUsageMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('84,833')).toBeInTheDocument();
    expect(screen.getByText('500,000')).toBeInTheDocument();
    expect(screen.getByText('本系统记录消耗')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3 次 Firecrawl 请求')).toBeInTheDocument();
    expect(screen.getByText('官方已用 83.0%')).toBeInTheDocument();
    expect(screen.getByText('2026/06/01 - 2026/06/30')).toBeInTheDocument();
    expect(screen.getByText('官方历史消耗')).toBeInTheDocument();
    expect(screen.getByText('2026/06')).toBeInTheDocument();
    expect(screen.getByText('128 credits')).toBeInTheDocument();
    expect(screen.getByText('当前展示 Firecrawl 官方余额和本系统 Firecrawl 调用记录。')).toBeInTheDocument();
  });

  it('Firecrawl key 未配置时展示不可用状态', async () => {
    fetchSearchUsageMock.mockResolvedValue({
      generated_at: '2026-06-25T03:00:00Z',
      providers: [{ provider: 'firecrawl', official_usage: true }],
      firecrawl: {
        provider: 'firecrawl',
        available: false,
      },
      historical: {
        provider: 'firecrawl',
        available: false,
        by_api_key: false,
        periods: [],
      },
    });

    render(<SearchUsageMonitor />);

    expect(await screen.findByText('Firecrawl 用量暂不可用')).toBeInTheDocument();
  });

  it('系统记录缺失时展示记录暂不可用', async () => {
    fetchSearchUsageMock.mockResolvedValue(makeUsageOverview({
      firecrawl: {
        provider: 'firecrawl',
        available: true,
        remaining_credits: 84833,
        plan_credits: 1000,
        used_credits: null,
        usage_ratio: null,
        billing_period_start: '2026-06-22T00:00:00Z',
        billing_period_end: '2026-07-22T00:00:00Z',
        recorded_usage: null,
      },
      historical: {
        provider: 'firecrawl',
        available: true,
        by_api_key: false,
        periods: [],
      },
    }));

    render(<SearchUsageMonitor />);

    expect(await screen.findByText('本系统记录消耗')).toBeInTheDocument();
    expect(screen.getByText('记录暂不可用')).toBeInTheDocument();
  });

  it('官方历史不可用时展示暂不可用文案', async () => {
    fetchSearchUsageMock.mockResolvedValue(makeUsageOverview({
      historical: {
        provider: 'firecrawl',
        available: false,
        by_api_key: false,
        periods: [],
      },
    }));

    render(<SearchUsageMonitor />);

    const history = await screen.findByTestId('search-usage-history');
    expect(within(history).getByText('官方历史暂不可用')).toBeInTheDocument();
    expect(within(history).queryByText('官方历史暂无数据')).not.toBeInTheDocument();
  });

  it('官方历史可用但没有 periods 时展示暂无数据文案', async () => {
    fetchSearchUsageMock.mockResolvedValue(makeUsageOverview({
      historical: {
        provider: 'firecrawl',
        available: true,
        by_api_key: false,
        periods: [],
      },
    }));

    render(<SearchUsageMonitor />);

    const history = await screen.findByTestId('search-usage-history');
    expect(within(history).getByText('官方历史暂无数据')).toBeInTheDocument();
    expect(within(history).queryByText('官方历史暂不可用')).not.toBeInTheDocument();
  });

  it('按 start_date 倒序展示最近 6 条官方历史消耗', async () => {
    fetchSearchUsageMock.mockResolvedValue(makeUsageOverview({
      historical: {
        provider: 'firecrawl',
        available: true,
        by_api_key: false,
        periods: [
          { start_date: '2026-01-01T00:00:00Z', end_date: '2026-01-31T23:59:59Z', total_credits: 10 },
          { start_date: '2026-03-01T00:00:00Z', end_date: '2026-03-31T23:59:59Z', total_credits: 30 },
          { start_date: '2026-02-01T00:00:00Z', end_date: '2026-02-28T23:59:59Z', total_credits: 20 },
          { start_date: '2026-05-01T00:00:00Z', end_date: '2026-05-31T23:59:59Z', total_credits: 50 },
          { start_date: '2026-04-01T00:00:00Z', end_date: '2026-04-30T23:59:59Z', total_credits: 40 },
          { start_date: '2025-12-01T00:00:00Z', end_date: '2025-12-31T23:59:59Z', total_credits: 5 },
          { start_date: '2026-06-01T00:00:00Z', end_date: '2026-06-30T23:59:59Z', total_credits: 60 },
        ],
      },
    }));

    render(<SearchUsageMonitor />);

    const history = await screen.findByTestId('search-usage-history');
    const items = within(history).getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual([
      '2026/0660 credits',
      '2026/0550 credits',
      '2026/0440 credits',
      '2026/0330 credits',
      '2026/0220 credits',
      '2026/0110 credits',
    ]);
    expect(screen.queryByText('2025/12')).not.toBeInTheDocument();
  });

  it('重新挂载时使用未过期会话缓存，不重复请求接口', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchSearchUsageMock.mockResolvedValue(makeUsageOverview());

    const { unmount } = render(<SearchUsageMonitor />);
    expect(await screen.findByText('84,833')).toBeInTheDocument();
    await waitFor(() => expect(fetchSearchUsageMock).toHaveBeenCalledTimes(1));

    unmount();
    render(<SearchUsageMonitor />);

    expect(screen.getByText('84,833')).toBeInTheDocument();
    expect(fetchSearchUsageMock).toHaveBeenCalledTimes(1);
  });

  it('登录用户变化时不复用上一个用户的会话缓存', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchSearchUsageMock
      .mockResolvedValueOnce(makeUsageOverview())
      .mockResolvedValueOnce(makeUsageOverview({
        firecrawl: {
          ...makeUsageOverview().firecrawl,
          remaining_credits: 66666,
        },
      }));

    const { unmount } = render(<SearchUsageMonitor />);
    expect(await screen.findByText('84,833')).toBeInTheDocument();

    unmount();
    window.localStorage.setItem('user_profile', '{"id":"admin-b"}');
    render(<SearchUsageMonitor />);

    expect(await screen.findByText('66,666')).toBeInTheDocument();
    expect(fetchSearchUsageMock).toHaveBeenCalledTimes(2);
  });

  it('缓存过期后重新挂载会再次请求接口', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchSearchUsageMock
      .mockResolvedValueOnce(makeUsageOverview())
      .mockResolvedValueOnce(makeUsageOverview({
        firecrawl: {
          ...makeUsageOverview().firecrawl,
          remaining_credits: 55555,
        },
      }));

    const { unmount } = render(<SearchUsageMonitor />);
    expect(await screen.findByText('84,833')).toBeInTheDocument();

    unmount();
    now += 60_001;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    render(<SearchUsageMonitor />);

    expect(await screen.findByText('55,555')).toBeInTheDocument();
    expect(fetchSearchUsageMock).toHaveBeenCalledTimes(2);
  });

  it('请求失败不会写入会话缓存', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchSearchUsageMock
      .mockRejectedValueOnce(new Error('联网用量查询失败'))
      .mockResolvedValueOnce(makeUsageOverview());

    const { unmount } = render(<SearchUsageMonitor />);
    expect(await screen.findByText('联网用量查询失败')).toBeInTheDocument();

    unmount();
    render(<SearchUsageMonitor />);

    expect(await screen.findByText('84,833')).toBeInTheDocument();
    expect(fetchSearchUsageMock).toHaveBeenCalledTimes(2);
  });

  it('点击刷新按钮会绕过会话缓存重新请求接口', async () => {
    window.localStorage.setItem('user_profile', '{"id":"admin-a"}');
    fetchSearchUsageMock
      .mockResolvedValueOnce(makeUsageOverview())
      .mockResolvedValueOnce(makeUsageOverview({
        firecrawl: {
          ...makeUsageOverview().firecrawl,
          remaining_credits: 77777,
        },
      }));

    render(<SearchUsageMonitor />);
    expect(await screen.findByText('84,833')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '刷新联网用量' }));

    expect(await screen.findByText('77,777')).toBeInTheDocument();
    expect(fetchSearchUsageMock).toHaveBeenCalledTimes(2);
  });
});
