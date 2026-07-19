import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const searchRefreshMock = vi.hoisted(() => vi.fn());
const emailRefreshMock = vi.hoisted(() => vi.fn());

vi.mock('./SearchUsageMonitor', async () => {
  const { useServiceUsageRefreshHandler } = await import('./serviceUsageRefresh');
  function MockSearchUsageMonitor() {
    useServiceUsageRefreshHandler('search', searchRefreshMock);
    return <div>Firecrawl 用量面板</div>;
  }
  return {
    default: MockSearchUsageMonitor,
  };
});

vi.mock('./EmailUsageMonitor', async () => {
  const { useServiceUsageRefreshHandler } = await import('./serviceUsageRefresh');
  function MockEmailUsageMonitor() {
    useServiceUsageRefreshHandler('email', emailRefreshMock);
    return <div>Resend 用量面板</div>;
  }
  return {
    default: MockEmailUsageMonitor,
  };
});

import ServiceUsagePanel from './ServiceUsagePanel';

describe('ServiceUsagePanel', () => {
  beforeEach(() => {
    searchRefreshMock.mockReset();
    emailRefreshMock.mockReset();
  });

  it('只展示一个右上角统一刷新按钮', () => {
    render(<ServiceUsagePanel />);

    expect(screen.getByText('Firecrawl 用量面板')).toBeInTheDocument();
    expect(screen.getByText('Resend 用量面板')).toBeInTheDocument();
    const panel = screen.getByTestId('service-usage-panel');
    expect(panel).toHaveClass('mx-auto', 'w-full', 'max-w-6xl');
    expect(screen.getByTestId('service-usage-grid')).toHaveClass(
      'grid',
      'grid-cols-1',
      'lg:grid-cols-2',
      'items-stretch',
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const button = screen.getByRole('button', { name: '刷新全部服务用量' });
    expect(button).toBeInTheDocument();
    expect(button.parentElement).toHaveClass('sticky', 'top-0', 'z-10');
    expect(screen.queryByRole('heading', { name: '服务用量' })).not.toBeInTheDocument();
  });

  it('并发刷新全部服务且单个失败不阻塞其余服务', async () => {
    let resolveEmail!: () => void;
    emailRefreshMock.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveEmail = resolve;
    }));
    searchRefreshMock.mockRejectedValueOnce(new Error('Firecrawl 刷新失败'));

    render(<ServiceUsagePanel />);
    const button = screen.getByRole('button', { name: '刷新全部服务用量' });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button.querySelector('svg')).toHaveClass('animate-spin');

    await waitFor(() => {
      expect(searchRefreshMock).toHaveBeenCalledTimes(1);
      expect(emailRefreshMock).toHaveBeenCalledTimes(1);
    });

    resolveEmail();
    await waitFor(() => expect(button).toBeEnabled());
  });
});
