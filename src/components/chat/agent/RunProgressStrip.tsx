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

const TERMINAL_LABEL: Partial<Record<AgentRunState['status'], string>> = {
  completed: '已完成回答整理',
  limit_reached: '已达到运行上限',
  incomplete: '响应未完整',
  interrupted: '已中断',
  failed: '运行失败',
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
  const label = run.status === 'running'
    ? progress.label
    : TERMINAL_LABEL[run.status] ?? progress.label;

  return (
    <div className="mb-2 rounded-md border border-border/30 bg-muted/15 px-2.5 py-2">
      <div className="flex items-center gap-2 text-xs min-w-0">
        <span className="shrink-0 text-muted-foreground">{PHASE_LABEL[progress.phase]}</span>
        <span className="min-w-0 flex-1 truncate text-foreground/85">{label}</span>
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
