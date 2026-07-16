import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dispatchMock = vi.hoisted(() => vi.fn());
const useAppSelectorMock = vi.hoisted(() => vi.fn());

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: useAppSelectorMock,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
}));

vi.mock('@/app/settings/SystemPrompt', () => ({
  default: () => <div>系统提示词设置</div>,
}));

vi.mock('@/app/settings/DataManagement', () => ({
  default: () => <div>数据管理内容</div>,
}));

vi.mock('@/app/settings/SearchUsageMonitor', () => ({
  default: () => <div>Firecrawl 用量面板</div>,
}));

vi.mock('@/app/settings/RuntimeConfigManager', () => ({
  default: () => <div>运行时配置管理面板</div>,
}));

vi.mock('@/app/settings/McpServerManager', () => ({
  default: () => <div>MCP 服务管理面板</div>,
}));

import { SettingsDialog } from './SettingsDialog';

function mockSettingsDialogState(isSuperuser: boolean, activeSettingsTab = 'general') {
  useAppSelectorMock.mockImplementation((selector) =>
    selector({
      settings: {
        isSettingsDialogOpen: true,
        activeSettingsTab,
      },
      theme: {
        mode: 'system',
      },
      auth: {
        user: {
          is_superuser: isSuperuser,
        },
      },
    })
  );
}

describe('SettingsDialog 管理员用量入口', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    useAppSelectorMock.mockReset();
  });

  it('普通用户不显示联网用量页签', () => {
    mockSettingsDialogState(false);

    render(<SettingsDialog />);

    expect(screen.queryByRole('tab', { name: /联网用量/ })).toBeNull();
  });

  it('普通用户残留联网用量选中状态时回退到常规设置', () => {
    mockSettingsDialogState(false, 'usage');

    render(<SettingsDialog />);

    expect(screen.queryByRole('tab', { name: /联网用量/ })).toBeNull();
    expect(screen.getByRole('tabpanel', { name: /常规设置/ })).toBeInTheDocument();
  });

  it('普通用户残留运行时配置选中状态时回退到常规设置', () => {
    mockSettingsDialogState(false, 'runtime-config');

    render(<SettingsDialog />);

    expect(screen.queryByRole('tab', { name: /运行时配置/ })).toBeNull();
    expect(screen.getByRole('tabpanel', { name: /常规设置/ })).toBeInTheDocument();
  });

  it('普通用户残留 MCP 服务选中状态时回退到常规设置', () => {
    mockSettingsDialogState(false, 'mcp-servers');

    render(<SettingsDialog />);

    expect(screen.queryByRole('tab', { name: /MCP 服务/ })).toBeNull();
    expect(screen.getByRole('tabpanel', { name: /常规设置/ })).toBeInTheDocument();
  });

  it('管理员在设置弹窗中可以看到联网用量页签', () => {
    mockSettingsDialogState(true);

    render(<SettingsDialog />);

    expect(screen.getByRole('tab', { name: /联网用量/ })).toBeInTheDocument();
  });

  it('管理员在设置弹窗中可以看到运行时配置页签', () => {
    mockSettingsDialogState(true);

    render(<SettingsDialog />);

    expect(screen.getByRole('tab', { name: /运行时配置/ })).toBeInTheDocument();
  });

  it('管理员在设置弹窗中可以看到 MCP 服务页签', () => {
    mockSettingsDialogState(true);

    render(<SettingsDialog />);

    expect(screen.getByRole('tab', { name: /MCP 服务/ })).toBeInTheDocument();
    expect(screen.getByTestId('settings-tabs-scroller')).toHaveClass('overflow-x-auto');
  });

  it('管理员切到联网用量页签时渲染额度面板', () => {
    mockSettingsDialogState(true, 'usage');

    render(<SettingsDialog />);

    expect(screen.getByText('Firecrawl 用量面板')).toBeInTheDocument();
  });

  it('管理员切到运行时配置页签时渲染管理面板', () => {
    mockSettingsDialogState(true, 'runtime-config');

    render(<SettingsDialog />);

    expect(screen.getByText('运行时配置管理面板')).toBeInTheDocument();
  });

  it('管理员切到 MCP 服务页签时渲染管理面板', () => {
    mockSettingsDialogState(true, 'mcp-servers');

    render(<SettingsDialog />);

    expect(screen.getByText('MCP 服务管理面板')).toBeInTheDocument();
  });
});
