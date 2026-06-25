import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSearchUsageMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/searchUsage', () => ({
  fetchSearchUsageAPI: fetchSearchUsageMock,
}));

import SearchUsageMonitor from './SearchUsageMonitor';

describe('SearchUsageMonitor', () => {
  beforeEach(() => {
    fetchSearchUsageMock.mockReset();
  });

  it('展示 Firecrawl 当前余额、账期和历史消耗', async () => {
    fetchSearchUsageMock.mockResolvedValue({
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
    });

    render(<SearchUsageMonitor />);

    await waitFor(() => expect(fetchSearchUsageMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('84,833')).toBeInTheDocument();
    expect(screen.getByText('500,000')).toBeInTheDocument();
    expect(screen.getByText('已用 83.0%')).toBeInTheDocument();
    expect(screen.getByText('2026/06/01 - 2026/06/30')).toBeInTheDocument();
    expect(screen.getByText('历史消耗 128 credits')).toBeInTheDocument();
    expect(screen.getByText('Brave 暂无官方余额接口，当前只展示 Firecrawl 官方余额。')).toBeInTheDocument();
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
});
