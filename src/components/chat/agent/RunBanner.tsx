'use client';

import { AlertCircle, AlertTriangle, Square, RotateCw } from 'lucide-react';
import type { AgentRunState } from '@/types/agentRun';
import { getLimitReachedBannerText } from '@/lib/agent/timelineDerive';

interface RunBannerProps {
  run: AgentRunState;
  /** 用户点「重试运行」/「重新提问」时调用。
   * undefined 时按钮不渲染（避免 fake CTA，contract §7）。 */
  onRetry?: () => void;
}

/**
 * 三种终态 banner（contract §7 CTA 白名单已限制不做 fake CTA）：
 *   - failed → danger banner + 重试运行按钮
 *   - interrupted → neutral banner（不显示恢复按钮，能力没有）
 *   - limit_reached → warn banner + 三种 reason 文案 + max_steps/max_tool_calls 走
 *     suggested question 不出按钮，timeout 给重新提问按钮
 */
export function RunBanner({ run, onRetry }: RunBannerProps) {
  if (run.status === 'failed') {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 flex items-start gap-2 mb-2">
        <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-danger">运行失败 — {run.failure?.message ?? '未知错误'}</div>
          {run.failure?.code && (
            <div className="text-xs text-muted-foreground mt-0.5">code: <code className="bg-muted/30 px-1 rounded">{run.failure.code}</code></div>
          )}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-danger/30 text-xs text-danger hover:bg-danger/10 transition-colors duration-fast"
          >
            <RotateCw className="w-3 h-3" />
            重试运行
          </button>
        )}
      </div>
    );
  }

  if (run.status === 'interrupted') {
    const lastStepN = run.steps?.length ?? 0;
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-3 flex items-start gap-2 mb-2">
        <Square className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">已中断 — 已完成 {lastStepN} 步</div>
          <div className="text-xs text-muted-foreground mt-0.5">已完成的步骤结果保留，可重新提问。</div>
        </div>
      </div>
    );
  }

  if (run.status === 'limit_reached' && run.limitReachedReason) {
    const configValue =
      run.limitReachedReason === 'max_steps' ? run.config.maxSteps
      : run.limitReachedReason === 'max_tool_calls' ? run.config.maxToolCalls
      : run.config.timeoutS;
    const text = getLimitReachedBannerText(run.limitReachedReason, configValue);
    return (
      <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 flex items-start gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-warn">{text.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{text.sub}</div>
        </div>
        {run.limitReachedReason === 'timeout' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-warn/30 text-xs text-warn hover:bg-warn/10 transition-colors duration-fast"
          >
            <RotateCw className="w-3 h-3" />
            重新提问
          </button>
        )}
      </div>
    );
  }

  if (run.status === 'incomplete') {
    return (
      <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 flex items-start gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-warn">回答可能不完整</div>
          <div className="text-xs text-muted-foreground mt-0.5">模型提前结束，已保留当前已生成的内容。</div>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-warn/30 text-xs text-warn hover:bg-warn/10 transition-colors duration-fast"
          >
            <RotateCw className="w-3 h-3" />
            重新提问
          </button>
        )}
      </div>
    );
  }

  return null;
}
