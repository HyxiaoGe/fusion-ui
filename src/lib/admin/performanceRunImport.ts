import type { AdminJsonValue, PerformanceRunImportPayload } from '@/types/adminAudit';

const SENSITIVE_KEY = /(?:^|_)(?:authorization|cookie|token|password|secret|api_key|email|account_fingerprint|conversation_ids?|agent_run_ids?|agent_trace_ids?|message|prompt|response|content|path|storage_key|thumbnail_key)(?:$|_)/i;
const TOP_LEVEL_SUMMARY_KEYS = new Set([
  'stages', 'stopped', 'stop_reasons', 'cleanup', 'resources', 'rps',
  'p50_ms', 'p90_ms', 'p95_ms', 'p99_ms', 'max_ms', 'ttft_ms', 'error_rate',
]);
const STAGE_KEYS = new Set([
  'kind', 'concurrency', 'requests', 'flows', 'successful', 'failed',
  'requests_per_second', 'rps', 'p50_ms', 'p90_ms', 'p95_ms', 'p99_ms', 'max_ms',
  'p50_ttft_ms', 'p95_ttft_ms', 'p99_ttft_ms', 'p95_total_ms',
  'error_rate', 'timeout_rate', 'error_frames',
]);
const CLEANUP_KEYS = new Set([
  'conversations_deleted', 'tokens_revoked', 'users_deleted', 'agent_steps_deleted', 'errors',
]);
const RESOURCE_GROUP_KEYS = new Set(['api', 'postgres', 'redis', 'host', 'nginx', 'litellm']);
const RESOURCE_METRIC_KEYS = new Set([
  'cpu_percent', 'memory_mib', 'memory_percent', 'connections', 'restarts',
  'rejected_connections', 'evicted_keys', 'oom',
]);

export class PerformanceRunImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerformanceRunImportError';
  }
}

export function parsePerformanceRunImport(raw: string): PerformanceRunImportPayload {
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    throw new PerformanceRunImportError('JSON 格式无效');
  }
  if (!isRecord(candidate)) {
    throw new PerformanceRunImportError('压测结果必须是 JSON object');
  }

  if (isRecord(candidate.safe_summary)) {
    return {
      schema_version: requiredNumber(candidate, 'schema_version'),
      run_id: requiredString(candidate, 'run_id'),
      environment: requiredString(candidate, 'environment'),
      model_id: optionalString(candidate.model_id),
      status: optionalString(candidate.status) || 'completed',
      safe_summary: sanitizeSafeSummary(candidate.safe_summary),
      started_at: optionalString(candidate.started_at),
      finished_at: optionalString(candidate.finished_at),
    };
  }

  if (Array.isArray(candidate.stages) && typeof candidate.stopped === 'boolean' && isRecord(candidate.cleanup)) {
    return {
      schema_version: requiredNumber(candidate, 'schema_version'),
      run_id: requiredString(candidate, 'run_id'),
      environment: 'production',
      model_id: null,
      status: candidate.stopped ? 'stopped' : 'completed',
      safe_summary: sanitizeSafeSummary({
        stages: candidate.stages,
        stopped: candidate.stopped,
        stop_reasons: candidate.stop_reasons ?? [],
        cleanup: candidate.cleanup,
      }),
      started_at: null,
      finished_at: null,
    };
  }

  throw new PerformanceRunImportError('缺少 environment/safe_summary，或不是 Fusion runner 原始结果');
}

function sanitizeObject(value: Record<string, unknown>): { [key: string]: AdminJsonValue } {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}

function sanitizeSafeSummary(value: Record<string, unknown>): { [key: string]: AdminJsonValue } {
  const result: { [key: string]: AdminJsonValue } = {};
  for (const [key, item] of Object.entries(value)) {
    if (!TOP_LEVEL_SUMMARY_KEYS.has(key) || SENSITIVE_KEY.test(key)) continue;
    if (key === 'stages') {
      result.stages = Array.isArray(item)
        ? item.filter(isRecord).slice(0, 100).map(stage => sanitizeAllowedObject(stage, STAGE_KEYS))
        : [];
    } else if (key === 'cleanup') {
      result.cleanup = isRecord(item) ? sanitizeCleanup(item) : {};
    } else if (key === 'resources') {
      result.resources = isRecord(item) ? sanitizeResources(item) : null;
    } else if (key === 'stop_reasons') {
      result.stop_reasons = sanitizeSafeCodes(item);
    } else {
      result[key] = sanitizeValue(item);
    }
  }
  return result;
}

function sanitizeCleanup(value: Record<string, unknown>): { [key: string]: AdminJsonValue } {
  const result = sanitizeAllowedObject(value, CLEANUP_KEYS);
  if ('errors' in result) result.errors = sanitizeSafeCodes(value.errors);
  return result;
}

function sanitizeResources(value: Record<string, unknown>): { [key: string]: AdminJsonValue } {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, item]) => RESOURCE_GROUP_KEYS.has(key) && isRecord(item))
      .map(([key, item]) => [key, sanitizeAllowedObject(item as Record<string, unknown>, RESOURCE_METRIC_KEYS)]),
  );
}

function sanitizeAllowedObject(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
): { [key: string]: AdminJsonValue } {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => allowedKeys.has(key) && !SENSITIVE_KEY.test(key))
      .map(([key, item]) => [key, sanitizeValue(item)]),
  );
}

function sanitizeSafeCodes(value: unknown): AdminJsonValue[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && /^[a-z0-9:_-]{1,80}$/.test(item))
    .slice(0, 100);
}

function sanitizeValue(value: unknown): AdminJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (isRecord(value)) {
    return sanitizeObject(value);
  }
  return String(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = optionalString(value[key]);
  if (!result) throw new PerformanceRunImportError(`缺少 ${key}`);
  return result;
}

function requiredNumber(value: Record<string, unknown>, key: string): number {
  const result = value[key];
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new PerformanceRunImportError(`缺少 ${key}`);
  }
  return result;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
