'use client';

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleEllipsis,
  FileClock,
  ListChecks,
  MessageSquare,
  PackageOpen,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { TrajectoryCell as TrajectoryCellModel } from '@/lib/trajectory/TrajectoryCellProjection';
import { TRAJECTORY_ROW_HEIGHT } from '@/lib/trajectory/virtualRange';
import { getToolMeta } from '@/lib/agent/toolRegistry';
import { cn } from '@/lib/utils';
import { extractTextFromBlocks } from '@/types/conversation';

export interface TrajectoryCellProps {
  cell: TrajectoryCellModel;
  turnNumber: number | null;
  attemptNumber: number | null;
  selected: boolean;
  highlighted: boolean;
  active: boolean;
  position: number;
  setSize: number;
  onSelect: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
}

export interface TrajectoryCellPresentation {
  kindLabel: string;
  summary: string;
  statusLabel: string | null;
  durationMs: number | null;
  icon: LucideIcon;
  tone: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
  trajectoryStatusLabel?: string | null;
  trajectoryTone?: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
  isSkeleton?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  running: '运行中',
  recording: '记录中',
  completed: '已完成',
  complete: '已完成',
  success: '完成',
  failed: '失败',
  degraded: '部分可用',
  interrupted: '已中断',
  cancelled: '已取消',
  limit_reached: '已达上限',
  incomplete: '部分完成',
  legacy: '历史未记录',
  unknown: '状态未知',
};

const MAX_CELL_SUMMARY_LENGTH = 160;

export function formatTrajectoryStatus(status: string): string {
  return STATUS_LABELS[status] ?? '状态未知';
}

export function formatTrajectoryDuration(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (durationMs < 1000) return `${Math.round(durationMs)} 毫秒`;
  const seconds = (durationMs / 1000).toFixed(2).replace(/\.00$/, '').replace(/0$/, '');
  return `${seconds} 秒`;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function boundedSummary(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';
  return normalized.length > MAX_CELL_SUMMARY_LENGTH
    ? `${normalized.slice(0, MAX_CELL_SUMMARY_LENGTH - 1)}…`
    : normalized;
}

function latestDuration(cell: Extract<TrajectoryCellModel, { type: 'tool' | 'subtool' }>): number | null {
  for (let index = cell.events.length - 1; index >= 0; index -= 1) {
    const duration = finiteNumber(cell.events[index].payload.duration_ms);
    if (duration !== null) return duration;
  }
  return null;
}

function runDuration(cell: Extract<TrajectoryCellModel, { type: 'run' }>): number | null {
  if (!cell.startedAt || !cell.endedAt) return null;
  const duration = Date.parse(cell.endedAt) - Date.parse(cell.startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function trajectoryBadgeLabel(
  status: Extract<TrajectoryCellModel, { type: 'run' }>['trajectoryBadge']['status'],
): string {
  switch (status) {
    case 'recording': return '轨迹记录中';
    case 'complete': return '轨迹完整';
    case 'degraded': return '轨迹降级';
    case 'truncated': return '轨迹已截断';
    case 'legacy': return '历史未记录轨迹';
    case 'summary-only': return '仅运行摘要';
    case 'unknown': return '轨迹状态未知';
  }
}

function trajectoryBadgeTone(
  status: Extract<TrajectoryCellModel, { type: 'run' }>['trajectoryBadge']['status'],
): TrajectoryCellPresentation['tone'] {
  if (status === 'complete') return 'success';
  if (status === 'recording') return 'info';
  if (status === 'degraded' || status === 'truncated') return 'warn';
  return 'neutral';
}

function contextSummary(cell: Extract<TrajectoryCellModel, { type: 'context' }>): string {
  if (cell.eventType === 'context_required') {
    return boundedSummary(stringValue(cell.payload.purpose) ?? '等待补充信息');
  }
  if (cell.eventType === 'context_result') {
    return formatTrajectoryStatus(stringValue(cell.payload.status) ?? 'complete');
  }
  return boundedSummary(stringValue(cell.payload.phase)
    ?? stringValue(cell.payload.status)
    ?? '上下文已更新');
}

export function getTrajectoryCellPresentation(cell: TrajectoryCellModel): TrajectoryCellPresentation {
  switch (cell.type) {
    case 'user':
      return {
        kindLabel: '用户提问',
        summary: boundedSummary(extractTextFromBlocks(cell.message.content)) || '无文字内容',
        statusLabel: null,
        durationMs: null,
        icon: UserRound,
        tone: 'neutral',
      };
    case 'message':
      return {
        kindLabel: '回答',
        summary: boundedSummary(extractTextFromBlocks(cell.message.content)) || '回答内容待生成',
        statusLabel: cell.message.status === 'failed' ? '失败' : null,
        durationMs: null,
        icon: MessageSquare,
        tone: cell.message.status === 'failed' ? 'danger' : 'neutral',
      };
    case 'run':
      return {
        kindLabel: cell.attemptIndex === null ? '执行' : `第 ${cell.attemptIndex + 1} 次执行`,
        summary: cell.isHydrated
          ? `${cell.totalSteps} 步 · ${cell.totalToolCalls} 次工具`
          : '轨迹详情待加载',
        statusLabel: formatTrajectoryStatus(cell.runStatus),
        durationMs: runDuration(cell),
        icon: Bot,
        tone: statusTone(cell.runStatus),
        trajectoryStatusLabel: trajectoryBadgeLabel(cell.trajectoryBadge.status),
        trajectoryTone: trajectoryBadgeTone(cell.trajectoryBadge.status),
        isSkeleton: !cell.isHydrated,
      };
    case 'plan': {
      const items = Array.isArray(cell.payload.items) ? cell.payload.items.length : 0;
      return {
        kindLabel: '计划',
        summary: items > 0 ? `${items} 个步骤` : '计划已更新',
        statusLabel: cell.revision === null ? null : `第 ${cell.revision} 版`,
        durationMs: null,
        icon: ListChecks,
        tone: 'info',
      };
    }
    case 'context':
      return {
        kindLabel: '上下文',
        summary: contextSummary(cell),
        statusLabel: null,
        durationMs: null,
        icon: FileClock,
        tone: 'info',
      };
    case 'tool': {
      const meta = getToolMeta(cell.toolName ?? '');
      return {
        kindLabel: meta.label,
        summary: '工具调用',
        statusLabel: formatTrajectoryStatus(cell.status),
        durationMs: latestDuration(cell),
        icon: meta.icon,
        tone: statusTone(cell.status),
      };
    }
    case 'subtool': {
      const meta = getToolMeta(cell.toolName ?? '');
      return {
        kindLabel: '工具尝试',
        summary: `${meta.label}${cell.attemptIndex === null ? '' : ` · 第 ${cell.attemptIndex + 1} 次`}`,
        statusLabel: formatTrajectoryStatus(cell.status),
        durationMs: latestDuration(cell),
        icon: RotateCcw,
        tone: statusTone(cell.status),
      };
    }
    case 'compacted':
      return {
        kindLabel: '上下文压缩',
        summary: `移除 ${cell.removedTurns} 轮 · ${cell.removedMessages} 条消息 · ${cell.removedToolTransactions} 次工具`,
        statusLabel: '已完成',
        durationMs: null,
        icon: PackageOpen,
        tone: 'neutral',
      };
  }
}

function statusTone(status: string): TrajectoryCellPresentation['tone'] {
  if (status === 'failed') return 'danger';
  if (status === 'degraded' || status === 'limit_reached' || status === 'incomplete') return 'warn';
  if (status === 'running' || status === 'recording') return 'info';
  if (status === 'completed' || status === 'complete' || status === 'success') return 'success';
  return 'neutral';
}

function StatusIcon({ tone }: { tone: TrajectoryCellPresentation['tone'] }) {
  if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === 'danger') return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === 'warn') return <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === 'info') return <CircleEllipsis className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Wrench className="h-3.5 w-3.5" aria-hidden="true" />;
}

const TONE_CLASSES: Record<TrajectoryCellPresentation['tone'], string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warn: 'text-warn',
  danger: 'text-danger',
};

export function TrajectoryCell({
  cell,
  turnNumber,
  attemptNumber,
  selected,
  highlighted,
  active,
  position,
  setSize,
  onSelect,
  onKeyDown,
}: TrajectoryCellProps) {
  const presentation = getTrajectoryCellPresentation(cell);
  const groupLabel = turnNumber === null ? '未关联运行' : `第 ${turnNumber} 轮`;
  const kindLabel = cell.type === 'run' && attemptNumber !== null
    ? `第 ${attemptNumber} 次执行`
    : presentation.kindLabel;
  const duration = formatTrajectoryDuration(presentation.durationMs);
  const accessibleName = [
    groupLabel,
    kindLabel,
    presentation.summary,
    presentation.statusLabel,
    presentation.trajectoryStatusLabel,
    duration,
  ].filter(Boolean).join('，');
  const Icon = presentation.icon;

  return (
    <button
      id={`trajectory-cell-${position}`}
      type="button"
      role="option"
      aria-label={accessibleName}
      title={accessibleName}
      aria-selected={selected}
      aria-posinset={position}
      aria-setsize={setSize}
      data-trajectory-index={position - 1}
      data-highlighted={highlighted ? 'true' : 'false'}
      tabIndex={active ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      style={{ height: `${TRAJECTORY_ROW_HEIGHT}px` }}
      className={cn(
        'group flex w-full shrink-0 cursor-pointer items-center gap-3 border-b border-border/40 px-3 text-left outline-none transition-colors',
        'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-primary/[0.08]',
        highlighted && 'bg-primary/[0.12] ring-2 ring-inset ring-primary/50',
      )}
    >
      <span className="w-20 shrink-0 truncate text-[11px] font-medium text-muted-foreground">
        {groupLabel}
      </span>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60', TONE_CLASSES[presentation.tone])}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{kindLabel}</span>
          {presentation.statusLabel && (
            <span className={cn('inline-flex shrink-0 items-center gap-1 text-[11px]', TONE_CLASSES[presentation.tone])}>
              <StatusIcon tone={presentation.tone} />
              {presentation.statusLabel}
            </span>
          )}
          {presentation.trajectoryStatusLabel && (
            <span className={cn(
              'inline-flex shrink-0 items-center gap-1 text-[11px]',
              TONE_CLASSES[presentation.trajectoryTone ?? 'neutral'],
            )}>
              {presentation.trajectoryTone === 'success'
                ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
              {presentation.trajectoryStatusLabel}
            </span>
          )}
        </span>
        {presentation.isSkeleton && cell.type === 'run' ? (
          <span
            data-testid={`trajectory-cell-skeleton-${cell.runId}`}
            className="mt-1 block h-2 w-28 rounded bg-muted"
            aria-hidden="true"
          />
        ) : (
          <span className="block truncate text-xs text-muted-foreground">{presentation.summary}</span>
        )}
      </span>
      {duration && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{duration}</span>}
    </button>
  );
}
