/** P1 普通用户轨迹读取端点的 wire DTO；字段保持后端 snake_case。 */
export interface TrajectoryRunSummary {
  run_id: string;
  message_id: string | null;
  turn_message_id: string | null;
  attempt_index: number | null;
  status: string;
  trajectory_status: string;
  total_steps: number;
  total_tool_calls: number;
  duration_ms: number | null;
  started_at: string;
  ended_at: string | null;
  llm_detail_schema_version: number | null;
  llm_round_count: number;
}

export interface TrajectoryRunListResponse {
  items: TrajectoryRunSummary[];
  truncated: boolean;
}

export interface TrajectoryRecord {
  sequence: number;
  event_type: string;
  schema_version: number;
  timestamp: string;
  step_id: string | null;
  tool_call_id: string | null;
  parent_step_id: string | null;
  trace_id: string | null;
  span_id: string | null;
  payload: Record<string, unknown>;
}

export interface TrajectorySpan {
  span_id: string;
  kind: string;
  name: string;
  parent_span_id: string | null;
  start_sequence: number;
  end_sequence: number | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  status: string;
  terminal_source: string | null;
  inferred_reason: string | null;
  ttft_ms: number | null;
  record_sequences: number[];
}

export interface TrajectoryCompleteness {
  status: string;
  degraded_reason: string | null;
  event_count: number | null;
  expected_last_sequence: number | null;
  loaded_event_count: number;
  first_sequence: number | null;
  last_sequence: number | null;
}

export interface TrajectorySnapshot {
  run: TrajectoryRunSummary;
  records: TrajectoryRecord[];
  spans: TrajectorySpan[];
  completeness: TrajectoryCompleteness;
  truncated: boolean;
  llm_round_summaries: TrajectoryLlmRoundSummary[];
}

export interface TrajectoryLlmRoundSummary {
  llm_round_id: string;
  reasoning_preview: string | null;
  output_preview: string | null;
}

/** P3 普通用户 Tool Node Detail 端点的 wire DTO；字段保持后端 snake_case。 */
export type TrajectoryNodeDetailStatus = 'available' | 'pending' | 'not_recorded' | 'degraded';

export type TrajectoryNodeDetailSection =
  | 'summary'
  | 'payload'
  | 'result'
  | 'timing'
  | 'schema'
  | 'thinking'
  | 'output';

export type TrajectoryToolNodeDetailSection = Extract<
  TrajectoryNodeDetailSection,
  'summary' | 'payload' | 'result' | 'timing' | 'schema'
>;

export interface TrajectoryToolNodeDetail {
  tool_call_id: string;
  tool_name: string;
  status: string;
  duration_ms: number | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: Record<string, string> | null;
}

export interface TrajectoryLlmNodeDetail {
  llm_round_id: string;
  reasoning_text: string | null;
  output_text: string | null;
}

export interface TrajectoryNodeDetailResponse {
  status: TrajectoryNodeDetailStatus;
  node_type: 'tool' | 'llm';
  available_sections: TrajectoryNodeDetailSection[];
  detail: TrajectoryToolNodeDetail | TrajectoryLlmNodeDetail | null;
  redacted_fields: string[];
  truncated_fields: string[];
  reason: string | null;
}
