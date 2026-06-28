'use client';

import { ExternalLink } from 'lucide-react';
import type { AgentEvidenceItem, AgentRunState, AgentToolDigest } from '@/types/agentRun';

export function EvidenceDigest({ run }: { run: AgentRunState }) {
  const digests = run.toolDigests ?? [];
  const evidence = run.evidence ?? [];
  if (!digests.length && !evidence.length) return null;

  return (
    <div className="mb-2 space-y-2 rounded-md border border-border/30 bg-muted/10 px-2.5 py-2">
      {digests.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-muted-foreground">工具结果</div>
          {digests.slice(0, 3).map(digest => (
            <ToolDigestRow key={digest.toolCallId} digest={digest} />
          ))}
        </div>
      )}
      {evidence.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] text-muted-foreground">回答依据</div>
          {evidence.slice(0, 3).map(item => (
            <EvidenceRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolDigestRow({ digest }: { digest: AgentToolDigest }) {
  return (
    <div className="min-w-0 text-xs">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="truncate text-foreground/85">{digest.title}</span>
        <span className="shrink-0 text-muted-foreground">·</span>
        <span className="shrink-0 text-muted-foreground">{getStatusText(digest.status)}</span>
      </div>
      <div className="mt-0.5 truncate text-muted-foreground" title={digest.summary}>
        {digest.summary}
      </div>
      {digest.keyFindings.length > 0 && (
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={digest.keyFindings[0]}>
          {digest.keyFindings[0]}
        </div>
      )}
    </div>
  );
}

function EvidenceRow({ item }: { item: AgentEvidenceItem }) {
  const title = item.domain ? `${item.title} · ${item.domain}` : item.title;
  const content = (
    <>
      <span className="truncate text-foreground/85">{title}</span>
      {item.url && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );

  return (
    <div className="min-w-0 text-xs">
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 items-center gap-1 hover:text-info"
          title={item.url}
        >
          {content}
        </a>
      ) : (
        <div className="flex min-w-0 items-center gap-1">{content}</div>
      )}
      <div className="mt-0.5 truncate text-muted-foreground" title={item.claim}>
        {item.claim}
      </div>
    </div>
  );
}

function getStatusText(status: AgentToolDigest['status']): string {
  switch (status) {
    case 'success':
      return '完成';
    case 'degraded':
      return '部分可用';
    case 'failed':
      return '失败';
    case 'interrupted':
      return '中断';
    default: {
      void (status as never);
      return '完成';
    }
  }
}
