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

const recommendedAmapReadOnlyTools = [
  'maps_geo',
  'maps_regeocode',
  'maps_weather',
  'maps_direction_bicycling',
  'maps_direction_walking',
  'maps_direction_driving',
  'maps_direction_transit_integrated',
  'maps_distance',
  'maps_text_search',
  'maps_around_search',
  'maps_search_detail',
];

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

  it('高德安全预设只填写凭证引用，不把 key 放进 endpoint 或表单', async () => {
    apiMocks.create.mockResolvedValue({
      ...server,
      endpoint_url: 'https://mcp.amap.com/mcp',
      auth_type: 'query',
      auth_name: 'key',
      allowed_tools: [],
    });

    render(<McpServerManager />);
    await screen.findByText('高德地图');
    fireEvent.click(screen.getByRole('button', { name: '新增 MCP 服务' }));
    fireEvent.click(screen.getByRole('button', { name: '使用高德安全预设' }));

    expect(screen.getByLabelText('服务名称')).toHaveValue('高德地图');
    expect(screen.getByLabelText('提供商')).toHaveValue('amap');
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://mcp.amap.com/mcp');
    expect(screen.getByLabelText('Endpoint URL')).not.toHaveValue(expect.stringContaining('?'));
    expect(screen.getByLabelText('鉴权方式')).toHaveValue('query');
    expect(screen.getByLabelText('Header / Query 参数名')).toHaveValue('key');
    expect(screen.getByLabelText('凭证引用')).toHaveValue('AMAP_MCP_API_KEY');
    expect(screen.queryByLabelText(/API Key|明文密钥|secret|token/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));

    await waitFor(() => expect(apiMocks.create).toHaveBeenCalledWith({
      name: '高德地图',
      provider: 'amap',
      endpoint_url: 'https://mcp.amap.com/mcp',
      transport: 'streamable_http',
      auth_type: 'query',
      auth_name: 'key',
      credential_ref: 'AMAP_MCP_API_KEY',
      allowed_tools: [],
    }));
  });

  it('Context7 技术文档预设默认免密并提交空工具白名单', async () => {
    apiMocks.create.mockResolvedValue({
      ...server,
      id: 'mcp-context7',
      name: 'Context7 技术文档',
      provider: 'context7',
      endpoint_url: 'https://mcp.context7.com/mcp',
      auth_type: 'none',
      auth_name: null,
      credential_ref: null,
      allowed_tools: [],
      discovered_tools: [],
    });

    render(<McpServerManager />);
    await screen.findByText('高德地图');
    fireEvent.click(screen.getByRole('button', { name: '新增 MCP 服务' }));
    fireEvent.click(screen.getByRole('button', { name: '使用 Context7 技术文档预设' }));

    expect(screen.getByLabelText('服务名称')).toHaveValue('Context7 技术文档');
    expect(screen.getByLabelText('提供商')).toHaveValue('context7');
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://mcp.context7.com/mcp');
    expect(screen.getByLabelText('鉴权方式')).toHaveValue('none');
    expect(screen.queryByLabelText('Header / Query 参数名')).toBeNull();
    expect(screen.queryByLabelText('凭证引用')).toBeNull();
    expect(screen.queryByLabelText(/API Key|明文密钥|secret|token/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));

    await waitFor(() => expect(apiMocks.create).toHaveBeenCalledWith({
      name: 'Context7 技术文档',
      provider: 'context7',
      endpoint_url: 'https://mcp.context7.com/mcp',
      transport: 'streamable_http',
      auth_type: 'none',
      auth_name: null,
      credential_ref: null,
      allowed_tools: [],
    }));
  });

  it('免密 Context7 官方配置仍显示推荐文档工具', async () => {
    const context7Server = {
      ...server,
      id: 'mcp-context7-no-auth',
      name: 'Context7 技术文档',
      provider: 'context7',
      endpoint_url: 'https://mcp.context7.com/mcp',
      auth_type: 'none' as const,
      auth_name: null,
      credential_ref: null,
      allowed_tools: [],
      discovered_tools: [
        { name: 'resolve-library-id', description: '解析技术文档库 ID' },
        { name: 'query-docs', description: '查询最新技术文档' },
      ],
    };
    apiMocks.fetch.mockResolvedValue([context7Server]);

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-context7-no-auth');
    fireEvent.click(within(card).getByRole('button', { name: '编辑Context7 技术文档' }));

    expect(screen.getByRole('button', { name: '一键选择推荐文档工具' })).toBeInTheDocument();
  });

  it('Context7 官方 hostname 尾点不会隐藏推荐文档工具', async () => {
    const context7Server = {
      ...server,
      id: 'mcp-context7-dot',
      name: 'Context7 技术文档',
      provider: 'context7',
      endpoint_url: 'https://mcp.context7.com./mcp',
      auth_type: 'none' as const,
      auth_name: null,
      credential_ref: null,
      allowed_tools: [],
      discovered_tools: [
        { name: 'resolve-library-id', description: '解析技术文档库 ID' },
        { name: 'query-docs', description: '查询最新技术文档' },
      ],
    };
    apiMocks.fetch.mockResolvedValue([context7Server]);

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-context7-dot');
    fireEvent.click(within(card).getByRole('button', { name: '编辑Context7 技术文档' }));

    expect(screen.getByRole('button', { name: '一键选择推荐文档工具' })).toBeInTheDocument();
  });

  it('编辑已发现高德服务时一键只选择发现快照中的推荐只读工具', async () => {
    const discoveredRecommendedTools = recommendedAmapReadOnlyTools.filter(
      (name) => name !== 'maps_weather',
    );
    const discoveredTools = [
      ...discoveredRecommendedTools.map((name) => ({ name, description: `只读工具 ${name}` })),
      { name: 'maps_ip_location', description: 'IP 定位未列入推荐集合' },
      { name: 'maps_schema_personal_map', description: '生成专属地图' },
    ];
    apiMocks.fetch.mockResolvedValue([{
      ...server,
      allowed_tools: ['maps_schema_personal_map'],
      discovered_tools: discoveredTools,
    }]);
    apiMocks.update.mockResolvedValue(server);

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(card).getByRole('button', { name: '编辑高德地图' }));
    fireEvent.click(screen.getByRole('button', { name: '一键选择推荐只读工具' }));

    discoveredRecommendedTools.forEach((toolName) => {
      expect(screen.getByRole('checkbox', { name: new RegExp(toolName) })).toBeChecked();
    });
    expect(screen.queryByRole('checkbox', { name: /maps_weather/ })).toBeNull();
    expect(screen.getByRole('checkbox', { name: /maps_ip_location/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /maps_schema_personal_map/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith(
      'mcp-1',
      expect.objectContaining({ allowed_tools: discoveredRecommendedTools }),
    ));
  });

  it('编辑 Context7 服务时一键只选择已发现的两个推荐文档工具', async () => {
    const context7Server = {
      ...server,
      id: 'mcp-context7',
      name: 'Context7 技术文档',
      provider: 'context7',
      endpoint_url: 'https://mcp.context7.com/mcp',
      auth_type: 'header' as const,
      auth_name: 'CONTEXT7_API_KEY',
      credential_ref: 'CONTEXT7_API_KEY',
      allowed_tools: ['provider_future_tool'],
      discovered_tools: [
        { name: 'resolve-library-id', description: '解析技术文档库 ID' },
        { name: 'query-docs', description: '查询最新技术文档' },
        { name: 'provider_future_tool', description: '未进入推荐集合的新工具' },
      ],
    };
    apiMocks.fetch.mockResolvedValue([context7Server]);
    apiMocks.update.mockResolvedValue(context7Server);

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-context7');
    fireEvent.click(within(card).getByRole('button', { name: '编辑Context7 技术文档' }));
    fireEvent.click(screen.getByRole('button', { name: '一键选择推荐文档工具' }));

    expect(screen.getByRole('checkbox', { name: /resolve-library-id/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /query-docs/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /provider_future_tool/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith(
      'mcp-context7',
      expect.objectContaining({ allowed_tools: ['resolve-library-id', 'query-docs'] }),
    ));
  });

  it.each([
    ['非官方 endpoint', { endpoint_url: 'https://example.com/mcp' }],
    ['非 header 鉴权', { auth_type: 'bearer' as const }],
    ['非官方 Header 名', { auth_name: 'X-API-Key' }],
    ['非官方凭证引用', { credential_ref: 'OTHER_CONTEXT7_KEY' }],
  ])('Context7 的%s不显示官方推荐操作', async (_label, override) => {
    const disguisedContext7Server = {
      ...server,
      id: 'mcp-context7-disguised',
      name: 'Context7 技术文档',
      provider: 'context7',
      endpoint_url: 'https://mcp.context7.com/mcp',
      auth_type: 'header' as const,
      auth_name: 'CONTEXT7_API_KEY',
      credential_ref: 'CONTEXT7_API_KEY',
      allowed_tools: [],
      discovered_tools: [
        { name: 'resolve-library-id', description: '解析技术文档库 ID' },
        { name: 'query-docs', description: '查询最新技术文档' },
      ],
      ...override,
    };
    apiMocks.fetch.mockResolvedValue([disguisedContext7Server]);

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-context7-disguised');
    fireEvent.click(within(card).getByRole('button', { name: '编辑Context7 技术文档' }));

    expect(screen.queryByRole('button', { name: '一键选择推荐文档工具' })).toBeNull();
  });

  it('Context7 推荐操作不会授权尚未发现的 query-docs', async () => {
    const context7Server = {
      ...server,
      id: 'mcp-context7',
      name: 'Context7 技术文档',
      provider: 'context7',
      endpoint_url: 'https://mcp.context7.com/mcp',
      auth_type: 'header' as const,
      auth_name: 'CONTEXT7_API_KEY',
      credential_ref: 'CONTEXT7_API_KEY',
      allowed_tools: [],
      discovered_tools: [
        { name: 'resolve-library-id', description: '解析技术文档库 ID' },
      ],
    };
    apiMocks.fetch.mockResolvedValue([context7Server]);
    apiMocks.update.mockResolvedValue(context7Server);

    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-context7');
    fireEvent.click(within(card).getByRole('button', { name: '编辑Context7 技术文档' }));
    fireEvent.click(screen.getByRole('button', { name: '一键选择推荐文档工具' }));

    expect(screen.getByRole('checkbox', { name: /resolve-library-id/ })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /query-docs/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '保存服务' }));
    await waitFor(() => expect(apiMocks.update).toHaveBeenCalledWith(
      'mcp-context7',
      expect.objectContaining({ allowed_tools: ['resolve-library-id'] }),
    ));
  });

  it('已发现工具描述明确标记为远端服务声明', async () => {
    render(<McpServerManager />);
    const card = await screen.findByTestId('mcp-server-mcp-1');
    fireEvent.click(within(card).getByRole('button', { name: '编辑高德地图' }));

    expect(screen.getByText('远端服务声明：关键词搜索')).toBeInTheDocument();
    expect(screen.queryByText('关键词搜索')).toBeNull();
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
