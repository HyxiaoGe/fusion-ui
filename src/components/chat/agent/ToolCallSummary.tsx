'use client';

import type { ToolCallState } from '@/types/agentRun';
import { getToolMeta } from '@/lib/agent/toolRegistry';

/**
 * 单行 input → result 摘要——挂在 step 头部 ToolCallChip 旁边。
 * contract §13。
 */
export function ToolCallSummary({ call }: { call: ToolCallState }) {
  const meta = getToolMeta(call.toolName);
  const input = meta.summarize(call.arguments);
  const result = call.resultSummary;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground truncate min-w-0">
      <span className="truncate text-foreground/80">{input}</span>
      {result && (
        <>
          <span className="mx-1 shrink-0">→</span>
          <span className="truncate">
            {result.count != null && <strong className="text-foreground">{result.count} 条</strong>}
            {result.count != null && result.title && <span className="mx-1">·</span>}
            {result.title}
            {result.truncated && <span className="ml-1 text-warn">（截断）</span>}
          </span>
        </>
      )}
      {!result && call.status === 'running' && <span className="ml-1">…</span>}
      {!result && call.status === 'failed' && <span className="ml-1 text-danger">未完成</span>}
      {!result && call.status === 'interrupted' && <span className="ml-1 text-muted-foreground">已中断</span>}
    </div>
  );
}
