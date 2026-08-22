import type { TrajectoryRecord } from '@/types/trajectory';

export interface NormalizedTrajectoryEvent {
  runId: string;
  sequence: number;
  eventType: string;
  /** null 表示 P0 升级前缺失的 legacy schema_version。 */
  schemaVersion: number | null;
  timestamp: string;
  stepId: string | null;
  toolCallId: string | null;
  parentStepId: string | null;
  traceId: string | null;
  payload: Record<string, unknown>;
}

const SUPPORTED_SCHEMA_VERSIONS = new Set([0, 1]);

const EVENT_PAYLOAD_FIELDS: Record<string, readonly string[]> = {
  run_started: ['conversation_id', 'message_id', 'task_id', 'model', 'tools'],
  step_started: ['step_number'],
  tool_call_started: ['tool_name', 'plan_item_id'],
  tool_call_delta: ['tool_name'],
  tool_call_completed: ['tool_name', 'status', 'duration_ms', 'plan_item_id'],
  step_completed: ['step_number', 'tool_call_count', 'duration_ms'],
  run_limit_reached: ['reason'],
  run_interrupted: ['reason'],
  run_failed: ['error_code', 'message'],
  run_completed: ['total_steps', 'total_tool_calls', 'finish_reason'],
  llm_round_started: ['llm_round_id', 'round_index', 'model', 'provider'],
  llm_round_first_output_delta: ['llm_round_id', 'delta_kind', 'ttft_ms'],
  llm_round_completed: [
    'llm_round_id', 'status', 'finish_reason', 'input_tokens', 'output_tokens', 'total_tokens',
    'cache_read_tokens', 'cache_write_tokens', 'ttft_ms', 'duration_ms',
  ],
  llm_round_failed: ['llm_round_id', 'status', 'error_code', 'message'],
  llm_round_cancelled: ['llm_round_id', 'status', 'reason'],
  retrieval_started: ['retrieval_id', 'query_summary'],
  retrieval_completed: ['retrieval_id', 'status', 'document_count', 'duration_ms'],
  retrieval_failed: ['retrieval_id', 'status', 'error_code', 'message'],
  retrieval_cancelled: ['retrieval_id', 'status', 'reason'],
  tool_attempt_started: ['tool_attempt_id', 'tool_name', 'attempt_index'],
  tool_attempt_completed: ['tool_attempt_id', 'status', 'error_code', 'duration_ms'],
  suggested_questions_pending: ['protocol_version', 'message_id', 'revision', 'status'],
  run_progress_updated: [
    'protocol_version', 'phase', 'label', 'completed_steps', 'total_steps',
    'completed_tool_calls', 'max_tool_calls',
  ],
  plan_snapshot: ['protocol_version', 'plan_id', 'mode', 'source', 'revision', 'reason', 'items'],
  plan_step_updated: ['protocol_version', 'plan_id', 'mode', 'source', 'revision', 'reason', 'item'],
  tool_result_digest: [
    'protocol_version', 'tool_name', 'status', 'title', 'summary', 'key_findings', 'source_refs',
    'truncated', 'repair_state', 'repair_id', 'plan_item_id',
  ],
  evidence_item_upserted: ['protocol_version', 'evidence'],
  content_block_upserted: ['protocol_version'],
  content_block_discarded: ['protocol_version', 'block_id'],
  context_status_updated: [
    'protocol_version', 'message_id', 'phase', 'status', 'round_index', 'window_tokens',
    'estimated_tokens_before', 'estimated_tokens_after', 'actual_prompt_tokens', 'removed_turns',
    'removed_messages', 'removed_tool_transactions',
  ],
  context_required: ['protocol_version', 'context_type', 'request_id', 'purpose', 'reason', 'expires_at'],
  context_result: ['protocol_version', 'context_type', 'request_id', 'status'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function normalizeSchemaVersion(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'number' && Number.isInteger(value) && SUPPORTED_SCHEMA_VERSIONS.has(value)
    ? value
    : null;
}

function hasSupportedSchemaVersion(value: unknown): boolean {
  return value === undefined || value === null || normalizeSchemaVersion(value) !== null;
}

function sanitizePayload(eventType: string, source: Record<string, unknown>): Record<string, unknown> | null {
  const fields = EVENT_PAYLOAD_FIELDS[eventType];
  if (!fields) return null;

  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source) payload[field] = cloneValue(source[field]);
  }
  return payload;
}

function hasValidEnvelope(
  source: Record<string, unknown>,
): source is Record<string, unknown> & { type: string; run_id: string; sequence: number; ts: number; trace_id: string } {
  return typeof source.type === 'string'
    && typeof source.run_id === 'string'
    && Number.isInteger(source.sequence)
    && source.sequence >= 0
    && typeof source.ts === 'number'
    && Number.isFinite(source.ts)
    && typeof source.trace_id === 'string';
}

/** 将实时 agent_event 转成普通用户轨迹可消费的受控事件。 */
export function normalizeSseTrajectoryEvent(input: unknown): NormalizedTrajectoryEvent | null {
  if (!isRecord(input) || !hasValidEnvelope(input) || !hasSupportedSchemaVersion(input.schema_version)) {
    return null;
  }
  const stepId = nullableString(input.step_id);
  const toolCallId = nullableString(input.tool_call_id);
  const parentStepId = nullableString(input.parent_step_id);
  if (stepId === undefined || toolCallId === undefined || parentStepId === undefined) return null;

  const payload = sanitizePayload(input.type, input);
  if (payload === null) return null;
  const timestamp = new Date(input.ts * 1000);
  if (Number.isNaN(timestamp.getTime())) return null;

  return {
    runId: input.run_id,
    sequence: input.sequence,
    eventType: input.type,
    schemaVersion: normalizeSchemaVersion(input.schema_version),
    timestamp: timestamp.toISOString(),
    stepId,
    toolCallId,
    parentStepId,
    traceId: input.trace_id,
    payload,
  };
}

/** 将 P1 durable record 转成与实时 SSE 相同的普通用户事件。 */
export function normalizeTrajectoryRecord(runId: string, input: unknown): NormalizedTrajectoryEvent | null {
  const record = input as Partial<TrajectoryRecord>;
  if (!isRecord(input)
    || typeof runId !== 'string'
    || !Number.isInteger(record.sequence)
    || (record.sequence as number) < 0
    || typeof record.event_type !== 'string'
    || typeof record.timestamp !== 'string'
    || !hasSupportedSchemaVersion(record.schema_version)
    || !isRecord(record.payload)) {
    return null;
  }
  const stepId = nullableString(record.step_id);
  const toolCallId = nullableString(record.tool_call_id);
  const parentStepId = nullableString(record.parent_step_id);
  const traceId = nullableString(record.trace_id);
  if (stepId === undefined || toolCallId === undefined || parentStepId === undefined || traceId === undefined) {
    return null;
  }
  if (record.payload.type !== undefined && record.payload.type !== record.event_type) return null;
  if (record.payload.run_id !== undefined && record.payload.run_id !== runId) return null;

  const payload = sanitizePayload(record.event_type, record.payload);
  if (payload === null) return null;

  return {
    runId,
    sequence: record.sequence,
    eventType: record.event_type,
    schemaVersion: normalizeSchemaVersion(record.schema_version),
    timestamp: record.timestamp,
    stepId,
    toolCallId,
    parentStepId,
    traceId,
    payload,
  };
}
