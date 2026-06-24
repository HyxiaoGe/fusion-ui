export type NetworkDiagnosticsStatus = 'success' | 'failed' | 'degraded' | 'interrupted';

export interface NetworkDiagnosticsSummary {
  total_duration_ms: number | null;
  total_steps: number;
  total_tool_calls: number;
  search_calls: number;
  url_read_calls: number;
  success_count: number;
  failed_count: number;
  degraded_count: number;
  interrupted_count: number;
  limit_reason?: string | null;
  run_status?: string | null;
}

export interface NetworkDiagnosticsToolItem {
  tool_call_log_id: string;
  tool_name: string;
  status: NetworkDiagnosticsStatus;
  duration_ms: number | null;
  target: string;
  result_count?: number | null;
  reason?: string | null;
  requested_count?: number | null;
  actual_count?: number | null;
  context_count?: number | null;
  intent?: 'quick_fact' | 'freshness' | 'comparison' | 'deep_research' | 'official_source' | string | null;
  domains?: string[];
  recency_days?: number | null;
  budget_limited?: boolean;
  started_at?: string | null;
  admin?: Record<string, unknown> | null;
}

export interface NetworkDiagnosticsResponse {
  conversation_id: string;
  message_id: string;
  run_id: string | null;
  visibility: 'user' | 'admin';
  summary: NetworkDiagnosticsSummary;
  tools: NetworkDiagnosticsToolItem[];
  is_empty: boolean;
}
