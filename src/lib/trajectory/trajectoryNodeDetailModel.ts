import type { TrajectorySpan } from '@/types/trajectory';

import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import type { TrajectoryCell } from './TrajectoryCellProjection';
import {
  formatTrajectoryDuration,
  formatTrajectoryStatus,
  getTrajectoryCellPresentation,
} from './trajectoryCellPresentation';

export interface TrajectoryNodeDiagnostic {
  label: string;
  value: string;
}

export interface TrajectoryNodeDetailModel {
  title: string;
  nodeType: string;
  status: string;
  summary: string;
  duration: string | null;
  ttft: string | null;
  startedAt: string | null;
  endedAt: string | null;
  attemptCount: number | null;
  errorSummary: string | null;
  diagnostics: TrajectoryNodeDiagnostic[];
}

const MAX_SHORT_ERROR_LENGTH = 160;
const FAILURE_MESSAGE_EVENTS = new Set([
  'run_failed',
  'llm_round_failed',
  'retrieval_failed',
]);
const FAILURE_REASON_EVENTS = new Set([
  'run_limit_reached',
  'run_interrupted',
  'llm_round_cancelled',
  'retrieval_cancelled',
]);
const SHANGHAI_TIME_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hourCycle: 'h23',
});

/** 从普通用户已有的安全投影生成 Summary / Timing，不读取 Node Detail。 */
export function buildTrajectoryNodeDetailModel(
  cell: TrajectoryCell,
  span: TrajectorySpan | null,
): TrajectoryNodeDetailModel {
  const presentation = getTrajectoryCellPresentation(cell);
  const events = cellEvents(cell);
  const spanSequences = span ? new Set(span.record_sequences) : null;
  const spanEvents = spanSequences
    ? events.filter(event => spanSequences.has(event.sequence))
    : events;
  const startedAt = span
    ? formatTrajectoryTimestamp(span.started_at)
    : localStartedAt(cell, events);
  const endedAt = span
    ? formatTrajectoryTimestamp(span.ended_at)
    : localEndedAt(cell, events);

  return {
    title: nonEmptyString(span?.name) ?? presentation.kindLabel,
    nodeType: span ? spanKindLabel(span.kind) : cellTypeLabel(cell.type),
    status: span
      ? formatTrajectoryStatus(span.status)
      : presentation.statusLabel ?? '已记录',
    summary: presentation.summary,
    duration: formatTrajectoryDuration(
      span?.duration_ms ?? localDuration(cell, events, presentation.durationMs),
    ),
    ttft: formatTrajectoryDuration(span?.ttft_ms ?? latestNumber(events, 'ttft_ms')),
    startedAt,
    endedAt,
    attemptCount: attemptCount(cell),
    errorSummary: span
      ? spanError(cell, span, spanEvents)
      : cellError(cell, events),
    diagnostics: diagnostics(cell, span),
  };
}

function cellEvents(cell: TrajectoryCell): NormalizedTrajectoryEvent[] {
  if (cell.type === 'run') return [...cell.records, ...cell.liveTail];
  if (cell.type === 'tool') {
    return cell.events.filter(event => event.eventType.startsWith('tool_call_'));
  }
  if (cell.type === 'subtool') {
    return cell.events.filter(event => event.eventType.startsWith('tool_attempt_'));
  }
  return [];
}

function localDuration(
  cell: TrajectoryCell,
  events: readonly NormalizedTrajectoryEvent[],
  presentationDuration: number | null,
): number | null {
  if (cell.type === 'tool' || cell.type === 'subtool') {
    return latestNumber(events, 'duration_ms');
  }
  return presentationDuration;
}

function cellTypeLabel(type: TrajectoryCell['type']): string {
  switch (type) {
    case 'user': return '用户消息';
    case 'message': return '回答消息';
    case 'run': return '运行';
    case 'plan': return '计划';
    case 'context': return '上下文';
    case 'tool': return '工具';
    case 'subtool': return '工具尝试';
    case 'compacted': return '上下文压缩';
  }
}

function spanKindLabel(kind: string): string {
  switch (kind) {
    case 'llm': return '模型阶段';
    case 'tool': return '工具阶段';
    case 'retrieval': return '资料获取阶段';
    case 'run': return '运行';
    case 'step': return '步骤';
    case 'message': return '消息';
    default: return '轨迹阶段';
  }
}

function localStartedAt(
  cell: TrajectoryCell,
  events: readonly NormalizedTrajectoryEvent[],
): string | null {
  if (cell.type === 'run') return formatTrajectoryTimestamp(cell.startedAt);
  if (cell.type === 'user' || cell.type === 'message') {
    return formatTrajectoryTimestamp(cell.message.timestamp ?? null);
  }
  return formatTrajectoryTimestamp(events.find(event => isValidTimestamp(event.timestamp))?.timestamp ?? null);
}

function localEndedAt(
  cell: TrajectoryCell,
  events: readonly NormalizedTrajectoryEvent[],
): string | null {
  if (cell.type === 'run') return formatTrajectoryTimestamp(cell.endedAt);
  if (cell.type === 'user' || cell.type === 'message') return null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const timestamp = formatTrajectoryTimestamp(events[index].timestamp);
    if (timestamp) return timestamp;
  }
  return null;
}

function latestNumber(
  events: readonly NormalizedTrajectoryEvent[],
  field: string,
): number | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = events[index].payload[field];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function attemptCount(cell: TrajectoryCell): number | null {
  if (cell.type === 'run' || cell.type === 'subtool') {
    return cell.attemptIndex === null ? null : cell.attemptIndex + 1;
  }
  if (cell.type !== 'tool') return null;

  const attemptIds = new Set<string>();
  for (const event of cell.events) {
    if (!event.eventType.startsWith('tool_attempt_')) continue;
    const id = nonEmptyString(event.payload.tool_attempt_id);
    if (id) attemptIds.add(id);
  }
  return attemptIds.size || null;
}

function cellError(
  cell: TrajectoryCell,
  events: readonly NormalizedTrajectoryEvent[],
): string | null {
  if (cell.type === 'message' && cell.message.status === 'failed') return '回答未能完成';
  const eventDetail = latestSafeEventDetail(events);
  if (eventDetail) return eventDetail;
  if (cell.type === 'subtool' && cell.status === 'failed') return '工具尝试未能完成';
  if (cell.type === 'tool' && cell.status === 'failed') return '工具未能完成';
  if (cell.type === 'run' && cell.runStatus === 'failed') return '运行未能完成';
  return null;
}

function spanError(
  cell: TrajectoryCell,
  span: TrajectorySpan,
  events: readonly NormalizedTrajectoryEvent[],
): string | null {
  if (span.terminal_source === 'inferred' || span.inferred_reason !== null) {
    return inferredSpanSummary(span.inferred_reason);
  }
  const eventDetail = latestSafeEventDetail(events);
  if (eventDetail) return eventDetail;
  if (span.status !== 'failed') return null;
  if (cell.type === 'subtool' || span.kind === 'attempt') return '工具尝试未能完成';
  if (cell.type === 'tool' || span.kind === 'tool') return '工具未能完成';
  if (span.kind === 'llm') return '模型阶段未能完成';
  if (span.kind === 'retrieval') return '资料获取阶段未能完成';
  return '该阶段未能完成';
}

function latestSafeEventDetail(events: readonly NormalizedTrajectoryEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (FAILURE_MESSAGE_EVENTS.has(event.eventType)) {
      const message = shortText(event.payload.message);
      if (message) return message;
    }
    if (FAILURE_REASON_EVENTS.has(event.eventType)) {
      const reason = shortText(event.payload.reason);
      if (reason) return reason;
    }
  }
  return null;
}

function inferredSpanSummary(reason: string | null): string {
  switch (reason) {
    case 'truncated_prefix': return '该阶段的开始记录不在当前有界快照中';
    case 'run_failed_without_close': return '运行失败前该阶段未能正常收口';
    case 'run_interrupted_without_close': return '运行中断前该阶段未能正常收口';
    case 'run_completed_without_close': return '运行完成时该阶段仍缺少明确的结束记录';
    default: return '该阶段的结束状态由当前有限记录推断';
  }
}

function shortText(value: unknown): string | null {
  const text = nonEmptyString(value);
  if (!text) return null;
  const normalized = text.replace(/\s+/g, ' ');
  return normalized.length > MAX_SHORT_ERROR_LENGTH
    ? `${normalized.slice(0, MAX_SHORT_ERROR_LENGTH - 1)}…`
    : normalized;
}

function diagnostics(
  cell: TrajectoryCell,
  span: TrajectorySpan | null,
): TrajectoryNodeDiagnostic[] {
  const items: TrajectoryNodeDiagnostic[] = [];
  if (cell.runId) items.push({ label: '运行 ID', value: cell.runId });
  if (cell.type === 'tool' || cell.type === 'subtool') {
    if (cell.toolCallId) items.push({ label: '工具调用 ID', value: cell.toolCallId });
  }
  if (cell.type === 'tool' && cell.stepId) items.push({ label: '步骤 ID', value: cell.stepId });
  if (cell.type === 'subtool') items.push({ label: '工具尝试 ID', value: cell.toolAttemptId });
  if (span?.parent_span_id) items.push({ label: '父阶段 ID', value: span.parent_span_id });
  const sequences = span?.record_sequences ?? cell.sourceSequences;
  if (sequences.length > 0) {
    items.push({ label: '记录序号', value: sequenceReferences(sequences) });
  }
  return items;
}

function sequenceReferences(sequences: readonly number[]): string {
  const unique = [...new Set(sequences)].sort((left, right) => left - right);
  if (unique.length > 12) return `#${unique[0]}–#${unique.at(-1)}（${unique.length} 条）`;
  return unique.map(sequence => `#${sequence}`).join('、');
}

function isValidTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function formatTrajectoryTimestamp(value: string | number | null): string | null {
  if (value === null || (typeof value === 'number' && !Number.isFinite(value))) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Map(
    SHANGHAI_TIME_FORMAT.formatToParts(date).map(part => [part.type, part.value]),
  );
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')} ${parts.get('hour')}:${parts.get('minute')}:${parts.get('second')}.${parts.get('fractionalSecond')}`;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
