'use client';

import type { AgentRunState, AgentProgressPhase } from '@/types/agentRun';

const PHASE_LABEL: Record<AgentProgressPhase, string> = {
  planning: '规划',
  thinking: '思考',
  researching: '搜索',
  reading: '阅读',
  synthesizing: '整理',
  answering: '回答',
  recovering: '恢复',
};

export function RunProgressStrip({ run }: { run: AgentRunState }) {
  const progress = run.progress;
  if (!progress) return null;

  const hasStepProgress = typeof progress.completedSteps === 'number'
    && typeof progress.totalSteps === 'number'
    && progress.totalSteps > 0;
  const width = hasStepProgress
    ? Math.min(100, Math.max(0, Math.round((progress.completedSteps! / progress.totalSteps!) * 100)))
    : 0;

  return (
    <div className="mb-2 rounded-md border border-border/30 bg-muted/15 px-2.5 py-2">
      <div className="flex items-center gap-2 text-xs min-w-0">
        <span className="shrink-0 text-muted-foreground">{PHASE_LABEL[progress.phase]}</span>
        <span className="min-w-0 flex-1 truncate text-foreground/85">{progress.label}</span>
        {hasStepProgress && (
          <span className="shrink-0 text-muted-foreground">
            {progress.completedSteps}/{progress.totalSteps} 步
          </span>
        )}
      </div>
      {hasStepProgress && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-info/70" style={{ width: `${width}%` }} />
        </div>
      )}
      {typeof progress.completedToolCalls === 'number' && typeof progress.maxToolCalls === 'number' && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          工具 {progress.completedToolCalls}/{progress.maxToolCalls}
        </div>
      )}
    </div>
  );
}
