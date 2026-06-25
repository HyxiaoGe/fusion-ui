'use client';

import { AlertCircle } from 'lucide-react';
import type { ToolCallState } from '@/types/agentRun';
import { hasToolCallDetail } from '@/lib/agent/timelineDerive';
import { getToolErrorDisplay } from '@/lib/agent/toolErrorDisplay';

/**
 * 展开后的工具调用详情——仅在有非冗余信息时渲染。
 *
 * 普通 success + 非截断 case 跟 ToolCallSummary 完全冗余，由 AgentStepCard
 * 通过 hasToolCallDetail 守卫不渲染折叠箭头。本组件作为防御性 fallback：
 * 即便被错误调用，hasToolCallDetail = false 时直接 return null。
 *
 * contract §13。
 */
export function ToolCallDetail({ call }: { call: ToolCallState }) {
  if (!hasToolCallDetail(call)) return null;

  const isErrorStatus = call.status === 'failed' || call.status === 'interrupted';
  const errorDisplay = getToolErrorDisplay(call.toolName, call.status, call.error);

  return (
    <div className="space-y-2 pl-2 border-l border-border/50">
      {/* 未使用块（failed/interrupted 且 BE 给了 error 文案时） */}
      {isErrorStatus && errorDisplay && (
        <div className="text-xs rounded border border-danger/30 bg-danger/5 p-2">
          <div className="flex items-center gap-1 text-danger font-medium mb-1">
            <AlertCircle className="w-3 h-3" />
            <span>未使用</span>
          </div>
          <div className="text-foreground/80">{errorDisplay}</div>
        </div>
      )}

      {/* 状态兜底文案：error 缺失时不显示空容器 */}
      {call.status === 'failed' && !errorDisplay && (
        <div className="text-xs text-danger">工具未取得可用结果，无更多详情</div>
      )}
      {call.status === 'interrupted' && !errorDisplay && (
        <div className="text-xs text-muted-foreground">工具调用已中断，未取得结果</div>
      )}

      {/* degraded：部分结果不可用 */}
      {call.status === 'degraded' && (
        <div className="text-xs text-warn">部分结果暂时无法使用</div>
      )}

      {/* truncated：可与上面状态叠加（如 degraded + truncated） */}
      {call.resultSummary?.truncated && (
        <div className="text-xs text-warn">已截断 — 完整结果存于消息附件</div>
      )}
    </div>
  );
}
