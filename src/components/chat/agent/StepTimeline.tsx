'use client';

import type { AgentRunState, AgentStepState } from '@/types/agentRun';
import { isSummaryStep } from '@/lib/agent/timelineDerive';
import { AgentStepCard } from './AgentStepCard';
import { SummaryStep } from './SummaryStep';

/**
 * Step 列表容器。按 step 类型分发到 AgentStepCard 或 SummaryStep。
 * contract §13。
 */
export function StepTimeline({ run }: { run: AgentRunState }) {
  if (!run.steps?.length) return null;

  return (
    <div className="space-y-2">
      {run.steps.map((step, i) => (
        <StepRenderer key={step.stepId} step={step} _isLast={i === run.steps.length - 1} />
      ))}
    </div>
  );
}

function StepRenderer({ step, _isLast }: { step: AgentStepState; _isLast: boolean }) {
  if (isSummaryStep(step)) {
    return <SummaryStep step={step} _isLast={_isLast} />;
  }
  return <AgentStepCard step={step} _isLast={_isLast} />;
}
