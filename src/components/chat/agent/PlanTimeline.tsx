'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CirclePause,
  CircleX,
  Loader2,
  MinusCircle,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { AgentPlanItem, AgentRunState } from '@/types/agentRun';
import { cn } from '@/lib/utils';

export function PlanTimeline({ run, className = '' }: { run: AgentRunState; className?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const items = getDisplayItems(run);
  if (!items.length) return null;

  const completedCount = items.filter(item => item.status === 'completed').length;
  const skippedCount = items.filter(item => item.status === 'skipped').length;
  const overview = getPlanOverview(run, items, completedCount, skippedCount);

  function openTemporarily() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsOpen(true);
  }

  function closeTemporarily() {
    if (isPinned) return;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      closeTimerRef.current = null;
    }, 80);
  }

  function togglePinned() {
    setIsPinned(previous => {
      const next = !previous;
      setIsOpen(next);
      return next;
    });
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setIsPinned(false);
      }}
    >
      <div
        data-testid="plan-overview"
        className={cn('mb-2 w-fit max-w-full', className)}
        onMouseEnter={openTemporarily}
        onMouseLeave={closeTemporarily}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            aria-label={overview.ariaLabel}
            className="group flex h-8 max-w-full items-center gap-2 rounded-full border border-border/50 bg-background px-2.5 text-left text-xs shadow-sm transition-colors duration-fast hover:border-border hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={(event) => {
              event.preventDefault();
              togglePinned();
            }}
            onFocus={openTemporarily}
            onBlur={closeTemporarily}
          >
            <PlanProgressRing completedCount={completedCount} items={items} />
            <span className="min-w-0 truncate font-medium text-foreground/90">
              {overview.label}
            </span>
            {overview.detail ? (
              <>
                <span className="shrink-0 text-muted-foreground" aria-hidden="true">·</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {overview.detail}
                </span>
              </>
            ) : null}
            {run.config.taskMode === 'deep_research' ? (
              <span className="shrink-0 rounded-full border border-info/25 bg-info-bg px-1.5 py-0.5 text-[10px] font-medium text-info">
                深度研究
              </span>
            ) : null}
            <ChevronDown
              className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-fast motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          role="dialog"
          aria-label="计划流程详情"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          className="max-h-[min(26rem,calc(100vh-2rem))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border-border/60 bg-popover p-3 text-popover-foreground shadow-fdv2-md motion-reduce:animate-none"
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          onMouseEnter={openTemporarily}
          onMouseLeave={closeTemporarily}
          onFocusCapture={openTemporarily}
          onBlurCapture={closeTemporarily}
        >
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="text-xs font-medium text-foreground">执行计划</div>
            <div className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {overview.summary}
            </div>
          </div>
          <ol aria-label="计划步骤" className="space-y-2">
            {items.map(item => <PlanItemRow key={item.id} item={item} />)}
          </ol>
        </PopoverContent>
      </div>
    </Popover>
  );
}

interface PlanOverviewContent {
  ariaLabel: string;
  label: string;
  detail: string;
  summary: string;
}

function getPlanOverview(
  run: AgentRunState,
  items: AgentPlanItem[],
  completedCount: number,
  skippedCount: number,
): PlanOverviewContent {
  const totalCount = items.length;
  if (run.status === 'running') {
    const currentItem = getCurrentItem(items);
    const currentIndex = Math.max(0, items.indexOf(currentItem)) + 1;
    return {
      ariaLabel: `查看计划流程，第 ${currentIndex}/${totalCount} 步：${currentItem.title}`,
      label: `第 ${currentIndex}/${totalCount} 步`,
      detail: currentItem.title,
      summary: `已完成 ${completedCount}/${totalCount}`,
    };
  }

  if (run.status === 'interrupted') {
    return {
      ariaLabel: `查看计划流程，计划已停止，已完成 ${completedCount}/${totalCount}`,
      label: '计划已停止',
      detail: '已保留完成结果',
      summary: `已完成 ${completedCount}/${totalCount}`,
    };
  }

  const failedCount = items.filter(item => item.status === 'failed').length;
  if (failedCount > 0 || run.status === 'failed') {
    const failureDetail = failedCount > 0 ? `${failedCount} 项失败` : '运行失败';
    return {
      ariaLabel: failedCount > 0
        ? `查看计划流程，计划已结束，已完成 ${completedCount}/${totalCount}，${failureDetail}`
        : `查看计划流程，计划运行失败，已完成 ${completedCount}/${totalCount}`,
      label: '计划已结束',
      detail: failureDetail,
      summary: `已完成 ${completedCount}/${totalCount}`,
    };
  }

  const unresolvedCount = items.filter(item => (
    item.status === 'pending'
    || item.status === 'running'
    || item.status === 'blocked'
  )).length;
  if (run.status === 'completed' && unresolvedCount === 0) {
    const skippedDetail = skippedCount > 0 ? `跳过 ${skippedCount}` : '全部步骤已完成';
    return {
      ariaLabel: skippedCount > 0
        ? `查看计划流程，完成 ${completedCount}/${totalCount}，跳过 ${skippedCount}`
        : `查看计划流程，计划已完成 ${completedCount}/${totalCount}`,
      label: skippedCount > 0 ? `完成 ${completedCount}/${totalCount}` : '计划已完成',
      detail: skippedDetail,
      summary: skippedCount > 0
        ? `完成 ${completedCount}/${totalCount} · 跳过 ${skippedCount}`
        : `已完成 ${completedCount}/${totalCount}`,
    };
  }

  return {
    ariaLabel: `查看计划流程，计划已结束，已完成 ${completedCount}/${totalCount}`,
    label: '计划已结束',
    detail: '部分步骤未完成',
    summary: `已完成 ${completedCount}/${totalCount}`,
  };
}

function PlanProgressRing({
  completedCount,
  items,
}: {
  completedCount: number;
  items: AgentPlanItem[];
}) {
  const percentage = Math.round((completedCount / items.length) * 100);

  return (
    <span
      role="progressbar"
      aria-label="计划完成进度"
      aria-valuemin={0}
      aria-valuemax={items.length}
      aria-valuenow={completedCount}
      aria-valuetext={`已完成 ${completedCount}/${items.length} 个步骤`}
      className="relative grid h-4 w-4 shrink-0 place-items-center"
    >
      <svg className="h-4 w-4 -rotate-90" viewBox="0 0 20 20" aria-hidden="true">
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-border/70"
        />
        <circle
          data-testid="plan-progress-value"
          cx="10"
          cy="10"
          r="8"
          pathLength="100"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
          strokeDasharray="100"
          strokeDashoffset={100 - percentage}
          className={`${getProgressToneClass(items)} transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none`}
        />
      </svg>
    </span>
  );
}

function PlanItemRow({ item }: { item: AgentPlanItem }) {
  const Icon = getStatusIcon(item.status);

  return (
    <li className="flex min-w-0 items-start gap-2.5">
      <span
        data-testid={`plan-status-${item.id}`}
        title={getStatusLabel(item.status)}
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${getStatusToneClass(item.status)}`}
      >
        <Icon className={getStatusIconClass(item.status)} aria-hidden="true" />
        <span className="sr-only">{getStatusLabel(item.status)}</span>
      </span>
      <span className="min-w-0 flex-1 break-words text-xs leading-5 text-foreground/90">
        {item.title}
      </span>
    </li>
  );
}

function getCurrentItem(items: AgentPlanItem[]): AgentPlanItem {
  return items.find(item => item.status === 'running')
    ?? items.find(item => item.status === 'blocked')
    ?? items.find(item => item.status === 'failed')
    ?? items.find(item => item.status === 'pending')
    ?? items[items.length - 1];
}

function getDisplayItems(run: AgentRunState): AgentPlanItem[] {
  const items = run.plan?.items ?? [];
  if (!items.length) return items;
  // 模型计划的 item 状态由服务端计划执行器负责收口；前端不能根据 kind、
  // 工具推测是否成功。run 已进入终态时只执行协议不变量收口：终态不能保留
  // running spinner，但不会把未知步骤猜成 completed。
  if (run.plan?.source === 'model') {
    if (run.status === 'running') return items;
    return items.map(item => normalizeTerminalModelPlanItem(run.status, item));
  }
  if (!shouldNormalizeTerminalPlan(run.status)) return items;

  return items.map(item => normalizeCompletedRunItem(run, item));
}

function normalizeTerminalModelPlanItem(
  runStatus: AgentRunState['status'],
  item: AgentPlanItem,
): AgentPlanItem {
  if (item.status !== 'running') return item;
  if (runStatus === 'interrupted') return { ...item, status: 'skipped' };
  if (runStatus === 'failed') return { ...item, status: 'failed' };
  return { ...item, status: 'blocked' };
}

function shouldNormalizeTerminalPlan(status: AgentRunState['status']): boolean {
  return status === 'completed'
    || status === 'limit_reached'
    || status === 'incomplete';
}

function normalizeCompletedRunItem(run: AgentRunState, item: AgentPlanItem): AgentPlanItem {
  const status = normalizeCompletedRunStatus(run, item);
  const summary = normalizeCompletedRunSummary(run, item, status);
  if (status === item.status && summary === item.summary) return item;
  return { ...item, status, summary };
}

function normalizeCompletedRunStatus(
  run: AgentRunState,
  item: AgentPlanItem,
): AgentPlanItem['status'] {
  if (item.status === 'failed' || item.status === 'blocked' || item.status === 'skipped') {
    return item.status;
  }
  if (item.kind === 'search' || item.kind === 'read') {
    return shouldTreatAsCompleted(run, item) ? 'completed' : 'skipped';
  }
  if (item.status !== 'running' && item.status !== 'pending') return item.status;
  return shouldTreatAsCompleted(run, item) ? 'completed' : 'skipped';
}

function shouldTreatAsCompleted(run: AgentRunState, item: AgentPlanItem): boolean {
  if (item.kind === 'reasoning' || item.kind === 'synthesis' || item.kind === 'answer') {
    return true;
  }
  if (item.kind === 'search') return hasToolOrEvidence(run, item);
  if (item.kind === 'read') return hasReadToolOrEvidence(run, item);
  return true;
}

function normalizeCompletedRunSummary(
  run: AgentRunState,
  item: AgentPlanItem,
  normalizedStatus: AgentPlanItem['status'],
): string | undefined {
  if (isInFlightSummary(item.summary) && normalizedStatus !== item.status) {
    return getNormalizedSummary(normalizedStatus, item.kind);
  }
  if (item.summary !== '完成 0 个工具调用') return item.summary;
  const toolCount = Math.max(run.totalToolCalls, run.toolDigests?.length ?? 0);
  if (toolCount <= 0) return undefined;
  return `完成 ${toolCount} 个工具调用`;
}

function isInFlightSummary(summary: string | undefined): boolean {
  return Boolean(summary?.trim().startsWith('正在'));
}

function getNormalizedSummary(
  status: AgentPlanItem['status'],
  kind: AgentPlanItem['kind'],
): string | undefined {
  if (status === 'skipped' || status !== 'completed') return undefined;
  switch (kind) {
    case 'reasoning':
      return '已完成问题理解';
    case 'search':
      return '已完成资料查找';
    case 'read':
      return '已完成关键来源读取';
    case 'synthesis':
    case 'answer':
      return '已完成回答整理';
    case 'other':
      return '已完成该步骤';
    default: {
      void (kind as never);
      return undefined;
    }
  }
}

function hasToolOrEvidence(run: AgentRunState, item: AgentPlanItem): boolean {
  return hasTool(run, 'web_search') || hasEvidence(run, item);
}

function hasReadToolOrEvidence(run: AgentRunState, item: AgentPlanItem): boolean {
  return hasTool(run, 'url_read') || hasEvidence(run, item);
}

function hasEvidence(run: AgentRunState, item: AgentPlanItem): boolean {
  const evidence = run.evidence ?? [];
  if (!evidence.length) return false;
  if (!item.evidenceItemIds.length) return true;
  const existingIds = new Set(evidence.map(evidenceItem => evidenceItem.id));
  return item.evidenceItemIds.some(id => existingIds.has(id));
}

function hasTool(run: AgentRunState, toolName: string): boolean {
  return run.steps.some(step => step.toolCalls.some(call => call.toolName === toolName))
    || Boolean(run.toolDigests?.some(digest => digest.toolName === toolName));
}

function getStatusIcon(status: AgentPlanItem['status']) {
  if (status === 'running') return Loader2;
  if (status === 'completed') return CheckCircle2;
  if (status === 'blocked') return CirclePause;
  if (status === 'failed') return CircleX;
  if (status === 'skipped') return MinusCircle;
  return Circle;
}

function getStatusIconClass(status: AgentPlanItem['status']): string {
  const baseClass = 'h-3 w-3';
  return status === 'running'
    ? `${baseClass} animate-spin motion-reduce:animate-none`
    : baseClass;
}

function getStatusToneClass(status: AgentPlanItem['status']): string {
  if (status === 'running') return 'bg-info-bg/60 text-info';
  if (status === 'completed') return 'bg-success-bg/60 text-success';
  if (status === 'blocked') return 'bg-warn-bg/60 text-warn';
  if (status === 'failed') return 'bg-danger-bg/60 text-danger';
  return 'bg-muted/50 text-muted-foreground';
}

function getStatusLabel(status: AgentPlanItem['status']): string {
  switch (status) {
    case 'pending':
      return '等待中';
    case 'running':
      return '进行中';
    case 'completed':
      return '已完成';
    case 'blocked':
      return '已阻塞';
    case 'failed':
      return '失败';
    case 'skipped':
      return '已跳过';
    default: {
      void (status as never);
      return '等待中';
    }
  }
}

function getProgressToneClass(items: AgentPlanItem[]): string {
  if (items.some(item => item.status === 'failed')) return 'text-danger';
  if (items.some(item => item.status === 'blocked')) return 'text-warn';
  if (items.every(item => item.status === 'completed')) return 'text-success';
  if (items.some(item => item.status === 'running')) return 'text-info';
  return 'text-muted-foreground';
}
