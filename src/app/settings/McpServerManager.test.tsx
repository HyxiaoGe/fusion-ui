import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  create: vi.fn(),
  fetch: vi.fn(),
  refreshTools: vi.fn(),
  setEnabled: vi.fn(),
  testConnection: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/api/mcpServers', () => ({
  createMcpServerAPI: apiMocks.create,
  fetchMcpServersAPI: apiMocks.fetch,
  refreshMcpServerToolsAPI: apiMocks.refreshTools,
  setMcpServerEnabledAPI: apiMocks.setEnabled,
  testMcpServerConnectionAPI: apiMocks.testConnection,
  updateMcpServerAPI: apiMocks.update,
}));

import McpServerManager from './McpServerManager';

const server = {
  id: 'mcp-1',
  name: '高德地图',
  provider: 'amap',
  endpoint_url: 'https://mcp.amap.com/streamable-http/tenant/internal',
  transport: 'streamable_http' as const,
  auth_type: 'bearer' as const,
  credential_ref: 'AMAP_MCP_API_KEY',
  allowed_tools: ['maps_text_search'],
  is_enabled: true,
  health_status: 'healthy' as const,
  discovered_tools: [
    { name: 'maps_text_search', description: '关键词搜索' },
    { name: 'maps_around_search', description: '周边搜索' },
  ],
  last_checked_at: '2026-07-16T03:08:00Z',
  last_error_code: null,
  last_error_message: null,
};

describe('McpServerManager', () => {
  beforeEach(() => {
    Object.values(apiMocks).forEach((mock) => mock.mockReset());
    apiMocks.fetch.mockResolvedValue([server]);
  });

  it('加载期间保持稳定的管理区域占位', () => {
    apiMocks.fetch.mockReturnValue(new Promise(() => undefined));

    render(<McpServerManager />);

    expect(screen.getByRole('heading', { name: 'MCP 服务' })).toBeInTheDocument();
    expect(screen.getByText('正在加载 MCP 服务')).toBeInTheDocument();
  });

  it('展示服务状态、脱敏 endpoint、工具和最近检测结果', async () => {
    render(<McpServerManager />);

    const card = await screen.findByTestId('mcp-server-mcp-1');
    expect(within(card).getByText('高德地图')).toBeInTheDocument();
    expect(within(card).getByText('amap')).toBeInTheDocument();
    expect(within(card).getByText('连接健康')).toBeInTheDocument();
    expect(within(card).getByText('已启用')).toBeInTheDocument();
    expect(within(card).getByText('2 个已发现工具')).toBeInTheDocument();
    expect(within(card).getByText('已授权 1 个工具')).toBeInTheDocument();
    expect(within(card).getByText('maps_text_search')).toBeInTheDocument();
    expect(within(card).getByText(/https:\/\/mcp\.amap\.com\/.*tenant/)).toBeInTheDocument();
    expect(within(card).queryByText(server.endpoint_url)).not.toBeInTheDocument();
    expect(within(card).getByText(/最近检测/)).toBeInTheDocument();
  });

  it('无服务时展示可行动的空态', async () => {
    apiMocks.fetch.mockResolvedValue([]);

    render(<McpServerManager />);

    expect(await screen.findByText('还没有 MCP 服务')).toBeInTheDocument();
    expect(screen.getByText('添加第一个服务')).toBeInTheDocument();
  });

  it('已发现工具不会自动获得授权', async () => {
    apiMocks.fetch.mockResolvedValue([{ ...server, allowed_tools: [] }]);

    render(<McpServerManager />);

    const card = await screen.findByTestId('mcp-server-mcp-1');
    expect(within(card).getByText('2 个已发现工具')).toBeInTheDocument();
    expect(within(card).getByText('已授权 0 个工具')).toBeInTheDocument();
    expect(within(card).getByText('尚未设置白名单，不会向模型开放工具')).toBeInTheDocument();

    fireEvent.click(within(card).getByRole('button', { name: '编辑高德地图' }));
    expect(screen.getByRole('checkbox', { name: /maps_text_search/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /maps_around_search/ })).not.toBeChecked();
  });

  it('加载失败后可重试并恢复列表', async () => {
    apiMocks.fetch
      .mockRejectedValueOnce(new Error('服务暂不可用'))
      .mockResolvedValueOnce([server]);

    render(<McpServerManager />);

    expect(await screen.findByText('服务暂不可用')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重试/ }));

    expect(await screen.findByText('高德地图')).toBeInTheDocument();
    expect(apiMocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('刷新列表期间保留现有卡片，避免管理区域跳空', async () => {
    let resolveRefresh: ((value: typeof server[]) => void) | undefined;
    const refreshPromise = new Promise<typeof server[]>((resolve) => {
      resolveRefresh = resolve;
    });
    apiMocks.fetch
      .mockResolvedValueOnce([server])
      .mockReturnValueOnce(refreshPromise);

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(screen.getByRole('button', { name: '刷新列表' }));

    expect(card).toBeInTheDocument();
    expect(screen.queryByText('正在加载 MCP 服务')).toBeNull();

    resolveRefresh?.([server]);
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新列表' })).toBeEnabled());
  });

  it('严格模式下旧列表响应后到时不会覆盖最新结果', async () => {
    const staleServer = { ...server, name: '旧配置' };
    const latestServer = { ...server, name: '最新配置' };
    let resolveStale: ((value: typeof server[]) => void) | undefined;
    let resolveLatest: ((value: typeof server[]) => void) | undefined;
    apiMocks.fetch
      .mockReturnValueOnce(new Promise<typeof server[]>((resolve) => {
        resolveStale = resolve;
      }))
      .mockReturnValueOnce(new Promise<typeof server[]>((resolve) => {
        resolveLatest = resolve;
      }));

    render(<StrictMode><McpServerManager /></StrictMode>);
    await waitFor(() => expect(apiMocks.fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveLatest?.([latestServer]);
    });
    expect(await screen.findByText('最新配置')).toBeInTheDocument();

    await act(async () => {
      resolveStale?.([staleServer]);
    });
    expect(screen.getByText('最新配置')).toBeInTheDocument();
    expect(screen.queryByText('旧配置')).toBeNull();
  });

  it('表单不接收明文 secret，并校验 header 鉴权必填项', async () => {
    render(<McpServerManager />);
    await screen.findByText('高德地图');

    fireEvent.click(screen.getByRole('button', { name: '新增 MCP 服务' }));
    expect(screen.queryByLabelText(/secret|密钥|token/i)).toBeNull();
    expect(screen.getByText(/只保存环境变量名称，不会接收或保存明文密钥/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Streamable HTTP')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('服务名称'), { target: { value: '腾讯地图' } });
    fireEvent.change(screen.getByLabelText('提供商'), { target: { value: 'tencent' } });
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://mcp.tencent.com/mcp' } });
    fireEvent.change(screen.getByLabelText('鉴权方式'), { target: { value: 'header' } });
    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));

    expect(await screen.findByText('Header / Query 参数名不能为空')).toBeInTheDocument();
    expect(screen.getByText('凭证引用不能为空')).toBeInTheDocument();
    expect(apiMocks.create).not.toHaveBeenCalled();
  });

  it('新建服务不允许填写未发现工具并固定提交空白名单', async () => {
    apiMocks.create.mockResolvedValue({ ...server, id: 'mcp-2', name: '腾讯地图' });

    render(<McpServerManager />);
    await screen.findByText('高德地图');
    fireEvent.click(screen.getByRole('button', { name: '新增 MCP 服务' }));

    fireEvent.change(screen.getByLabelText('服务名称'), { target: { value: '腾讯地图' } });
    fireEvent.change(screen.getByLabelText('提供商'), { target: { value: 'tencent' } });
    fireEvent.change(screen.getByLabelText('Endpoint URL'), { target: { value: 'https://mcp.tencent.com/mcp' } });
    fireEvent.change(screen.getByLabelText('鉴权方式'), { target: { value: 'bearer' } });
    fireEvent.change(screen.getByLabelText('凭证引用'), { target: { value: 'TENCENT_MCP_TOKEN' } });
    expect(screen.queryByRole('textbox', { name: '允许工具' })).toBeNull();
    expect(screen.getByText(/新建服务默认不授权任何工具/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));

    await waitFor(() => expect(apiMocks.create).toHaveBeenCalledWith({
      name: '腾讯地图',
      provider: 'tencent',
      endpoint_url: 'https://mcp.tencent.com/mcp',
      transport: 'streamable_http',
      auth_type: 'bearer',
      auth_name: null,
      credential_ref: 'TENCENT_MCP_TOKEN',
      allowed_tools: [],
    }));
    expect(apiMocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('切换为无鉴权时显式清空旧凭证字段', async () => {
    apiMocks.update.mockResolvedValue({
      ...server,
      auth_type: 'none',
      credential_ref: null,
    });

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(card).getByRole('button', { name: '编辑高德地图' }));
    fireEvent.change(screen.getByLabelText('鉴权方式'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));

    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith(
      'mcp-1',
      expect.objectContaining({
        auth_type: 'none',
        auth_name: null,
        credential_ref: null,
      }),
    ));
  });

  it('连接配置变化后立即停用旧工具选择并提交空白名单', async () => {
    apiMocks.update.mockResolvedValue({
      ...server,
      endpoint_url: 'https://mcp.amap.com/new-mcp',
      allowed_tools: [],
      discovered_tools: [],
    });

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(card).getByRole('button', { name: '编辑高德地图' }));
    expect(screen.getByRole('checkbox', { name: /maps_text_search/ })).toBeChecked();

    fireEvent.change(screen.getByLabelText('Endpoint URL'), {
      target: { value: 'https://mcp.amap.com/new-mcp' },
    });

    expect(screen.queryByRole('checkbox', { name: /maps_text_search/ })).toBeNull();
    expect(screen.getByText(/保存时会清空旧授权/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));

    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith(
      'mcp-1',
      expect.objectContaining({ allowed_tools: [] }),
    ));
  });

  it('管理写操作全局串行，进行中不会启动第二个服务操作', async () => {
    const secondServer = { ...server, id: 'mcp-2', name: '腾讯地图' };
    let resolveStatus: ((value: typeof server) => void) | undefined;
    const statusPromise = new Promise<typeof server>((resolve) => {
      resolveStatus = resolve;
    });
    apiMocks.fetch.mockResolvedValue([server, secondServer]);
    apiMocks.setEnabled.mockReturnValue(statusPromise);

    render(<McpServerManager />);
    const firstCard = await screen.findByTestId('mcp-server-mcp-1');
    const secondCard = await screen.findByTestId('mcp-server-mcp-2');
    fireEvent.click(within(firstCard).getByRole('switch', { name: '停用高德地图' }));

    await waitFor(() => expect(apiMocks.setEnabled).toHaveBeenCalledTimes(1));
    const secondSwitch = within(secondCard).getByRole('switch', { name: '停用腾讯地图' });
    expect(secondSwitch).toBeDisabled();
    fireEvent.click(secondSwitch);
    expect(apiMocks.setEnabled).toHaveBeenCalledTimes(1);

    resolveStatus?.(server);
    await waitFor(() => expect(secondSwitch).toBeEnabled());
  });

  it('历史失效白名单项可以取消但不能新增任意工具', async () => {
    apiMocks.fetch.mockResolvedValue([{
      ...server,
      allowed_tools: ['retired_tool'],
    }]);
    apiMocks.update.mockResolvedValue({ ...server, allowed_tools: [] });

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(card).getByRole('button', { name: '编辑高德地图' }));

    const retiredTool = screen.getByRole('checkbox', { name: /retired_tool.*当前未被远端服务发现/ });
    expect(retiredTool).toBeChecked();
    expect(screen.queryByRole('textbox', { name: '允许工具' })).toBeNull();
    fireEvent.click(retiredTool);
    expect(screen.queryByRole('checkbox', { name: /retired_tool/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));

    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith(
      'mcp-1',
      expect.objectContaining({ allowed_tools: [] }),
    ));
  });

  it('编辑、启停、测试和刷新工具均调用对应 API 后恢复最新列表', async () => {
    apiMocks.update.mockResolvedValue(server);
    apiMocks.setEnabled.mockResolvedValue({ ...server, is_enabled: false });
    apiMocks.testConnection.mockResolvedValue({ success: true });
    apiMocks.refreshTools.mockResolvedValue(server);

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-1');

    fireEvent.click(within(card).getByRole('button', { name: '编辑高德地图' }));
    expect(screen.getByText(/旧的工具发现结果和授权会失效/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /maps_text_search/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /maps_around_search/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: /maps_around_search/ }));
    fireEvent.change(screen.getByLabelText('服务名称'), { target: { value: '高德地图 MCP' } });
    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith(
      'mcp-1',
      expect.objectContaining({
        allowed_tools: ['maps_text_search', 'maps_around_search'],
      }),
    ));

    let currentCard = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(currentCard).getByRole('switch', { name: '停用高德地图' }));
    await waitFor(() => expect(apiMocks.setEnabled).toHaveBeenCalledWith('mcp-1', false));

    currentCard = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(currentCard).getByRole('button', { name: '测试高德地图连接' }));
    await waitFor(() => expect(apiMocks.testConnection).toHaveBeenCalledWith('mcp-1'));

    currentCard = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(currentCard).getByRole('button', { name: '刷新高德地图工具' }));

    await waitFor(() => {
      expect(apiMocks.refreshTools).toHaveBeenCalledWith('mcp-1');
    });
    expect(screen.queryByText('执行失败')).not.toBeInTheDocument();
  });

  it('操作失败展示可理解错误，重新刷新后恢复', async () => {
    apiMocks.testConnection.mockRejectedValueOnce(new Error('鉴权失败，请检查凭证引用'));

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(card).getByRole('button', { name: '测试高德地图连接' }));

    expect(await screen.findByText('鉴权失败，请检查凭证引用')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '刷新列表' }));
    await waitFor(() => expect(apiMocks.fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('鉴权失败，请检查凭证引用')).toBeNull();
  });
});
