'use client';

import { useEffect, useMemo, useState } from 'react';
import { Eye, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { RUN_STATUS_TREATMENT } from '@/lib/agent/statusTreatment';
import { getToolErrorDisplay } from '@/lib/agent/toolErrorDisplay';
import type { TrajectoryBadgeStatus } from '@/lib/trajectory/TrajectoryCellProjection';
import { cn } from '@/lib/utils';
import type { AgentRunState } from '@/types/agentRun';
import { formatTrajectoryDuration } from './TrajectoryCell';

export interface TrajectoryStatusLineProps {
  run: AgentRunState;
  trajectoryStatus: TrajectoryBadgeStatus;
  onInspect?: () => void;
}

const DOT_CLASS: Record<AgentRunState['status'], string> = {
  running: 'bg-info',
  completed: 'bg-success',
  limit_reached: 'bg-warn',
  incomplete: 'bg-warn',
  interrupted: 'bg-muted-foreground',
  failed: 'bg-danger',
};

const BADGE_LABEL: Record<TrajectoryBadgeStatus, string> = {
  recording: '轨迹记录中',
  complete: '轨迹完整',
  degraded: '轨迹降级',
  truncated: '轨迹已截断',
  legacy: '历史未记录轨迹',
  'summary-only': '仅运行摘要',
  unknown: '轨迹状态未知',
};

const BADGE_CLASS: Record<TrajectoryBadgeStatus, string> = {
  recording: 'border-info/30 bg-info-bg text-info',
  complete: 'border-success/30 bg-success-bg text-success',
  degraded: 'border-warn/30 bg-warn/5 text-warn',
  truncated: 'border-warn/30 bg-warn/5 text-warn',
  legacy: 'border-border bg-muted/50 text-muted-foreground',
  'summary-only': 'border-border bg-muted/50 text-muted-foreground',
  unknown: 'border-border bg-muted/50 text-muted-foreground',
};

function boundedIssue(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function highestPriorityIssue(run: AgentRunState): string | null {
  const runFailure = boundedIssue(run.failure?.message);
  if (runFailure) return runFailure;

  for (const step of run.steps) {
    for (const toolCall of step.toolCalls) {
      if (toolCall.status === 'failed') {
        return boundedIssue(getToolErrorDisplay(
          toolCall.toolName,
          toolCall.status,
          toolCall.error,
        )) ?? '工具执行失败';
      }
    }
  }
  if (run.steps.some(step => step.status === 'failed')) return '执行步骤失败';

  for (const step of run.steps) {
    for (const toolCall of step.toolCalls) {
      if (toolCall.status === 'degraded') {
        return boundedIssue(getToolErrorDisplay(
          toolCall.toolName,
          toolCall.status,
          toolCall.error,
        )) ?? '部分工具结果不可用';
      }
    }
  }
  if (run.status === 'limit_reached') return '执行已达到上限';
  if (run.status === 'incomplete') return '任务仅部分完成';
  if (run.status === 'interrupted') return '执行已中断';
  return null;
}

function runDuration(run: AgentRunState, now: number): number | null {
  const starts = run.steps
    .map(step => step.startedAt)
    .filter(value => Number.isFinite(value));
  if (starts.length === 0) return null;

  const startedAt = Math.min(...starts);
  const completed = run.steps
    .map(step => step.completedAt)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const endedAt = run.status === 'running'
    ? now
    : completed.length > 0
      ? Math.max(...completed)
      : null;
  return endedAt === null ? null : Math.max(0, endedAt - startedAt);
}

export function TrajectoryStatusLine({ run, trajectoryStatus, onInspect }: TrajectoryStatusLineProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (run.status !== 'running') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [run.status]);

  const duration = formatTrajectoryDuration(runDuration(run, now)) ?? '未知';
  const issue = useMemo(() => highestPriorityIssue(run), [run]);
  const statusTreatment = RUN_STATUS_TREATMENT[run.status];

  return (
    <div
      role="group"
      aria-label="Agent 运行状态"
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5 text-xs text-muted-foreground"
    >
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <span
          data-testid="agent-status-dot"
          aria-hidden="true"
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT_CLASS[run.status])}
        />
        Agent {statusTreatment.label}
      </span>
      <span
        aria-label={duration === '未知' ? 'Agent 运行耗时未知' : `Agent 运行耗时 ${duration}`}
        aria-live="off"
      >
        {duration === '未知' ? '耗时未知' : `耗时 ${duration}`}
      </span>
      {issue && (
        <span className="inline-flex min-w-0 items-center gap-1 text-warn">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{issue}</span>
        </span>
      )}
      <span
        data-trajectory-badge={trajectoryStatus}
        className={cn('rounded-full border px-1.5 py-0.5 font-medium', BADGE_CLASS[trajectoryStatus])}
      >
        {BADGE_LABEL[trajectoryStatus]}
      </span>
      {onInspect && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onInspect}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          查看轨迹
        </Button>
      )}
    </div>
  );
}

export default TrajectoryStatusLine;
