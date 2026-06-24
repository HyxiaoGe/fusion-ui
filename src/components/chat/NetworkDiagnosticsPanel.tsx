'use client';

import { Clock, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  NetworkDiagnosticsModel,
  NetworkDiagnosticsProcessItem,
} from './networkDiagnosticsModel';

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
  if (isLoading) {
    return <section className="mt-5 text-xs text-muted-foreground">正在读取联网过程...</section>;
  }
  if (error) {
    return <section className="mt-5 text-xs text-muted-foreground">联网过程暂不可用</section>;
  }
  if (!model) {
    return null;
  }

  const processItems = model.processItems ?? [];
  const summaryText = model.displaySummaryText ?? model.summaryText;

  return (
    <section className="mt-5" data-testid="network-diagnostics-panel">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        联网过程
      </h4>
      <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{summaryText}</span>
        </div>
        {processItems.length > 0 ? (
          <div className="mt-2 space-y-2">
            {processItems.map(item => (
              <ProcessItem key={item.id} item={item} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProcessItem({ item }: { item: NetworkDiagnosticsProcessItem }) {
  return (
    <div className="rounded-md border border-border/30 bg-background/60 px-2.5 py-2 text-xs">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
        <span className="rounded-full border border-border/30 px-1.5 py-0.5 text-[10px] text-foreground">
          {item.toolLabel}
        </span>
        <span className={cn('text-[10px]', getStatusClassName(item.status))}>
          {item.statusLabel}
        </span>
        {item.resultCount !== null ? (
          <span>{item.resultCount} 条结果</span>
        ) : null}
        <span>{item.durationText}</span>
      </div>
      <p className="line-clamp-2 text-xs text-foreground" title={item.target}>
        {item.target}
      </p>
      {item.detailParts.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] leading-4 text-muted-foreground">
          {item.detailParts.map(part => (
            <span key={part}>{part}</span>
          ))}
        </div>
      ) : null}
      {item.reason ? (
        <p className="mt-1 text-xs text-muted-foreground">
          原因：<span>{item.reason}</span>
        </p>
      ) : null}
    </div>
  );
}

function getStatusClassName(status: NetworkDiagnosticsProcessItem['status']): string {
  if (status === 'success') {
    return 'text-success';
  }
  if (status === 'failed') {
    return 'text-danger';
  }
  if (status === 'degraded') {
    return 'text-warn';
  }
  return 'text-muted-foreground';
}
