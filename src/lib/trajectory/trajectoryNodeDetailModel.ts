import type { TrajectorySpan } from '@/types/trajectory';
import { getToolMeta } from '@/lib/agent/toolRegistry';

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

export interface TrajectoryNodeSummaryField {
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
  attemptMode: 'count' | 'ordinal' | null;
  errorSummary: string | null;
  summaryFields: TrajectoryNodeSummaryField[];
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
  relatedCells: readonly TrajectoryCell[] = [],
): TrajectoryNodeDetailModel {
  const presentation = getTrajectoryCellPresentation(cell);
  const events = cellEvents(cell);
  if (span) return buildSpanDetailModel(cell, span, events);

  return {
    title: presentation.kindLabel,
    nodeType: cellTypeLabel(cell.type),
    status: presentation.statusLabel ?? '已记录',
    summary: presentation.summary,
    duration: formatTrajectoryDuration(localDuration(cell, events, presentation.durationMs)),
    ttft: formatTrajectoryDuration(localTtft(cell, events)),
    startedAt: localStartedAt(cell, events),
    endedAt: localEndedAt(cell, events),
    attemptCount: attemptCount(cell, relatedCells),
    attemptMode: cellAttemptMode(cell, relatedCells),
    errorSummary: cellError(cell, events),
    summaryFields: cellSummaryFields(cell),
    diagnostics: cellDiagnostics(cell),
  };
}

function buildSpanDetailModel(
  cell: TrajectoryCell,
  span: TrajectorySpan,
  cellEvents: readonly NormalizedTrajectoryEvent[],
): TrajectoryNodeDetailModel {
  const sequences = new Set(span.record_sequences);
  const events = cellEvents.filter(event => sequences.has(event.sequence));
  const presentation = spanPresentation(span.kind);
  const toolLabel = safeSpanToolLabel(cell, span);
  const attemptOrdinal = matchingSpanAttemptOrdinal(cell, span);

  return {
    title: toolLabel ? `${presentation.title} · ${toolLabel}` : presentation.title,
    nodeType: presentation.nodeType,
    status: formatTrajectoryStatus(span.status),
    summary: presentation.summary,
    duration: formatTrajectoryDuration(span.duration_ms),
    ttft: formatTrajectoryDuration(span.ttft_ms),
    startedAt: formatTrajectoryTimestamp(span.started_at),
    endedAt: formatTrajectoryTimestamp(span.ended_at),
    attemptCount: attemptOrdinal,
    attemptMode: attemptOrdinal === null ? null : 'ordinal',
    errorSummary: spanError(span, events),
    summaryFields: cellSummaryFields(cell),
    diagnostics: spanDiagnostics(span),
  };
}

function spanPresentation(kind: string): {
  title: string;
  nodeType: string;
  summary: string;
} {
  switch (kind) {
    case 'run': return { title: '运行', nodeType: '运行', summary: '运行' };
    case 'step': return { title: '执行步骤', nodeType: '步骤', summary: '执行步骤' };
    case 'llm': return { title: '模型调用', nodeType: '模型阶段', summary: '模型调用' };
    case 'retrieval': return { title: '资料获取', nodeType: '资料获取阶段', summary: '资料获取' };
    case 'tool': return { title: '工具', nodeType: '工具阶段', summary: '工具调用' };
    case 'tool_attempt': return { title: '工具尝试', nodeType: '工具尝试', summary: '工具尝试' };
    case 'message': return { title: '消息', nodeType: '消息', summary: '消息' };
    default: return { title: '轨迹阶段', nodeType: '轨迹阶段', summary: '轨迹阶段' };
  }
}

function safeSpanToolLabel(cell: TrajectoryCell, span: TrajectorySpan): string | null {
  const overlapsCell = span.record_sequences.some(sequence => cell.sourceSequences.includes(sequence));
  if (!overlapsCell) return null;
  if (
    span.kind === 'tool'
    && cell.type === 'tool'
    && span.span_id === `tool:${cell.toolCallId}`
  ) return getToolMeta(cell.toolName ?? '').label;
  if (
    span.kind === 'tool_attempt'
    && cell.type === 'subtool'
    && span.span_id === `tool_attempt:${cell.toolAttemptId}`
  ) return getToolMeta(cell.toolName ?? '').label;
  return null;
}

function matchingSpanAttemptOrdinal(
  cell: TrajectoryCell,
  span: TrajectorySpan,
): number | null {
  if (
    cell.type !== 'subtool'
    || span.kind !== 'tool_attempt'
    || span.span_id !== `tool_attempt:${cell.toolAttemptId}`
    || !span.record_sequences.some(sequence => cell.sourceSequences.includes(sequence))
  ) return null;
  return cell.attemptIndex;
}

function cellEvents(cell: TrajectoryCell): NormalizedTrajectoryEvent[] {
  if (cell.type === 'run') return [...cell.records, ...cell.liveTail];
  if (cell.type === 'tool') {
    return cell.events.filter(event => event.eventType.startsWith('tool_call_'));
  }
  if (cell.type === 'subtool') {
    return cell.events.filter(event => event.eventType.startsWith('tool_attempt_'));
  }
  if (cell.type === 'assistant_request') return cell.events;
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
  if (cell.type === 'assistant_request') return cell.durationMs;
  return presentationDuration;
}

function localTtft(
  cell: TrajectoryCell,
  events: readonly NormalizedTrajectoryEvent[],
): number | null {
  if (cell.type === 'assistant_request') return cell.ttftMs;
  return latestNumber(events, 'ttft_ms');
}

function cellSummaryFields(cell: TrajectoryCell): TrajectoryNodeSummaryField[] {
  if (cell.type === 'user' || cell.type === 'message') {
    const fields: TrajectoryNodeSummaryField[] = [
      { label: '来源', value: cell.type === 'user' ? '用户' : '助手' },
    ];
    if (cell.message.sequence !== undefined) {
      fields.push({ label: '消息序号', value: `#${cell.message.sequence}` });
    }
    const recordedAt = formatTrajectoryTimestamp(cell.message.timestamp ?? null);
    if (recordedAt) {
      fields.push({
        label: cell.type === 'user' ? '发送时间' : '生成时间',
        value: recordedAt,
      });
    }
    if (cell.type === 'message') {
      if (cell.message.model_id) {
        fields.push({ label: '模型', value: cell.message.model_id });
      }
      if (cell.message.usage) {
        fields.push(
          {
            label: '输入 Token',
            value: `${cell.message.usage.input_tokens.toLocaleString('en-US')} tok`,
          },
          {
            label: '输出 Token',
            value: `${cell.message.usage.output_tokens.toLocaleString('en-US')} tok`,
          },
        );
      }
    }
    return fields;
  }
  if (cell.type === 'tool') {
    return [
      {
        label: '来源',
        value: `工具 · ${getToolMeta(cell.toolName ?? '').label}`,
      },
    ];
  }
  if (cell.type !== 'assistant_request') return [];
  const fields: TrajectoryNodeSummaryField[] = [
    {
      label: '来源',
      value: cell.requestIndex !== null ? `Request #${cell.requestIndex}` : '模型请求',
    },
  ];
  const model = [cell.provider, cell.model].filter(Boolean).join(' · ');
  if (model) fields.push({ label: '模型', value: model });
  for (const [label, value] of [
    ['输入 Token', cell.inputTokens],
    ['输出 Token', cell.outputTokens],
    ['推理 Token', cell.reasoningTokens],
  ] as const) {
    if (value !== null) fields.push({ label, value: `${value.toLocaleString('en-US')} tok` });
  }
  return fields;
}

function cellTypeLabel(type: TrajectoryCell['type']): string {
  switch (type) {
    case 'user': return '用户消息';
    case 'message': return '回答消息';
    case 'assistant_request': return '模型请求';
    case 'run': return '运行';
    case 'plan': return '计划';
    case 'context': return '上下文';
    case 'tool': return '工具';
    case 'subtool': return '工具尝试';
    case 'compacted': return '上下文压缩';
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

function attemptCount(
  cell: TrajectoryCell,
  relatedCells: readonly TrajectoryCell[],
): number | null {
  if (cell.type === 'run' || cell.type === 'subtool') {
    return cell.attemptIndex;
  }
  if (cell.type !== 'tool') return null;

  const attemptIds = new Set<string>();
  for (const relatedCell of relatedCells) {
    if (
      relatedCell.type === 'subtool'
      && relatedCell.runId === cell.runId
      && relatedCell.toolCallId === cell.toolCallId
    ) attemptIds.add(relatedCell.toolAttemptId);
  }
  return attemptIds.size || null;
}

function cellAttemptMode(
  cell: TrajectoryCell,
  relatedCells: readonly TrajectoryCell[],
): TrajectoryNodeDetailModel['attemptMode'] {
  if (cell.type === 'run' || cell.type === 'subtool') {
    return cell.attemptIndex === null ? null : 'ordinal';
  }
  if (cell.type !== 'tool') return null;
  return attemptCount(cell, relatedCells) === null ? null : 'count';
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
  if (cell.type === 'assistant_request' && cell.status === 'failed') return '模型请求未能完成';
  if (cell.type === 'run' && cell.runStatus === 'failed') return '运行未能完成';
  return null;
}

function spanError(
  span: TrajectorySpan,
  events: readonly NormalizedTrajectoryEvent[],
): string | null {
  if (span.terminal_source === 'inferred' || span.inferred_reason !== null) {
    return inferredSpanSummary(span.inferred_reason);
  }
  const eventDetail = latestSafeEventDetail(events);
  if (eventDetail) return eventDetail;
  if (span.status !== 'failed') return null;
  if (span.kind === 'tool_attempt') return '工具尝试未能完成';
  if (span.kind === 'tool') return '工具未能完成';
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

function cellDiagnostics(cell: TrajectoryCell): TrajectoryNodeDiagnostic[] {
  const items: TrajectoryNodeDiagnostic[] = [];
  if (cell.runId) items.push({ label: '运行 ID', value: cell.runId });
  if (cell.type === 'tool' || cell.type === 'subtool') {
    if (cell.toolCallId) items.push({ label: '工具调用 ID', value: cell.toolCallId });
  }
  if (cell.type === 'tool' && cell.stepId) items.push({ label: '步骤 ID', value: cell.stepId });
  if (cell.type === 'subtool') items.push({ label: '工具尝试 ID', value: cell.toolAttemptId });
  if (cell.type === 'assistant_request') {
    items.push({ label: '模型请求 ID', value: cell.llmRoundId });
  }
  if (cell.sourceSequences.length > 0) {
    items.push({ label: '记录序号', value: sequenceReferences(cell.sourceSequences) });
  }
  return items;
}

function spanDiagnostics(span: TrajectorySpan): TrajectoryNodeDiagnostic[] {
  const items = [{ label: '阶段 ID', value: span.span_id }];
  if (span.parent_span_id) items.push({ label: '父阶段 ID', value: span.parent_span_id });
  if (span.record_sequences.length > 0) {
    items.push({ label: '记录序号', value: sequenceReferences(span.record_sequences) });
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
