'use client';

import {
  AlertTriangle,
  CheckCircle2,
  CircleEllipsis,
  Square,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { TrajectoryRunSummary, TrajectorySpan } from '@/types/trajectory';
import { cn } from '@/lib/utils';
import {
  formatTrajectoryDuration,
  formatTrajectoryStatus,
} from './TrajectoryCell';

export interface TrajectoryTimelineProps {
  runs: readonly TrajectoryRunSummary[];
  selectedRunId: string | null;
  selectedSpanId?: string | null;
  spans: readonly TrajectorySpan[];
  onSelectRun?: (run: TrajectoryRunSummary) => void;
  onSelectSpan?: (span: TrajectorySpan) => void;
}

interface StatusVisual {
  icon: LucideIcon;
  className: string;
}

const DEFAULT_STATUS_VISUAL: StatusVisual = {
  icon: CircleEllipsis,
  className: 'text-muted-foreground',
};

const STATUS_VISUALS: Record<string, StatusVisual> = {
  running: { icon: CircleEllipsis, className: 'text-info' },
  recording: { icon: CircleEllipsis, className: 'text-info' },
  completed: { icon: CheckCircle2, className: 'text-success' },
  complete: { icon: CheckCircle2, className: 'text-success' },
  success: { icon: CheckCircle2, className: 'text-success' },
  failed: { icon: XCircle, className: 'text-danger' },
  degraded: { icon: AlertTriangle, className: 'text-warn' },
  limit_reached: { icon: AlertTriangle, className: 'text-warn' },
  incomplete: { icon: AlertTriangle, className: 'text-warn' },
  interrupted: { icon: Square, className: 'text-muted-foreground' },
  cancelled: { icon: Square, className: 'text-muted-foreground' },
};

function ownRunDuration(run: TrajectoryRunSummary): number {
  if (run.duration_ms !== null && Number.isFinite(run.duration_ms) && run.duration_ms >= 0) {
    return run.duration_ms;
  }
  if (!run.ended_at) return 0;
  const duration = Date.parse(run.ended_at) - Date.parse(run.started_at);
  return Number.isFinite(duration) && duration >= 0 ? duration : 0;
}

function totalRunDuration(runs: readonly TrajectoryRunSummary[]): number {
  return runs.reduce((total, item) => total + ownRunDuration(item), 0);
}

function statusVisual(status: string): StatusVisual {
  return STATUS_VISUALS[status] ?? DEFAULT_STATUS_VISUAL;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function spanGeometry(
  span: TrajectorySpan,
  run: TrajectoryRunSummary,
  runDuration: number,
): { left: number; width: number } {
  if (runDuration <= 0) return { left: 0, width: 100 };
  const startOffset = Date.parse(span.started_at) - Date.parse(run.started_at);
  const duration = span.duration_ms ?? (
    span.ended_at ? Date.parse(span.ended_at) - Date.parse(span.started_at) : 0
  );
  const left = clamp((Math.max(0, startOffset) / runDuration) * 100, 0, 100);
  const width = clamp((Math.max(0, duration) / runDuration) * 100, 0.5, 100 - left);
  return { left, width };
}

export function TrajectoryTimeline({
  runs,
  selectedRunId,
  selectedSpanId = null,
  spans,
  onSelectRun,
  onSelectSpan,
}: TrajectoryTimelineProps) {
  const executionDuration = totalRunDuration(runs);
  const selectedRun = runs.find(run => run.run_id === selectedRunId) ?? null;
  const selectedRunDuration = selectedRun ? ownRunDuration(selectedRun) : 0;
  const spanNames = new Map(spans.map(item => [item.span_id, item.name]));

  return (
    <section aria-label="轨迹时间线" className="space-y-4 rounded-lg border border-border/60 bg-background p-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">会话运行概览</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            执行总耗时 {formatTrajectoryDuration(executionDuration) ?? '未知'}
          </span>
        </div>
        <div className="flex min-h-11 w-full gap-1 overflow-x-auto rounded-md bg-muted/30 p-1" aria-label="会话运行摘要带">
          {runs.map((run, index) => {
            const duration = ownRunDuration(run);
            const width = executionDuration > 0
              ? (duration / executionDuration) * 100
              : (100 / Math.max(1, runs.length));
            const visual = statusVisual(run.status);
            const Icon = visual.icon;
            const durationLabel = formatTrajectoryDuration(duration) ?? '耗时未知';
            const statusLabel = formatTrajectoryStatus(run.status);
            return (
              <button
                key={run.run_id}
                type="button"
                data-testid={`trajectory-run-band-${run.run_id}`}
                aria-label={`运行 ${index + 1}，${statusLabel}，${durationLabel}`}
                title={`运行 ${index + 1}，${statusLabel}，${durationLabel}`}
                aria-pressed={run.run_id === selectedRunId}
                onClick={() => onSelectRun?.(run)}
                style={{ width: `${width}%`, minWidth: '44px' }}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded px-2 text-xs font-medium outline-none transition-colors',
                  'bg-background/80 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring',
                  run.run_id === selectedRunId && 'ring-1 ring-primary/50',
                  visual.className,
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">运行 {index + 1}</span>
                <span data-run-status className="sr-only">{statusLabel}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div data-testid="trajectory-span-region" className="min-h-40">
        <h2 className="mb-2 text-sm font-semibold text-foreground">当前运行阶段</h2>
        {!selectedRun ? (
          <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-border/60 text-sm text-muted-foreground">
            选择一次运行查看阶段时间线
          </div>
        ) : spans.length === 0 ? (
          <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-border/60 text-sm text-muted-foreground">
            当前运行没有可用阶段记录
          </div>
        ) : (
          <div className="space-y-3">
            <div aria-hidden="true" className="space-y-1 rounded-md bg-muted/20 p-2">
              {spans.map(item => {
                const geometry = spanGeometry(item, selectedRun, selectedRunDuration);
                const visual = statusVisual(item.status);
                return (
                  <div key={item.span_id} className="relative h-7 overflow-hidden rounded bg-muted/30">
                    <div
                      data-testid={`trajectory-span-${item.span_id}`}
                      style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}
                      className={cn(
                        'absolute inset-y-1 flex min-w-1 items-center rounded border border-current/20 bg-background/80 px-1.5 text-[10px]',
                        visual.className,
                      )}
                    >
                      <span className="truncate">{item.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <ol aria-label="当前运行阶段列表" className="space-y-1">
              {spans.map(item => {
                const visual = statusVisual(item.status);
                const Icon = visual.icon;
                const duration = formatTrajectoryDuration(item.duration_ms) ?? '耗时未知';
                const status = formatTrajectoryStatus(item.status);
                const parentName = item.parent_span_id
                  ? (spanNames.get(item.parent_span_id) ?? item.parent_span_id)
                  : null;
                const accessibleName = [
                  item.name,
                  status,
                  duration,
                  parentName ? `父级 ${parentName}` : null,
                ].filter(Boolean).join('，');
                return (
                  <li key={item.span_id}>
                    <button
                      type="button"
                      aria-label={accessibleName}
                      title={accessibleName}
                      aria-pressed={item.span_id === selectedSpanId}
                      onClick={() => onSelectSpan?.(item)}
                      className={cn(
                        'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md border border-transparent px-2.5 text-left outline-none transition-colors',
                        'hover:border-border hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring',
                        item.span_id === selectedSpanId && 'border-primary/30 bg-primary/5',
                      )}
                    >
                      <Icon className={cn('h-4 w-4 shrink-0', visual.className)} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{item.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {status} · {duration}{parentName ? ` · 父级 ${parentName}` : ''}
                        </span>
                      </span>
                      {item.ttft_ms !== null && (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          首次输出 {formatTrajectoryDuration(item.ttft_ms)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </section>
  );
}
