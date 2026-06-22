'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, CheckCircle2, AlertCircle, Square } from 'lucide-react';
import type { AgentStepState } from '@/types/agentRun';
import { STEP_STATUS_TREATMENT } from '@/lib/agent/statusTreatment';
import { STEP_NUMBER_COLOR_CLASSES } from '@/lib/agent/colorClasses';
import { groupToolCalls } from '@/lib/agent/toolCallGroups';
import { ToolCallSummary } from './ToolCallSummary';

export function AgentStepCard({ step, _isLast }: { step: AgentStepState; _isLast: boolean }) {
  void _isLast;

  const [overrideExpanded, setOverrideExpanded] = useState<boolean | null>(null);

  if (step.status === 'running'
      && step.toolCalls.length === 0
      && step.contentBlockIds.length > 0) {
    return null;
  }

  const hasContent = step.contentBlockIds.length > 0;
  const isPending = step.status === 'running'
    && step.toolCalls.length === 0
    && !hasContent;
  const groups = groupToolCalls(step.toolCalls);
  const groupHasDetails = groups.some(group => group.hasExpandableDetails);
  const defaultExpanded = groups.some(group => group.shouldShowDetailsByDefault);
  const expanded = overrideExpanded ?? defaultExpanded;
  const canExpand = !isPending && groupHasDetails;

  return (
    <div className="rounded-md border border-border/30 bg-transparent w-full min-w-0">
      <button
        type="button"
        onClick={() => canExpand && setOverrideExpanded(!expanded)}
        className="w-full flex items-start gap-2 px-2.5 py-1.5 text-left hover:bg-muted/20 transition-colors duration-fast disabled:cursor-default disabled:hover:bg-transparent"
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={canExpand ? (expanded ? '收起工具详情' : '查看工具详情') : undefined}
        disabled={!canExpand}
      >
        <StepNumber n={step.stepNumber} status={step.status} hasToolCalls={step.toolCalls.length > 0} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {isPending ? (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">步骤 {step.stepNumber} ·</span>
              <span className="text-foreground/80">
                {step.status === 'running' ? '正在思考下一步…' : '无产出'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                {groups.map(group => (
                  <ToolCallSummary key={group.id} group={group} mode="summary" />
                ))}
                {step.status === 'interrupted' && groups.every(group => group.status !== 'interrupted') && (
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted/30">已中断</span>
                )}
              </div>
            </div>
          )}
        </div>
        {canExpand && (
          <ChevronDown className={`w-4 h-4 mt-1 text-muted-foreground transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`} />
        )}
      </button>

      {canExpand && expanded && (
        <div className="px-3 pb-2 pt-1 space-y-2">
          {groups.map(group => (
            <ToolCallSummary key={group.id} group={group} mode="details" />
          ))}
        </div>
      )}
    </div>
  );
}

function StepNumber({ n, status, hasToolCalls }: { n: number; status: AgentStepState['status']; hasToolCalls: boolean }) {
  const treatment = STEP_STATUS_TREATMENT[status];
  const colorClass = STEP_NUMBER_COLOR_CLASSES[treatment.color];
  const showSpinner = status === 'running' && !hasToolCalls;
  return (
    <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs ${colorClass}`}>
      {showSpinner ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
        : status === 'completed' ? <CheckCircle2 className="w-3 h-3" />
        : status === 'failed' ? <AlertCircle className="w-3 h-3" />
        : status === 'interrupted' ? <Square className="w-3 h-3" />
        : <span>{n}</span>}
    </div>
  );
}
