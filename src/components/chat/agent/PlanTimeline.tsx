'use client';

import { useId, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CirclePause,
  CircleX,
  Loader2,
  MinusCircle,
} from 'lucide-react';
import type { AgentPlanItem, AgentRunState } from '@/types/agentRun';

export function PlanTimeline({ run }: { run: AgentRunState }) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const isHoveredRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const items = getDisplayItems(run);
  if (!items.length) return null;

  const completedCount = items.filter(item => item.status === 'completed').length;
  const overview = getPlanOverview(run, items, completedCount);

  function handleMouseEnter() {
    isHoveredRef.current = true;
    setIsOpen(true);
  }

  function handleMouseLeave() {
    isHoveredRef.current = false;
    if (!isPinned && !rootRef.current?.contains(document.activeElement)) {
      setIsOpen(false);
    }
  }

  function handleBlur(relatedTarget: EventTarget | null) {
    if (
      !isPinned
      && !isHoveredRef.current
      && !rootRef.current?.contains(relatedTarget as Node | null)
    ) {
      setIsOpen(false);
    }
  }

  function togglePinned() {
    setIsPinned(previous => {
      const next = !previous;
      setIsOpen(next);
      return next;
    });
  }

  return (
    <div
      ref={rootRef}
      data-testid="plan-overview"
      className="relative mb-2 w-fit max-w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={() => setIsOpen(true)}
      onBlurCapture={event => handleBlur(event.relatedTarget)}
    >
      <button
        type="button"
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={overview.ariaLabel}
        className="group flex max-w-full items-center gap-2 rounded-lg border border-border/40 bg-background/60 px-2 py-1.5 text-left transition-colors duration-fast hover:border-border/70 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={togglePinned}
      >
        <PlanProgressRing
          completedCount={completedCount}
          items={items}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[10px] leading-none text-muted-foreground">
            <span>计划进度</span>
            <span className="font-medium tabular-nums text-foreground/80">
              {completedCount}/{items.length}
            </span>
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {overview.label}
            </span>
            <span className="truncate text-xs font-medium text-foreground/90">
              {overview.detail}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-fast motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="dialog"
          aria-label="计划流程详情"
          className="absolute left-0 top-[calc(100%+0.375rem)] z-40 max-h-[min(26rem,calc(100vh-2rem))] w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border/60 bg-popover/98 p-3 text-popover-foreground shadow-fdv2-md animate-in fade-in-0 zoom-in-95 duration-fast motion-reduce:animate-none"
        >
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground">执行计划</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {items.length} 个步骤
              </div>
            </div>
            <div className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              已完成 {completedCount}/{items.length}
            </div>
          </div>
          <ol aria-label="计划步骤" className="space-y-2">
            {items.map((item, index) => (
              <PlanItemRow
                key={item.id}
                item={item}
                dependencyTitles={getDependencyTitles(item, items)}
                isLast={index === items.length - 1}
              />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

interface PlanOverviewContent {
  ariaLabel: string;
  label: string;
  detail: string;
}

function getPlanOverview(
  run: AgentRunState,
  items: AgentPlanItem[],
  completedCount: number,
): PlanOverviewContent {
  const totalCount = items.length;
  if (run.status === 'running') {
    const currentItem = getCurrentItem(items);
    return {
      ariaLabel: `查看计划流程，已完成 ${completedCount}/${totalCount}，当前步骤：${currentItem.title}`,
      label: '当前步骤',
      detail: currentItem.title,
    };
  }

  if (run.status === 'interrupted') {
    return {
      ariaLabel: `查看计划流程，计划已停止，已完成 ${completedCount}/${totalCount}`,
      label: '计划已停止',
      detail: '已保留完成结果',
    };
  }

  const failedCount = items.filter(item => item.status === 'failed').length;
  if (failedCount > 0) {
    return {
      ariaLabel: `查看计划流程，计划已结束，已完成 ${completedCount}/${totalCount}，${failedCount} 项失败`,
      label: '计划已结束',
      detail: `${failedCount} 项失败`,
    };
  }

  if (completedCount === totalCount) {
    return {
      ariaLabel: `查看计划流程，计划已完成 ${completedCount}/${totalCount}`,
      label: '计划已完成',
      detail: '全部步骤已完成',
    };
  }

  return {
    ariaLabel: `查看计划流程，计划已结束，已完成 ${completedCount}/${totalCount}`,
    label: '计划已结束',
    detail: '部分步骤未完成',
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
      className="relative grid h-8 w-8 shrink-0 place-items-center"
    >
      <svg className="h-8 w-8 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r="15.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-border/55"
        />
        <circle
          data-testid="plan-progress-value"
          cx="18"
          cy="18"
          r="15.5"
          pathLength="100"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
          strokeDasharray="100"
          strokeDashoffset={100 - percentage}
          className={`${getProgressToneClass(items)} transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none`}
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums text-foreground/80">
        {completedCount}
      </span>
    </span>
  );
}

function PlanItemRow({
  item,
  dependencyTitles,
  isLast,
}: {
  item: AgentPlanItem;
  dependencyTitles: string[];
  isLast: boolean;
}) {
  const Icon = getStatusIcon(item.status);

  return (
    <li className="relative flex min-w-0 items-start gap-2.5">
      {!isLast && (
        <span
          className="absolute bottom-[-0.5rem] left-[0.4375rem] top-5 w-px bg-border/55"
          aria-hidden="true"
        />
      )}
      <span
        data-testid={`plan-status-${item.id}`}
        className={`relative z-10 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getStatusToneClass(item.status)}`}
      >
        <Icon className={getStatusIconClass(item.status)} aria-hidden="true" />
        {getStatusLabel(item.status)}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground/90">{item.title}</span>
          <span className="shrink-0 rounded bg-muted/45 px-1 py-0.5 text-[10px] text-muted-foreground">
            {getKindLabel(item.kind)}
          </span>
        </div>
        {dependencyTitles.length > 0 && (
          <div className="mt-1 truncate text-[10px] text-muted-foreground">
            依赖：{dependencyTitles.join('、')}
          </div>
        )}
      </div>
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

function getDependencyTitles(item: AgentPlanItem, items: AgentPlanItem[]): string[] {
  if (!item.dependsOn?.length) return [];
  const titleById = new Map(items.map(planItem => [planItem.id, planItem.title]));
  return item.dependsOn.map(dependencyId => titleById.get(dependencyId) ?? '前置步骤');
}

function getDisplayItems(run: AgentRunState): AgentPlanItem[] {
  const items = run.plan?.items ?? [];
  if (!items.length) return items;
  // 模型计划的 item 状态由服务端计划执行器负责收口；前端不能根据 kind、
  // 工具或 run 终态二次猜测，否则会把未完成步骤误标为成功。
  if (run.plan?.source === 'model') return items;
  if (!shouldNormalizeTerminalPlan(run.status)) return items;

  return items.map(item => normalizeCompletedRunItem(run, item));
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
  if (item.kind === 'search') {
    return hasToolOrEvidence(run, item);
  }
  if (item.kind === 'read') {
    return hasReadToolOrEvidence(run, item);
  }
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
  if (!summary) return false;
  return summary.trim().startsWith('正在');
}

function getNormalizedSummary(
  status: AgentPlanItem['status'],
  kind: AgentPlanItem['kind'],
): string | undefined {
  if (status === 'skipped') return undefined;
  if (status !== 'completed') return undefined;

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
  return hasTool(run, 'web_search')
    || hasEvidence(run, item);
}

function hasReadToolOrEvidence(run: AgentRunState, item: AgentPlanItem): boolean {
  return hasTool(run, 'url_read')
    || hasEvidence(run, item);
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
  if (status === 'running') {
    return `${baseClass} animate-spin motion-reduce:animate-none`;
  }
  return baseClass;
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

function getKindLabel(kind: AgentPlanItem['kind']): string {
  switch (kind) {
    case 'reasoning':
      return '思考';
    case 'search':
      return '搜索';
    case 'read':
      return '阅读';
    case 'synthesis':
      return '整理';
    case 'answer':
      return '回答';
    case 'other':
      return '任务';
    default: {
      void (kind as never);
      return '任务';
    }
  }
}
