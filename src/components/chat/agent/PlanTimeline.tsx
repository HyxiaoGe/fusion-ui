'use client';

import { AlertCircle, CheckCircle2, Circle, Loader2, MinusCircle } from 'lucide-react';
import type { AgentPlanItem, AgentRunState } from '@/types/agentRun';

export function PlanTimeline({ run }: { run: AgentRunState }) {
  const items = getDisplayItems(run);
  if (!items.length) return null;

  return (
    <div className="mb-2 space-y-1.5">
      {items.map(item => (
        <PlanItemRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function PlanItemRow({ item }: { item: AgentPlanItem }) {
  const Icon = getStatusIcon(item.status);
  const statusClass = getStatusClass(item.status);

  return (
    <div className="flex items-start gap-2 rounded-md border border-border/30 bg-transparent px-2.5 py-1.5">
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${statusClass}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-xs text-foreground/90">{item.title}</span>
          <span className="shrink-0 rounded bg-muted/35 px-1 py-0.5 text-[10px] text-muted-foreground">
            {getKindLabel(item.kind)}
          </span>
        </div>
        {item.summary && (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={item.summary}>
            {item.summary}
          </div>
        )}
      </div>
    </div>
  );
}

function getDisplayItems(run: AgentRunState): AgentPlanItem[] {
  const items = run.plan?.items ?? [];
  if (!items.length) return items;
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
  if (status === 'failed' || status === 'blocked') return AlertCircle;
  if (status === 'skipped') return MinusCircle;
  return Circle;
}

function getStatusClass(status: AgentPlanItem['status']): string {
  if (status === 'running') return 'text-info animate-spin motion-reduce:animate-none';
  if (status === 'completed') return 'text-success';
  if (status === 'failed' || status === 'blocked') return 'text-danger';
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
