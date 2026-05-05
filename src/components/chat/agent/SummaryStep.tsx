'use client';

import { Sparkles } from 'lucide-react';
import type { AgentStepState } from '@/types/agentRun';

/**
 * 总结步骤卡片（toolCalls.length === 0）——典型场景是 limit_reached 后的强制总结，
 * 或正常路径最后一轮 LLM 只产出文本不调工具。
 *
 * contract §5 三种形态：
 *   - running + 0 tool call → 「正在整理答复…」+ 柔和脉冲（不用工具 spinner）
 *   - completed + contentBlockIds.length > 0 → 「整理答复」+ 内容块计数
 *   - failed/interrupted → 简化中断/失败提示
 */
export function SummaryStep({ step, _isLast }: { step: AgentStepState; _isLast: boolean }) {
  // _isLast 预留给后续 connector / timeline 末尾视觉差异化，本期未用
  void _isLast;
  const isRunning = step.status === 'running';
  const blockCount = step.contentBlockIds?.length ?? 0;

  return (
    <div className="rounded-lg border border-border/30 bg-muted/5 px-3 py-2 flex items-center gap-2 text-xs w-full min-w-0">
      <div className="shrink-0 w-6 h-6 rounded-full bg-muted/50 text-muted-foreground border border-border/50 flex items-center justify-center">
        {isRunning ? (
          <span className="w-1.5 h-1.5 rounded-full bg-info/60 animate-pulse motion-reduce:animate-none" aria-hidden />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-muted-foreground">步骤 {step.stepNumber} ·</span>
        {isRunning ? (
          <span className="text-foreground/80">正在整理答复…</span>
        ) : step.status === 'completed' ? (
          <>
            <span className="text-foreground/80">整理答复</span>
            {blockCount > 0 && <span className="text-muted-foreground">（{blockCount} 个内容块）</span>}
          </>
        ) : step.status === 'interrupted' ? (
          <span className="text-muted-foreground">整理被中断</span>
        ) : (
          <span className="text-danger">整理失败</span>
        )}
      </div>
    </div>
  );
}
