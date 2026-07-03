import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAppSelectorMock = vi.hoisted(() => vi.fn());

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/components/layouts/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock('./SystemPrompt', () => ({
  default: () => <div>AI 个性化内容</div>,
}));

vi.mock('./DataManagement', () => ({
  default: () => <div>数据管理内容</div>,
}));

vi.mock('./SearchUsageMonitor', () => ({
  default: () => <div>Firecrawl 用量</div>,
}));

vi.mock('./RuntimeConfigManager', () => ({
  default: () => <div>运行时配置管理面板</div>,
}));

import SettingsPage from './page';

function setAdmin(isSuperuser: boolean) {
  useAppSelectorMock.mockImplementation((selector) =>
    selector({
      auth: {
        user: {
          is_superuser: isSuperuser,
        },
      },
    })
  );
}

describe('SettingsPage 管理员页签', () => {
  beforeEach(() => {
    useAppSelectorMock.mockReset();
  });

  it('普通用户不显示联网用量页签', () => {
    setAdmin(false);

    render(<SettingsPage />);

    expect(screen.queryByRole('tab', { name: /联网用量/ })).toBeNull();
  });

  it('普通用户不显示运行时配置页签', () => {
    setAdmin(false);

    render(<SettingsPage />);

    expect(screen.queryByRole('tab', { name: /运行时配置/ })).toBeNull();
  });

  it('管理员显示联网用量页签', () => {
    setAdmin(true);

    render(<SettingsPage />);

    expect(screen.getByText('联网用量')).toBeInTheDocument();
  });

  it('管理员显示运行时配置页签', () => {
    setAdmin(true);

    render(<SettingsPage />);

    expect(screen.getByRole('tab', { name: /运行时配置/ })).toBeInTheDocument();
  });
});
