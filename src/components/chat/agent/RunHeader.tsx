'use client';

import type { AgentRunState } from '@/types/agentRun';
import { RUN_STATUS_TREATMENT } from '@/lib/agent/statusTreatment';
import type { SemanticColor } from '@/lib/agent/toolRegistry';

/**
 * Run 头部：已用 N/maxSteps 步 · X.Ys · status 标签。
 * contract §13。
 */
export function RunHeader({ run }: { run: AgentRunState }) {
  const usedSteps = run.steps?.length ?? 0;
  const maxSteps = run.config?.maxSteps;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1.5">
      <span>
        已用 <strong className="text-foreground">{usedSteps}</strong>
        {maxSteps != null && <span> / {maxSteps}</span>} 步
      </span>
      <span>·</span>
      <RunDuration run={run} />
      <span className="flex-1" />
      <StatusTag run={run} />
    </div>
  );
}

function RunDuration({ run }: { run: AgentRunState }) {
  const startedAt = run.steps?.[0]?.startedAt;
  if (!startedAt) return null;
  const lastStep = run.steps[run.steps.length - 1];
  const endedAt = lastStep?.completedAt ?? Date.now();
  const sec = ((endedAt - startedAt) / 1000).toFixed(1);
  return (
    <span>
      {run.status === 'running' ? `${sec}s …` : `${sec}s`}
    </span>
  );
}

// Tailwind JIT 需要 literal class string；Record 强制覆盖 6 种 SemanticColor
const STATUS_TAG_COLOR_CLASSES: Record<SemanticColor, string> = {
  info:    'text-info bg-info/10 border-info/30',
  success: 'text-success bg-success/10 border-success/30',
  warn:    'text-warn bg-warn/10 border-warn/30',
  danger:  'text-danger bg-danger/10 border-danger/30',
  teal:    'text-teal bg-teal/10 border-teal/30',
  neutral: 'text-muted-foreground bg-muted/30 border-border',
};

function StatusTag({ run }: { run: AgentRunState }) {
  const treatment = RUN_STATUS_TREATMENT[run.status];
  const Icon = treatment.icon;
  const colorClass = STATUS_TAG_COLOR_CLASSES[treatment.color];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${colorClass}`}>
      <Icon className={`w-3 h-3 ${run.status === 'running' ? 'animate-spin motion-reduce:animate-none' : ''}`} />
      <span>{treatment.label}</span>
    </span>
  );
}
