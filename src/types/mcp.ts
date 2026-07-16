export type McpTransport = 'streamable_http';

export type McpAuthType = 'none' | 'bearer' | 'header' | 'query';

export type McpHealthStatus = 'unknown' | 'healthy' | 'unhealthy' | 'disabled';

export interface McpDiscoveredTool {
  name: string;
  description?: string | null;
  input_schema?: Record<string, unknown>;
}

export interface McpServerPayload {
  name: string;
  provider: string;
  endpoint_url: string;
  transport: McpTransport;
  auth_type: McpAuthType;
  auth_name?: string | null;
  credential_ref?: string | null;
  allowed_tools: string[];
}

export interface McpServer extends McpServerPayload {
  id: string;
  is_enabled: boolean;
  health_status: McpHealthStatus;
  discovered_tools: McpDiscoveredTool[];
  last_checked_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}
