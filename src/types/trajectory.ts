export type TrajectoryCapabilityPackageId =
  | 'direct'
  | 'transform'
  | 'date'
  | 'fresh_web'
  | 'verified_web'
  | 'url_read'
  | 'weather'
  | 'place_discovery'
  | 'mobility_route'
  | 'flight'
  | 'train'
  | 'travel_air_rail'
  | 'mobility_intercity'
  | 'mixed_itinerary'
  | 'deep_research'
  | 'knowledge_grounded'
  | 'tools_unavailable'
  | 'clarification_only'
  | 'mcp_explicit';

export type TrajectoryCapabilityReasonCode =
  | 'direct_greeting'
  | 'assistant_identity_question'
  | 'stable_knowledge_question'
  | 'simple_calculation'
  | 'text_transform_request'
  | 'current_date_question'
  | 'fresh_external_fact'
  | 'verified_source_request'
  | 'explicit_url_read'
  | 'explicit_weather_request'
  | 'explicit_place_discovery'
  | 'explicit_route_task'
  | 'explicit_flight_request'
  | 'explicit_train_request'
  | 'air_rail_comparison'
  | 'mixed_itinerary_request'
  | 'origin_destination_relation'
  | 'intercity_locations'
  | 'adjacent_route_followup'
  | 'deep_research_mode'
  | 'knowledge_grounded_mode'
  | 'tools_disabled'
  | 'function_calling_unavailable'
  | 'search_capability_unavailable'
  | 'required_tools_unavailable'
  | 'required_skill_unavailable'
  | 'explicit_authorized_tool_alias'
  | 'insufficient_capability_signal';

interface TrajectoryCapabilityResolutionBase {
  router_version: string;
  package_id: TrajectoryCapabilityPackageId;
  confidence: 'high' | 'medium' | 'low';
  resolution_mode: 'routed' | 'degraded' | 'clarification';
  reason_codes: TrajectoryCapabilityReasonCode[];
  external_tool_names: string[];
  effective_plan_mode: 'auto' | 'on' | 'off';
  include_current_date: boolean;
  network_boundary_required: boolean;
}

export interface TrajectoryCapabilitySkillResolution {
  status: 'not_selected' | 'loaded' | 'load_failed';
  activation_source: 'capability_package';
  requested_skill_ids: string[];
  skills: TrajectorySkillMetadata[];
  duration_ms: number;
  error_code: 'skill_load_failed' | null;
}

/** 旧 Run 的 v1 能力路由；当时尚未记录 Skill 终态。 */
export interface TrajectoryCapabilityResolutionV1 extends TrajectoryCapabilityResolutionBase {
  schema_version: 1;
  bundle_fingerprint: string;
}

/** 新 Run 的 v2 能力路由；Skill 终态在首次 LLM 前已经冻结。 */
export interface TrajectoryCapabilityResolutionV2 extends TrajectoryCapabilityResolutionBase {
  schema_version: 2;
  bundle_fingerprint: string;
  skill_resolution: TrajectoryCapabilitySkillResolution;
}

/** Run 级能力路由的受控 wire DTO，兼容历史 v1 与 Skills v2。 */
export type TrajectoryCapabilityResolution =
  | TrajectoryCapabilityResolutionV1
  | TrajectoryCapabilityResolutionV2;

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
  /** 旧 API/缓存可能缺失；新历史 Run 会显式返回 null。 */
  capability_resolution?: TrajectoryCapabilityResolution | null;
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
  | 'output'
  | 'prompt';

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

export interface TrajectorySystemPromptNodeDetail {
  template_version: string;
  fingerprint: string;
  char_count: number;
  sections: Array<{ section_id: string; content: string }>;
}

export interface TrajectorySkillMetadata {
  skill_id: string;
  version: string;
  content_sha256: string;
  allowed_tool_names: string[];
  section_id: string;
  char_count: number;
}

export interface TrajectorySkillNodeDetail extends TrajectorySkillMetadata {
  content: string;
}

export interface TrajectorySkillsNodeDetail {
  status: 'not_selected' | 'loaded' | 'load_failed';
  activation_source: 'capability_package';
  skills: TrajectorySkillNodeDetail[];
}

export interface TrajectoryNodeDetailResponse {
  status: TrajectoryNodeDetailStatus;
  node_type: 'tool' | 'llm' | 'system_prompt' | 'skills';
  available_sections: TrajectoryNodeDetailSection[];
  detail: TrajectoryToolNodeDetail | TrajectoryLlmNodeDetail | TrajectorySystemPromptNodeDetail | TrajectorySkillsNodeDetail | null;
  redacted_fields: string[];
  truncated_fields: string[];
  reason: string | null;
}
