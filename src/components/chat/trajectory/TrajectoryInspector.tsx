'use client';

import { AlertTriangle, Clock3, GitBranch, Hash, TimerReset, X } from 'lucide-react';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
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
  const events = cell.type === 'run'
    ? [...cell.records, ...cell.liveTail]
    : (cell.type === 'tool' || cell.type === 'subtool' ? cell.events : []);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = events[index].payload.ttft_ms;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function cellError(cell: TrajectoryCell): string | null {
  const events = cell.type === 'run'
    ? [...cell.records, ...cell.liveTail]
    : (cell.type === 'tool' || cell.type === 'subtool' ? cell.events : []);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const canCarryMessage = event.eventType.endsWith('_failed') || event.eventType === 'run_failed';
    if (canCarryMessage && typeof event.payload.message === 'string') {
      return shortText(event.payload.message);
    }
    if (typeof event.payload.error_code === 'string') return shortText(event.payload.error_code);
    if (event.eventType.endsWith('_cancelled') && typeof event.payload.reason === 'string') {
      return shortText(event.payload.reason);
    }
  }
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
      error: shortText(span.inferred_reason),
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
