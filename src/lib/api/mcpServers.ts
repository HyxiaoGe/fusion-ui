import { API_CONFIG } from '../config';
import type { McpServer, McpServerPayload } from '@/types/mcp';
import { apiRequest } from './fetchWithAuth';

const jsonHeaders = { 'Content-Type': 'application/json' };
const serversPath = `${API_CONFIG.BASE_URL}/api/admin/mcp/servers`;

export const fetchMcpServersAPI = async (): Promise<McpServer[]> => {
  return apiRequest<McpServer[]>(serversPath);
};

export const createMcpServerAPI = async (payload: McpServerPayload): Promise<McpServer> => {
  return apiRequest<McpServer>(serversPath, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const updateMcpServerAPI = async (
  serverId: string,
  payload: McpServerPayload,
): Promise<McpServer> => {
  return apiRequest<McpServer>(`${serversPath}/${serverId}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
};

export const setMcpServerEnabledAPI = async (
  serverId: string,
  isEnabled: boolean,
): Promise<McpServer> => {
  return apiRequest<McpServer>(`${serversPath}/${serverId}/status`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ is_enabled: isEnabled }),
  });
};

export const testMcpServerConnectionAPI = async (serverId: string): Promise<McpServer> => {
  return apiRequest<McpServer>(`${serversPath}/${serverId}/test`, {
    method: 'POST',
  });
};

export const refreshMcpServerToolsAPI = async (serverId: string): Promise<McpServer> => {
  return apiRequest<McpServer>(`${serversPath}/${serverId}/tools/refresh`, {
    method: 'POST',
  });
};
