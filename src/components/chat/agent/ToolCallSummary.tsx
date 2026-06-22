'use client';

import { Loader2 } from 'lucide-react';
import type { ToolCallGroup } from '@/lib/agent/toolCallGroups';
import { getToolGroupStatusClass } from '@/lib/agent/toolCallGroups';

interface ToolCallSummaryProps {
  group: ToolCallGroup;
  mode: 'summary' | 'details';
}

export function ToolCallSummary({ group, mode }: ToolCallSummaryProps) {
  if (mode === 'details') {
    return <ToolCallDetails group={group} />;
  }

  return (
    <div
      data-testid={`tool-call-group-${group.id}`}
      className={`flex items-center gap-1.5 text-xs min-w-0 ${getToolGroupStatusClass(group.status)}`}
    >
      {group.status === 'running' && (
        <Loader2 className="w-3 h-3 animate-spin shrink-0 motion-reduce:animate-none" aria-hidden="true" />
      )}
      <span className="truncate min-w-0">{group.summary}</span>
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
