'use client';

import { ChevronDown, ChevronRight, Clock, Wrench } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { NetworkDiagnosticsModel } from './networkDiagnosticsModel';

interface NetworkDiagnosticsPanelProps {
  model: NetworkDiagnosticsModel | null;
  isLoading?: boolean;
  error?: string | null;
}

export default function NetworkDiagnosticsPanel({
  model,
  isLoading = false,
  error = null,
}: NetworkDiagnosticsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return <section className="mt-5 text-xs text-muted-foreground">正在读取联网诊断...</section>;
  }
  if (error) {
    return <section className="mt-5 text-xs text-muted-foreground">联网诊断暂不可用</section>;
  }
  if (!model) {
    return null;
  }

  return (
    <section className="mt-5" data-testid="network-diagnostics-panel">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        联网诊断
      </h4>
      <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{model.summaryText}</span>
        </div>
        {model.issueItems.length > 0 ? (
          <div className="mt-2 space-y-1">
            {model.issueItems.map(item => (
              <div key={item.id} className="text-xs text-muted-foreground">
                <span className={cn(
                  item.status === 'failed' ? 'text-danger'
                    : item.status === 'degraded' ? 'text-warn'
                      : 'text-muted-foreground',
                )}>
                  {item.status === 'failed' ? '失败' : item.status === 'degraded' ? '降级' : '中断'}
                </span>
                <span> · {item.title}：{item.reason}</span>
              </div>
            ))}
          </div>
        ) : null}
        {model.canShowAdminDetails ? (
          <button
            type="button"
            aria-expanded={expanded}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            管理员明细
          </button>
        ) : null}
        {expanded ? (
          <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
            {model.tools.map(tool => (
              <div key={tool.tool_call_log_id} className="text-xs text-muted-foreground">
                {tool.tool_name} · {tool.status} · {tool.duration_ms ?? '-'}ms · {tool.target || '-'}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
