export type AdminJsonValue =
  | string
  | number
  | boolean
  | null
  | AdminJsonValue[]
  | { [key: string]: AdminJsonValue };

export interface AdminPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface AdminUsageSummary {
  input_tokens: number;
  output_tokens: number;
  total_tokens?: number;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  nickname: string | null;
  email_masked: string | null;
  is_superuser: boolean;
  created_at: string | null;
  updated_at: string | null;
  last_active_at: string | null;
  conversation_count: number;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
}

export interface AdminUserDetail extends AdminUserSummary {
  email: string | null;
  system_prompt: string | null;
}

export interface AdminConversationSummary {
  id: string;
  title: string;
  user: Pick<AdminUserSummary, 'id' | 'username' | 'nickname' | 'email_masked'>;
  model_id: string | null;
  message_count: number;
  tool_call_count: number;
  file_count: number;
  latest_agent_status: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminConversationDetail extends AdminConversationSummary {
  orphan_agent_step_count?: number;
}

export interface AdminKnownContentBlock {
  type: string;
  id?: string;
  text?: string;
  thinking?: string;
  file_id?: string;
  filename?: string;
  mime_type?: string;
  query?: string;
  url?: string;
  title?: string;
  status?: string;
  [key: string]: AdminJsonValue | undefined;
}

export interface AdminMessageRecord {
  id: string;
  role: 'user' | 'assistant' | string;
  content: AdminKnownContentBlock[];
  model_id: string | null;
  usage: AdminUsageSummary | null;
  suggested_questions?: string[] | null;
  created_at: string | null;
}

export interface AdminToolCallRecord {
  id: string;
  message_id: string | null;
  trace_id: string | null;
  step_number: number | null;
  tool_name: string;
  status: string;
  duration_ms: number | null;
  model_id: string | null;
  provider: string | null;
  arguments: AdminJsonValue;
  result_preview: AdminJsonValue;
  error: AdminJsonValue;
  redacted_fields: string[];
  created_at: string | null;
}

export interface AdminAgentStepRecord {
  id: string;
  step_number: number;
  status: string;
  tool_calls_count: number;
  tool_names: string[];
  duration_ms: number | null;
  created_at: string | null;
  tool_calls: AdminToolCallRecord[];
}

export interface AdminAgentRunRecord {
  id: string;
  message_id: string | null;
  user_id: string;
  status: string;
  model_id: string | null;
  provider: string | null;
  total_steps: number;
  total_tool_calls: number;
  total_duration_ms: number | null;
  limit_reason: string | null;
  config: AdminJsonValue;
  error: AdminJsonValue;
  created_at: string | null;
  progress: AdminJsonValue;
  steps: AdminAgentStepRecord[];
}

export interface AdminFileRecord {
  id: string;
  original_filename: string;
  mimetype: string | null;
  size: number | null;
  status: string | null;
  width: number | null;
  height: number | null;
  created_at: string | null;
}

export interface AdminAuditEventRecord {
  id: string;
  admin_user_id: string;
  admin_snapshot: AdminJsonValue;
  action: string;
  resource_type: string;
  resource_id: string | null;
  target_user_id: string | null;
  request_id: string | null;
  reason: string | null;
  metadata: AdminJsonValue;
  created_at: string;
}

export interface AdminPerformanceRunRecord {
  run_id: string;
  environment: string;
  model_id: string | null;
  status: string;
  schema_version: number;
  safe_summary: AdminJsonValue;
  imported_by_user_id: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface PerformanceRunImportPayload {
  schema_version: number;
  run_id: string;
  environment: string;
  model_id?: string | null;
  status: string;
  safe_summary: { [key: string]: AdminJsonValue };
  started_at?: string | null;
  finished_at?: string | null;
}

export interface AdminUsersQuery {
  page?: number;
  page_size?: number;
  q?: string;
  is_superuser?: boolean;
  created_from?: string;
  created_to?: string;
}

export interface AdminConversationsQuery {
  page?: number;
  page_size?: number;
  q?: string;
  user_id?: string;
  model_id?: string;
  created_from?: string;
  created_to?: string;
  updated_from?: string;
  updated_to?: string;
  has_tools?: boolean;
  has_files?: boolean;
}

export interface AdminConversationSectionQuery {
  page?: number;
  page_size?: number;
}

export interface AdminAuditEventsQuery extends AdminConversationSectionQuery {
  action?: string;
  resource_type?: string;
  admin_user_id?: string;
  target_user_id?: string;
  created_from?: string;
  created_to?: string;
}

export interface AdminPerformanceRunsQuery extends AdminConversationSectionQuery {
  environment?: string;
  status?: string;
  model_id?: string;
}
