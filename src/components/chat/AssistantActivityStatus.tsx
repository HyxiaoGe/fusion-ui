'use client';

import { AlertCircle, Globe, Loader2, Search, Square, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { AssistantActivity } from './assistantActivity';

interface AssistantActivityStatusProps {
  activity: AssistantActivity;
  className?: string;
}

export default function AssistantActivityStatus({ activity, className }: AssistantActivityStatusProps) {
  if (activity.kind === 'failed') {
    return (
      <StatusShell tone="danger" role="alert" live="assertive" className={className}>
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>生成失败，请重试</span>
      </StatusShell>
    );
  }

  if (activity.kind === 'interrupted') {
    return (
      <StatusShell tone="neutral" role="status" live="polite" className={className}>
        <Square className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>生成已停止</span>
      </StatusShell>
    );
  }

  if (activity.kind === 'tool_running' && activity.tool) {
    const Icon = activity.tool.kind === 'web_search'
      ? Search
      : activity.tool.kind === 'url_read'
        ? Globe
        : Wrench;
    const text = activity.tool.target
      ? `${activity.tool.label}：${activity.tool.target}`
      : activity.tool.label;

    return (
      <StatusShell
        tone={activity.tool.kind === 'url_read' ? 'teal' : 'info'}
        role="status"
        live="polite"
        className={className}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{text}</span>
        <Loader2
          className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      </StatusShell>
    );
  }

  if (activity.kind === 'waiting') {
    return (
      <StatusShell tone="neutral" role="status" live="polite" className={className}>
        <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span>正在准备回答</span>
      </StatusShell>
    );
  }

  if (activity.issue) {
    return (
      <StatusShell
        tone={activity.issue.kind === 'failed' ? 'danger' : 'warn'}
        role="status"
        live="polite"
        className={className}
      >
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words">
          <span className="font-medium">{activity.issue.title}</span>
          <span className="text-muted-foreground"> {activity.issue.detail}</span>
        </span>
      </StatusShell>
    );
  }

  return null;
}

function StatusShell({
  children,
  tone,
  role,
  live,
  className,
}: {
  children: ReactNode;
  tone: 'info' | 'teal' | 'warn' | 'danger' | 'neutral';
  role: 'status' | 'alert';
  live: 'polite' | 'assertive';
  className?: string;
}) {
  return (
    <div
      role={role}
      aria-live={live}
      aria-atomic="true"
      className={cn(
        'mb-2 flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs',
        tone === 'info' && 'border-info-border bg-info-bg text-info',
        tone === 'teal' && 'border-teal/30 bg-teal/10 text-teal',
        tone === 'warn' && 'border-warn/30 bg-warn/10 text-warn',
        tone === 'danger' && 'border-danger/30 bg-danger/10 text-danger',
        tone === 'neutral' && 'border-border bg-muted/30 text-muted-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}
