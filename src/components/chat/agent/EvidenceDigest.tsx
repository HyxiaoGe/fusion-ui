'use client';

import type { AgentRunState, AgentToolDigest } from '@/types/agentRun';

export function EvidenceDigest({ run }: { run: AgentRunState }) {
  const digests = run.toolDigests ?? [];
  if (!digests.length) return null;

  return (
    <div className="mb-2 space-y-2 rounded-md border border-border/30 bg-muted/10 px-2.5 py-2">
      <div className="space-y-1.5">
        <div className="text-[11px] text-muted-foreground">工具结果</div>
        {digests.slice(0, 3).map(digest => (
          <ToolDigestRow key={digest.toolCallId} digest={digest} />
        ))}
      </div>
    </div>
  );
}

function ToolDigestRow({ digest }: { digest: AgentToolDigest }) {
  return (
    <div className="min-w-0 text-xs">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="truncate text-foreground/85">{getDigestTitle(digest)}</span>
        <span className="shrink-0 text-muted-foreground">·</span>
        <span className="shrink-0 text-muted-foreground">{getStatusText(digest.status)}</span>
      </div>
      <div className="mt-0.5 truncate text-muted-foreground" title={digest.summary}>
        {digest.summary}
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

function getDigestTitle(digest: AgentToolDigest): string {
  if (digest.toolName === 'web_search' && digest.status === 'success') {
    return '搜索完成';
  }
  return digest.title;
}
