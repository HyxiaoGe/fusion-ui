'use client';

import { Loader2 } from 'lucide-react';
import type { ToolCallState } from '@/types/agentRun';
import { getToolMeta } from '@/lib/agent/toolRegistry';

/**
 * 工具徽章——显示在 step 头部，标识 tool 类型 + status。
 * contract §13。
 *
 * icon 直接从 toolRegistry 拿 LucideIcon component，无字符串映射。
 */
export function ToolCallChip({ call }: { call: ToolCallState }) {
  const meta = getToolMeta(call.toolName);
  const ToolIcon = meta.icon;

  // failed 时覆盖颜色为 danger（保留 tool icon，但用警示色）
  const colorClass = call.status === 'failed' ? 'text-danger border-danger/30 bg-danger/10'
    : meta.color === 'info' ? 'text-info border-info/30 bg-info/10'
    : meta.color === 'teal' ? 'text-teal border-teal/30 bg-teal/10'
    : 'text-muted-foreground border-border bg-muted/30';

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs ${colorClass}`}>
      <ToolIcon className="w-3 h-3" />
      <span>{meta.label}</span>
      {call.status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin ml-0.5 motion-reduce:animate-none" />}
    </span>
  );
}
