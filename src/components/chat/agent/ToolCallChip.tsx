'use client';

import { Loader2 } from 'lucide-react';
import type { ToolCallState } from '@/types/agentRun';
import { getToolMeta } from '@/lib/agent/toolRegistry';
import { CHIP_COLOR_CLASSES } from '@/lib/agent/colorClasses';

/**
 * 工具徽章——显示在 step 头部，标识 tool 类型 + status。
 * contract §13。
 *
 * icon 直接从 toolRegistry 拿 LucideIcon component，无字符串映射。
 */

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
