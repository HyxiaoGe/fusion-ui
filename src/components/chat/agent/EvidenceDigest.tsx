'use client';

import type { AgentRunState, AgentToolDigest } from '@/types/agentRun';
import { sanitizeExecutionSummary, sanitizeExecutionTitle } from './executionProcessModel';

export function EvidenceDigest({ run }: { run: AgentRunState }) {
  const digests = run.toolDigests ?? [];
  if (!digests.length) return null;

  return (
    <div className="mb-2 space-y-2 rounded-md border border-border/30 bg-muted/10 px-2.5 py-2">
      <div className="space-y-1.5">
        <div className="text-[11px] text-muted-foreground">资料处理</div>
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
        <span className="shrink-0 text-muted-foreground">{getStatusText(digest)}</span>
      </div>
      <div className="mt-0.5 truncate text-muted-foreground" title={sanitizeExecutionSummary(digest)}>
        {sanitizeExecutionSummary(digest)}
      </div>
    </div>
  );
}

function getStatusText(digest: AgentToolDigest): string {
  if (digest.repairState === 'retrying') return '修正中';
  if (digest.repairState === 'requires_user_input') return '待补充';
  if (digest.repairState === 'exhausted') return '未修正';
  switch (digest.status) {
    case 'success':
      return '完成';
    case 'degraded':
      return '部分可用';
    case 'failed':
      return '失败';
    case 'interrupted':
      return '中断';
    default: {
      void (digest.status as never);
      return '完成';
    }
  }
}

function getDigestTitle(digest: AgentToolDigest): string {
  if (digest.repairState === 'retrying') return '正在修正工具参数';
  if (digest.repairState === 'requires_user_input') return '需要补充查询条件';
  if (digest.repairState === 'exhausted') return '参数未能自动修正';
  if (digest.toolName === 'web_search' && digest.status === 'success') {
    return '搜索完成';
  }
  return sanitizeExecutionTitle(digest);
}
