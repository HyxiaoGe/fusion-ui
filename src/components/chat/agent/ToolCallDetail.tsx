'use client';

import { AlertCircle } from 'lucide-react';
import type { ToolCallState } from '@/types/agentRun';
import { getToolMeta } from '@/lib/agent/toolRegistry';
import type { SemanticColor } from '@/lib/agent/toolRegistry';

/**
 * 展开后的工具调用详情——参数 / 结果摘要卡 / 错误块。
 * contract §13。
 */

// Tailwind JIT 需要 literal class string；不能写 `text-${color}` 动态字符串
const COLOR_DOT_CLASS: Record<SemanticColor, string> = {
  info: 'text-info',
  success: 'text-success',
  warn: 'text-warn',
  danger: 'text-danger',
  teal: 'text-teal',
  neutral: 'text-muted-foreground',
};

export function ToolCallDetail({ call }: { call: ToolCallState }) {
  const meta = getToolMeta(call.toolName);

  return (
    <div className="space-y-2 pl-2 border-l border-border/50">
      {/* 参数 */}
      <div className="text-xs">
        <div className="text-muted-foreground mb-0.5">参数</div>
        <pre className="bg-muted/30 rounded px-2 py-1 text-xs overflow-x-auto font-mono">
          {JSON.stringify(call.arguments, null, 2)}
        </pre>
      </div>

      {/* 结果摘要卡 */}
      {call.resultSummary && (
        <div className="text-xs">
          <div className="text-muted-foreground mb-0.5">结果</div>
          <div className="rounded border border-border/50 bg-bg-subtle px-2 py-1.5 flex items-center gap-2">
            <span className={COLOR_DOT_CLASS[meta.color]}>●</span>
            <span className="flex-1 truncate">{call.resultSummary.title ?? '(无标题)'}</span>
            {call.resultSummary.count != null && (
              <span className="text-muted-foreground">{call.resultSummary.count}</span>
            )}
          </div>
          {call.resultSummary.truncated && (
            <div className="mt-1 text-xs text-warn">已截断 — 完整结果存于消息附件</div>
          )}
        </div>
      )}

      {/* 错误块 */}
      {(call.status === 'failed' || call.status === 'interrupted') && call.error && (
        <div className="text-xs rounded border border-danger/30 bg-danger/5 p-2">
          <div className="flex items-center gap-1 text-danger font-medium mb-1">
            <AlertCircle className="w-3 h-3" />
            <span>错误</span>
          </div>
          <div className="text-foreground/80">{call.error}</div>
        </div>
      )}
    </div>
  );
}
