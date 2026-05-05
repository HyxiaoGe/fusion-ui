'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, CheckCircle2, AlertCircle, Square, RotateCw } from 'lucide-react';
import type { AgentStepState } from '@/types/agentRun';
import { STEP_STATUS_TREATMENT } from '@/lib/agent/statusTreatment';
import { STEP_NUMBER_COLOR_CLASSES } from '@/lib/agent/colorClasses';
import { isRetryAttempt } from '@/lib/agent/timelineDerive';
import { ToolCallChip } from './ToolCallChip';
import { ToolCallSummary } from './ToolCallSummary';
import { ToolCallDetail } from './ToolCallDetail';

/**
 * 工具步骤卡片。
 * 0 toolCalls + running = pending 形态（LLM 在决定下一步），同组件内渲染避免组件类型切换。
 * 0 toolCalls + 终态 = 异常 case，仍渲染（不 return null，避免 timeline 突然少一行）。
 * running + 0 toolCalls + contentBlockIds > 0 → return null，让正文区接管 streaming 显示。
 * contract §13 + §4 (retry heuristic)。
 */
export function AgentStepCard({ step, _isLast }: { step: AgentStepState; _isLast: boolean }) {
  void _isLast;

  // running + 0 toolCalls + 已开始流答复（contentBlockIds > 0）→ 不渲染整张 pending card
  // 让正文区接管 streaming 显示，timeline 不重复显示"正在生成答复"占位
  if (step.status === 'running'
      && step.toolCalls.length === 0
      && step.contentBlockIds.length > 0) {
    return null;
  }

  // running + 0 toolCalls + 0 contentBlockIds = pending 形态（LLM 在决定下一步）
  // 终态 + 0 toolCalls = 异常 case，仍渲染避免 timeline 突然少一行
  const hasContent = step.contentBlockIds.length > 0;
  const isPending = step.status === 'running'
    && step.toolCalls.length === 0
    && !hasContent;

  // 所有工具步骤默认折叠为单行摘要（chip + summary + 状态），用户点击展开详情。
  const [overrideExpanded, setOverrideExpanded] = useState<boolean | null>(null);
  const expanded = overrideExpanded ?? false;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 w-full min-w-0">
      <button
        type="button"
        onClick={() => !isPending && setOverrideExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors duration-fast"
        aria-expanded={!isPending && expanded}
        disabled={isPending}
      >
        <StepNumber n={step.stepNumber} status={step.status} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {isPending ? (
            // pending 形态：单行 "正在思考下一步…"
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">步骤 {step.stepNumber} ·</span>
              <span className="text-foreground/80">
                {step.status === 'running' ? '正在思考下一步…' : '无产出'}
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 flex-wrap">
                {step.toolCalls.map(tc => (
                  <ToolCallChip key={tc.toolCallId} call={tc} />
                ))}
                {step.toolCalls.some(tc => tc.status === 'degraded') && (
                  <span className="text-xs text-warn px-1.5 py-0.5 rounded bg-warn/10 border border-warn/30">部分降级</span>
                )}
                {step.status === 'interrupted' && !step.toolCalls.some(tc => tc.status === 'interrupted') && (
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted/30">已中断</span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {step.toolCalls.map(tc => {
                  const isRetry = isRetryAttempt(tc, step.toolCalls);
                  return (
                    <div key={tc.toolCallId} className="flex items-center gap-1">
                      <ToolCallSummary call={tc} />
                      {isRetry && (
                        <span className="text-fg-subtle text-xs inline-flex items-center gap-0.5 ml-1">
                          <RotateCw className="w-2.5 h-2.5" />
                          再次尝试
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        {!isPending && (
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`} />
        )}
      </button>

      {!isPending && expanded && (
        <div className="px-3 pb-2 pt-1 space-y-2">
          {step.toolCalls.map(tc => (
            <ToolCallDetail key={tc.toolCallId} call={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepNumber({ n, status }: { n: number; status: AgentStepState['status'] }) {
  const treatment = STEP_STATUS_TREATMENT[status];
  const colorClass = STEP_NUMBER_COLOR_CLASSES[treatment.color];
  return (
    <div className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs ${colorClass}`}>
      {status === 'running' ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
        : status === 'completed' ? <CheckCircle2 className="w-3 h-3" />
        : status === 'failed' ? <AlertCircle className="w-3 h-3" />
        : status === 'interrupted' ? <Square className="w-3 h-3" />
        : <span>{n}</span>}
    </div>
  );
}
