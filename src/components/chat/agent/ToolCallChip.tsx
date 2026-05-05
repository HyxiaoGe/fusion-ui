'use client';

import { Loader2 } from 'lucide-react';
import type { ToolCallState } from '@/types/agentRun';
import { getToolMeta } from '@/lib/agent/toolRegistry';
import type { SemanticColor } from '@/lib/agent/toolRegistry';

/**
 * 工具徽章——显示在 step 头部，标识 tool 类型 + status。
 * contract §13。
 *
 * icon 直接从 toolRegistry 拿 LucideIcon component，无字符串映射。
 */

// Tailwind JIT 需要 literal class string；Record 强制覆盖所有 SemanticColor，
// 加新色时 TS 立刻报错，不会出现"加新工具但 chip 渲染成灰色"的隐性 bug
const CHIP_COLOR_CLASSES: Record<SemanticColor, string> = {
  info:    'text-info border-info/30 bg-info/10',
  success: 'text-success border-success/30 bg-success/10',
  warn:    'text-warn border-warn/30 bg-warn/10',
  danger:  'text-danger border-danger/30 bg-danger/10',
  teal:    'text-teal border-teal/30 bg-teal/10',
  neutral: 'text-muted-foreground border-border bg-muted/30',
};

export function ToolCallChip({ call }: { call: ToolCallState }) {
  const meta = getToolMeta(call.toolName);
  const ToolIcon = meta.icon;

  // status 优先级高于 meta color：failed/interrupted 用警示色，其它用工具自身色
  const colorClass = call.status === 'failed' ? CHIP_COLOR_CLASSES.danger
    : call.status === 'interrupted' ? CHIP_COLOR_CLASSES.neutral
    : CHIP_COLOR_CLASSES[meta.color];

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs ${colorClass}`}>
      <ToolIcon className="w-3 h-3" />
      <span>{meta.label}</span>
      {call.status === 'running' && <Loader2 className="w-2.5 h-2.5 animate-spin ml-0.5 motion-reduce:animate-none" />}
    </span>
  );
}
