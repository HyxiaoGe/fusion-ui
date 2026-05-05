'use client';

import type { ToolCallState, ToolCallStatus } from '@/types/agentRun';
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
      {!result && <NoResultLabel status={call.status} />}
    </div>
  );
}

/** 无 resultSummary 时按 status 显示文案；exhaustive switch 强制覆盖所有 ToolCallStatus */
function NoResultLabel({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'running':
      return <span className="ml-1">…</span>;
    case 'failed':
      return <span className="ml-1 text-danger">未完成</span>;
    case 'interrupted':
      return <span className="ml-1 text-muted-foreground">已中断</span>;
    case 'degraded':
      return <span className="ml-1 text-warn">部分结果不可用</span>;
    case 'success':
      // success 但没 resultSummary（罕见 edge case，BE 协议允许 result_summary 为 null）
      return null;
    default: {
      // exhaustive 兜底——加新 ToolCallStatus 时这里 TS 报错强制处理
      void (status as never);
      return null;
    }
  }
}
