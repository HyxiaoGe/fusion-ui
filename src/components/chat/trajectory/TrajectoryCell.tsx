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
import {
  formatTrajectoryDuration,
  getTrajectoryCellPresentation,
  type TrajectoryCellPresentation,
} from '@/lib/trajectory/trajectoryCellPresentation';
import { TRAJECTORY_ROW_HEIGHT } from '@/lib/trajectory/virtualRange';
import { getToolMeta } from '@/lib/agent/toolRegistry';
import { cn } from '@/lib/utils';

export {
  formatTrajectoryDuration,
  formatTrajectoryStatus,
  getTrajectoryCellPresentation,
  type TrajectoryCellPresentation,
} from '@/lib/trajectory/trajectoryCellPresentation';

export interface TrajectoryCellProps {
  cell: TrajectoryCellModel;
  turnNumber: number | null;
  attemptNumber: number | null;
  selected: boolean;
  highlighted: boolean;
  active: boolean;
  position: number;
  setSize: number;
  sourceNumber?: number;
  kindLabel?: string;
  summary?: string;
  statusLabel?: string | null;
  durationMs?: number | null;
  attemptCount?: number;
  collapsedAttemptCount?: number;
  searchQuery?: string;
  matched?: boolean;
  matchPending?: boolean;
  matchFieldLabel?: string | null;
  matchExcerpt?: string | null;
  onSelect: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
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
  sourceNumber = position,
  kindLabel: providedKindLabel,
  summary: providedSummary,
  statusLabel: providedStatusLabel,
  durationMs: providedDurationMs,
  attemptCount = 0,
  collapsedAttemptCount = 0,
  searchQuery = '',
  matched = false,
  matchPending = false,
  matchFieldLabel = null,
  matchExcerpt = null,
  onSelect,
  onKeyDown,
}: TrajectoryCellProps) {
  const presentation = getTrajectoryCellPresentation(cell);
  const groupLabel = turnNumber === null ? '未关联运行' : `第 ${turnNumber} 轮`;
  const attemptLabel = attemptNumber === null
    ? null
    : cell.type === 'subtool'
      ? `第 ${attemptNumber} 次尝试`
      : `第 ${attemptNumber} 次执行`;
  const turnAttemptLabel = [groupLabel, attemptLabel].filter(Boolean).join(' · ');
  const kindLabel = providedKindLabel ?? presentation.kindLabel;
  const summary = providedSummary ?? presentation.summary;
  const statusLabel = providedStatusLabel === undefined
    ? presentation.statusLabel
    : providedStatusLabel;
  const duration = formatTrajectoryDuration(
    providedDurationMs === undefined ? presentation.durationMs : providedDurationMs,
  );
  const accessibleName = [
    matched ? '搜索命中' : null,
    `#${sourceNumber}`,
    turnAttemptLabel,
    kindLabel,
    presentation.kindLabel === kindLabel ? null : presentation.kindLabel,
    summary,
    matchPending ? '匹配待确认' : null,
    matchExcerpt && matchFieldLabel ? `命中${matchFieldLabel}：${matchExcerpt}` : null,
    statusLabel,
    presentation.trajectoryStatusLabel,
    attemptCount > 0 ? `${attemptCount} 次尝试` : null,
    collapsedAttemptCount > 0 ? `已折叠的 ${collapsedAttemptCount} 次成功尝试` : null,
    duration,
  ].filter(Boolean).join('，');
  const Icon = trajectoryCellIcon(cell);

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
      data-trajectory-key={cell.key}
      data-highlighted={highlighted ? 'true' : 'false'}
      tabIndex={active ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      style={{ height: `${TRAJECTORY_ROW_HEIGHT}px` }}
      className={cn(
        'group grid w-full shrink-0 cursor-pointer grid-cols-[3rem_minmax(7.5rem,0.9fr)_minmax(4.5rem,0.55fr)_minmax(12rem,2.5fr)_minmax(8rem,1fr)_5.5rem] items-center gap-2 border-b border-border/40 px-3 text-left outline-none transition-colors',
        'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        selected && 'bg-primary/[0.08]',
        highlighted && 'bg-primary/[0.12] ring-2 ring-inset ring-primary/50',
      )}
    >
      <span className="truncate text-xs tabular-nums text-muted-foreground">
        #{sourceNumber}
      </span>
      <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">
        {turnAttemptLabel}
      </span>
      <span className={cn(
        'flex min-w-0 items-center gap-1.5 truncate text-xs font-medium',
        TONE_CLASSES[presentation.tone],
      )}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          <HighlightText text={kindLabel} query={searchQuery} />
          {' '}
          <span className="font-mono text-[10px] opacity-70">
            <HighlightText text={cell.type} query={searchQuery} />
          </span>
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {presentation.isSkeleton && cell.type === 'run' ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
            <span
              data-testid={`trajectory-cell-skeleton-${cell.runId}`}
              className="block h-2 w-12 shrink-0 rounded bg-muted"
              aria-hidden="true"
            />
            <span className="truncate">
              <HighlightText text={summary} query={searchQuery} />
            </span>
          </span>
        ) : matchExcerpt ? (
          <span className="flex min-w-0 flex-1 items-center gap-1 text-xs text-foreground">
            <span className="shrink-0 text-muted-foreground">命中正文：</span>
            <span className="min-w-0 truncate">
              <HighlightText text={matchExcerpt} query={searchQuery} />
            </span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            <HighlightText text={summary} query={searchQuery} />
          </span>
        )}
        {attemptCount > 0 && (
          <span className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {attemptCount} 次尝试
          </span>
        )}
        {matched && (
          <span className="shrink-0 rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">
            匹配
          </span>
        )}
        {matchPending && (
          <span className="shrink-0 rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">
            匹配待确认
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        {statusLabel ? (
          <span className={cn(
            'inline-flex min-w-0 items-center gap-1 truncate text-[11px]',
            TONE_CLASSES[presentation.tone],
          )}>
            <StatusIcon tone={presentation.tone} />
            <HighlightText text={statusLabel} query={searchQuery} />
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" aria-hidden="true">—</span>
        )}
        {presentation.trajectoryStatusLabel && (
          <span className={cn(
            'inline-flex min-w-0 items-center gap-1 truncate text-[10px]',
            TONE_CLASSES[presentation.trajectoryTone ?? 'neutral'],
          )}>
            {presentation.trajectoryTone === 'success'
              ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              : <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span className="truncate">
              <HighlightText text={presentation.trajectoryStatusLabel} query={searchQuery} />
            </span>
          </span>
        )}
      </span>
      <span className="truncate text-right text-xs tabular-nums text-muted-foreground">
        {duration ?? '—'}
      </span>
    </button>
  );
}

function trajectoryCellIcon(cell: TrajectoryCellModel): LucideIcon {
  switch (cell.type) {
    case 'user': return UserRound;
    case 'message': return MessageSquare;
    case 'run': return Bot;
    case 'plan': return ListChecks;
    case 'context': return FileClock;
    case 'tool': return getToolMeta(cell.toolName ?? '').icon;
    case 'subtool': return RotateCcw;
    case 'compacted': return PackageOpen;
  }
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return text;
  const normalizedText = text.toLocaleLowerCase();
  const parts: React.ReactNode[] = [];
  let startIndex = 0;
  let matchIndex = normalizedText.indexOf(normalizedQuery, startIndex);
  while (matchIndex >= 0) {
    if (matchIndex > startIndex) parts.push(text.slice(startIndex, matchIndex));
    const endIndex = matchIndex + normalizedQuery.length;
    parts.push(
      <mark
        key={`${matchIndex}-${endIndex}`}
        data-trajectory-match="true"
        className="bg-warn/15 font-semibold text-inherit underline decoration-warn/70 underline-offset-2"
      >
        {text.slice(matchIndex, endIndex)}
      </mark>,
    );
    startIndex = endIndex;
    matchIndex = normalizedText.indexOf(normalizedQuery, startIndex);
  }
  if (startIndex === 0) return text;
  if (startIndex < text.length) parts.push(text.slice(startIndex));
  return parts;
}
