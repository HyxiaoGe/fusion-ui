'use client';

import { Loader2 } from 'lucide-react';
import type { ToolCallState, ToolCallStatus } from '@/types/agentRun';
import type { ToolCallGroup } from '@/lib/agent/toolCallGroups';
import { getToolGroupStatusClass } from '@/lib/agent/toolCallGroups';
import { getToolMeta } from '@/lib/agent/toolRegistry';

type ToolCallSummaryProps =
  | { group: ToolCallGroup; mode: 'summary' | 'details'; call?: never }
  | { call: ToolCallState; group?: never; mode?: never };

export function ToolCallSummary(props: ToolCallSummaryProps) {
  if ('call' in props) {
    return <LegacyToolCallSummary call={props.call} />;
  }

  if (props.mode === 'details') {
    return <ToolCallDetails group={props.group} />;
  }

  return (
    <div
      data-testid={`tool-call-group-${props.group.id}`}
      className={`flex items-center gap-1.5 text-xs min-w-0 ${getToolGroupStatusClass(props.group.status)}`}
    >
      {props.group.status === 'running' && (
        <Loader2 className="w-3 h-3 animate-spin shrink-0 motion-reduce:animate-none" aria-hidden="true" />
      )}
      <span className="truncate min-w-0">{props.group.summary}</span>
    </div>
  );
}

function ToolCallDetails({ group }: { group: ToolCallGroup }) {
  return (
    <div className="space-y-1">
      {group.details.slice(0, 3).map(detail => (
        <div key={detail.id} className="flex items-center gap-1.5 min-w-0 text-xs text-muted-foreground">
          <span
            className="truncate min-w-0 text-foreground/80"
            title={detail.fullValue}
          >
            {detail.primary}
          </span>
          {detail.secondary && (
            <>
              <span className="shrink-0 text-muted-foreground/70">·</span>
              <span className="truncate min-w-0" title={detail.secondary}>
                {detail.secondary}
              </span>
            </>
          )}
          {detail.truncated && (
            <span className="shrink-0 text-warn">（截断）</span>
          )}
        </div>
      ))}
      {group.details.length > 3 && (
        <div className="text-xs text-muted-foreground">
          还有 {group.details.length - 3} 个目标未展示
        </div>
      )}
    </div>
  );
}

function LegacyToolCallSummary({ call }: { call: ToolCallState }) {
  const meta = getToolMeta(call.toolName);
  const input = meta.summarize(call.arguments);
  const result = call.resultSummary;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground truncate min-w-0">
      <span className="truncate text-foreground/80 min-w-0">{input}</span>
      {result && (
        <>
          <span className="mx-1 shrink-0">→</span>
          <span className="truncate min-w-0">
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
      return null;
    default: {
      void (status as never);
      return null;
    }
  }
}
