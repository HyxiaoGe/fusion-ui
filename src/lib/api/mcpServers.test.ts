import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import {
  createMcpServerAPI,
  fetchMcpServersAPI,
  refreshMcpServerToolsAPI,
  setMcpServerEnabledAPI,
  testMcpServerConnectionAPI,
  updateMcpServerAPI,
} from './mcpServers';

const payload = {
  name: '高德地图',
  provider: 'amap',
  endpoint_url: 'https://mcp.amap.com/mcp',
  transport: 'streamable_http' as const,
  auth_type: 'bearer' as const,
  credential_ref: 'AMAP_MCP_API_KEY',
  allowed_tools: ['maps_text_search'],
};

describe('MCP 服务 API client', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('读取 MCP 服务列表', async () => {
    apiRequestMock.mockResolvedValue([]);

    await fetchMcpServersAPI();

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/mcp/servers');
  });

  it('创建 MCP 服务且不扩展明文密钥字段', async () => {
    apiRequestMock.mockResolvedValue({ id: 'mcp-1' });

    await createMcpServerAPI(payload);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/mcp/servers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('更新 MCP 服务', async () => {
    apiRequestMock.mockResolvedValue({ id: 'mcp-1' });

    await updateMcpServerAPI('mcp-1', payload);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/mcp/servers/mcp-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('通过 status 接口启停服务', async () => {
    apiRequestMock.mockResolvedValue({ id: 'mcp-1', is_enabled: false });

    await setMcpServerEnabledAPI('mcp-1', false);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/mcp/servers/mcp-1/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: false }),
    });
  });

  it('调用测试连接接口', async () => {
    apiRequestMock.mockResolvedValue({ success: true });

    await testMcpServerConnectionAPI('mcp-1');

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/mcp/servers/mcp-1/test', {
      method: 'POST',
    });
  });

  it('调用工具刷新接口', async () => {
    apiRequestMock.mockResolvedValue({ id: 'mcp-1', discovered_tools: [] });

    await refreshMcpServerToolsAPI('mcp-1');

    expect(apiRequestMock).toHaveBeenCalledWith('/api/admin/mcp/servers/mcp-1/tools/refresh', {
      method: 'POST',
    });
  });
});
