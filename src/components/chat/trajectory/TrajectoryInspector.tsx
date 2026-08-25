'use client';

import { AlertTriangle, Clock3, GitBranch, Hash, TimerReset, X } from 'lucide-react';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import type { NormalizedTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import type { TrajectorySpan } from '@/types/trajectory';
import { cn } from '@/lib/utils';
import {
  formatTrajectoryDuration,
  formatTrajectoryStatus,
  getTrajectoryCellPresentation,
} from './TrajectoryCell';

export interface TrajectoryInspectorProps {
  cell: TrajectoryCell | null;
  span: TrajectorySpan | null;
  onClose?: () => void;
}

interface InspectorModel {
  title: string;
  status: string;
  duration: string | null;
  ttft: string | null;
  parent: string | null;
  error: string | null;
  sequences: number[];
}

const MAX_SHORT_ERROR_LENGTH = 160;
const MESSAGE_EVENT_TYPES = new Set([
  'run_failed',
  'llm_round_failed',
  'retrieval_failed',
]);
const REASON_EVENT_TYPES = new Set([
  'run_limit_reached',
  'run_interrupted',
  'llm_round_cancelled',
  'retrieval_cancelled',
]);

function shortText(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.length > MAX_SHORT_ERROR_LENGTH
    ? `${normalized.slice(0, MAX_SHORT_ERROR_LENGTH - 1)}…`
    : normalized;
}

function cellParent(cell: TrajectoryCell): string | null {
  if (cell.type === 'tool' && cell.stepId) return `步骤 ${cell.stepId}`;
  if (cell.type === 'subtool' && cell.toolCallId) return `工具调用 ${cell.toolCallId}`;
  if (cell.type !== 'user' && cell.type !== 'message' && cell.type !== 'run' && cell.runId) {
    return `运行 ${cell.runId}`;
  }
  return null;
}

function cellTtft(cell: TrajectoryCell): number | null {
  const events = cellEvents(cell);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = events[index].payload.ttft_ms;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function cellEvents(cell: TrajectoryCell): NormalizedTrajectoryEvent[] {
  return cell.type === 'run'
    ? [...cell.records, ...cell.liveTail]
    : (
      cell.type === 'tool'
      || cell.type === 'subtool'
      || cell.type === 'assistant_request'
        ? cell.events
        : []
    );
}

function safeEventDetail(event: NormalizedTrajectoryEvent): string | null {
  if (MESSAGE_EVENT_TYPES.has(event.eventType) && typeof event.payload.message === 'string') {
    return shortText(event.payload.message);
  }
  if (REASON_EVENT_TYPES.has(event.eventType) && typeof event.payload.reason === 'string') {
    return shortText(event.payload.reason);
  }
  return null;
}

function controlledFailureSummary(
  cell: TrajectoryCell,
  eventType?: string,
  spanKind?: string,
): string {
  if (cell.type === 'subtool' || eventType?.startsWith('tool_attempt_')) {
    return '工具尝试未能完成';
  }
  if (cell.type === 'tool' || spanKind === 'tool' || eventType?.startsWith('tool_call_')) {
    return '工具未能完成';
  }
  if (spanKind === 'llm' || eventType?.startsWith('llm_round_')) return '模型阶段未能完成';
  if (spanKind === 'retrieval' || eventType?.startsWith('retrieval_')) {
    return '资料获取阶段未能完成';
  }
  return '该阶段未能完成';
}

function cellError(cell: TrajectoryCell): string | null {
  const events = cellEvents(cell);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const detail = safeEventDetail(event);
    if (detail) return detail;
    if (typeof event.payload.error_code === 'string') {
      return controlledFailureSummary(cell, event.eventType);
    }
  }
  if ('status' in cell && cell.status === 'failed') return controlledFailureSummary(cell);
  return null;
}

function inferredSpanSummary(reason: string | null): string {
  switch (reason) {
    case 'truncated_prefix':
      return '该阶段的开始记录不在当前有界快照中';
    case 'run_failed_without_close':
      return '运行失败前该阶段未能正常收口';
    case 'run_interrupted_without_close':
      return '运行中断前该阶段未能正常收口';
    case 'run_completed_without_close':
      return '运行完成时该阶段仍缺少明确的结束记录';
    default:
      return '该阶段的结束状态由当前有限记录推断';
  }
}

function spanError(cell: TrajectoryCell, span: TrajectorySpan): string | null {
  if (span.terminal_source === 'inferred' || span.inferred_reason !== null) {
    return inferredSpanSummary(span.inferred_reason);
  }

  const sequences = new Set(span.record_sequences);
  const events = cellEvents(cell).filter(event => sequences.has(event.sequence));
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const detail = safeEventDetail(events[index]);
    if (detail) return detail;
  }
  if (span.status === 'failed') return controlledFailureSummary(cell, undefined, span.kind);
  return null;
}

function buildInspectorModel(cell: TrajectoryCell, span: TrajectorySpan | null): InspectorModel {
  const presentation = getTrajectoryCellPresentation(cell);
  if (span) {
    return {
      title: span.name,
      status: formatTrajectoryStatus(span.status),
      duration: formatTrajectoryDuration(span.duration_ms),
      ttft: formatTrajectoryDuration(span.ttft_ms),
      parent: span.parent_span_id ? `父阶段 ${span.parent_span_id}` : null,
      error: spanError(cell, span),
      sequences: span.record_sequences,
    };
  }

  return {
    title: presentation.kindLabel,
    status: presentation.statusLabel ?? '已记录',
    duration: formatTrajectoryDuration(presentation.durationMs),
    ttft: formatTrajectoryDuration(cellTtft(cell)),
    parent: cellParent(cell),
    error: cellError(cell),
    sequences: cell.sourceSequences,
  };
}

function sequenceReferences(sequences: readonly number[]): string {
  const uniqueSequences = [...new Set(sequences)].sort((left, right) => left - right);
  if (uniqueSequences.length > 12) {
    return `#${uniqueSequences[0]}–#${uniqueSequences.at(-1)}（${uniqueSequences.length} 条）`;
  }
  return uniqueSequences.map(sequence => `#${sequence}`).join('、');
}

function InspectorField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 p-2.5">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function TrajectoryInspector({ cell, span, onClose }: TrajectoryInspectorProps) {
  const model = cell ? buildInspectorModel(cell, span) : null;

  return (
    <aside
      aria-label="轨迹检查器"
      className="min-h-48 rounded-lg border border-border/60 bg-background p-4"
    >
      {!model ? (
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          选择一条轨迹记录查看详情
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">检查器</p>
              <h2 className="truncate text-base font-semibold text-foreground">{model.title}</h2>
            </div>
            {onClose && (
              <button
                type="button"
                aria-label="关闭轨迹检查器"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <dl className="grid gap-2 sm:grid-cols-2">
            <InspectorField icon={AlertTriangle} label="状态" value={model.status} />
            {model.duration && <InspectorField icon={Clock3} label="耗时" value={model.duration} />}
            {model.ttft && <InspectorField icon={TimerReset} label="首次输出" value={model.ttft} />}
            {model.parent && <InspectorField icon={GitBranch} label="父子关系" value={model.parent} />}
            {model.sequences.length > 0 && (
              <InspectorField icon={Hash} label="记录序号" value={sequenceReferences(model.sequences)} />
            )}
          </dl>

          {model.error && (
            <div className={cn(
              'mt-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-foreground',
            )}>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-danger">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                异常摘要
              </p>
              <p>{model.error}</p>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
