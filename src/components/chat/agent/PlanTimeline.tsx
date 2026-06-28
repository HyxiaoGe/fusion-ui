'use client';

import { AlertCircle, CheckCircle2, Circle, Loader2, MinusCircle } from 'lucide-react';
import type { AgentPlanItem, AgentRunState } from '@/types/agentRun';

export function PlanTimeline({ run }: { run: AgentRunState }) {
  const items = run.plan?.items ?? [];
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
