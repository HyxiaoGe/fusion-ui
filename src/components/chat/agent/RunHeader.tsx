'use client';

import { useState, useEffect } from 'react';
import type { AgentRunState } from '@/types/agentRun';
import { RUN_STATUS_TREATMENT } from '@/lib/agent/statusTreatment';
import { STATUS_TAG_COLOR_CLASSES } from '@/lib/agent/colorClasses';

/**
 * Run 头部：已用 N/maxSteps 步 · X.Ys · status 标签。
 * contract §13。
 */

interface RunHeaderProps {
  run: AgentRunState;
}

interface RunDurationProps {
  run: AgentRunState;
}

interface StatusTagProps {
  run: AgentRunState;
}

export function RunHeader({ run }: RunHeaderProps) {
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

function RunDuration({ run }: RunDurationProps) {
  const startedAt = run.steps?.[0]?.startedAt;
  const isRunning = run.status === 'running';
  const lastStep = run.steps[run.steps.length - 1];
  const finalEndedAt = lastStep?.completedAt;

  // 只有 running + 有 startedAt 时跑 timer 让秒数实时跳
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning, startedAt]);

  if (!startedAt) return null;
  const endedAt = finalEndedAt ?? now;
  const sec = ((endedAt - startedAt) / 1000).toFixed(1);
  return (
    <span>
      {isRunning ? `${sec}s …` : `${sec}s`}
    </span>
  );
}

function StatusTag({ run }: StatusTagProps) {
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
