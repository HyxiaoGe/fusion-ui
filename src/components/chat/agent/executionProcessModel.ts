import type { AgentRunState, AgentToolDigest, ToolCallState, ToolCallStatus } from '@/types/agentRun';
import { groupToolCalls, type ToolCallGroup, type ToolCallGroupDetail } from '@/lib/agent/toolCallGroups';

export interface ExecutionProcessModel {
  isRenderable: boolean;
  summary: string;
  searchCount: number;
  readCount: number;
  issueCount: number;
  groups: ToolCallGroup[];
  digestRows: ExecutionDigestRow[];
}

export interface ExecutionDigestRow {
  id: string;
  title: string;
  status: AgentToolDigest['status'];
  summary: string;
}

export function buildExecutionProcessModel(run: AgentRunState): ExecutionProcessModel {
  const toolCalls = run.steps.flatMap(step => step.toolCalls);
  const groups = groupToolCalls(toolCalls);
  const digestRows = (run.toolDigests ?? []).map(toDigestRow);
  const searchCount = countToolName(toolCalls, run.toolDigests, 'web_search');
  const readCount = countToolName(toolCalls, run.toolDigests, 'url_read');
  const issueCount = countIssues(toolCalls, run.toolDigests);
  const isRenderable = searchCount > 0
    || readCount > 0
    || issueCount > 0
    || digestRows.length > 0
    || groups.length > 0;

  return {
    isRenderable,
    summary: buildSummary(searchCount, readCount, issueCount),
    searchCount,
    readCount,
    issueCount,
    groups,
    digestRows,
  };
}

export function sanitizeExecutionTitle(digest: AgentToolDigest): string {
  if (digest.toolName === 'web_search') {
    return digest.status === 'success' ? '搜索完成' : '搜索结果未完整使用';
  }

  if (digest.toolName === 'url_read') {
    if (digest.status === 'success') return '网页读取完成';
    if (digest.status === 'interrupted') return '网页读取已中断';
    if (digest.status === 'degraded') return '网页读取部分可用';
    return '网页暂时无法读取';
  }

  return sanitizeInternalText(digest.title || '资料处理完成');
}

export function sanitizeExecutionSummary(digest: AgentToolDigest): string {
  if (digest.toolName === 'url_read' && digest.status === 'success') {
    return '已读取网页内容，供后续回答核验。';
  }

  if (digest.toolName === 'url_read' && digest.status !== 'success') {
    return digest.status === 'interrupted'
      ? '网页读取已中断，未使用该来源。'
      : '网页暂时无法读取，已跳过该来源。';
  }

  if (digest.toolName === 'web_search' && digest.status !== 'success') {
    return '部分搜索结果未能使用。';
  }

  return sanitizeInternalText(digest.summary || '资料处理完成。');
}

export function statusText(status: AgentToolDigest['status'] | ToolCallStatus): string {
  switch (status) {
    case 'success':
      return '完成';
    case 'degraded':
      return '部分可用';
    case 'failed':
      return '未使用';
    case 'interrupted':
      return '已中断';
    case 'running':
      return '进行中';
    default: {
      void (status as never);
      return '完成';
    }
  }
}

export function groupSectionTitle(group: ToolCallGroup): string {
  if (group.kind === 'web_search') return '搜索记录';
  if (group.kind === 'url_read') return '网页读取';
  return '其他任务';
}

export function groupDetailStatusText(detail: ToolCallGroupDetail): string {
  if (detail.secondary) return detail.secondary;
  return statusText(detail.status);
}

function countToolName(
  toolCalls: ToolCallState[],
  digests: AgentToolDigest[] | undefined,
  toolName: string,
): number {
  const callCount = toolCalls.filter(call => call.toolName === toolName).length;
  if (callCount > 0) return callCount;
  return (digests ?? []).filter(digest => digest.toolName === toolName).length;
}

function countIssues(toolCalls: ToolCallState[], digests: AgentToolDigest[] | undefined): number {
  const issueCalls = toolCalls.filter(call => call.status !== 'success' && call.status !== 'running').length;
  if (issueCalls > 0) return issueCalls;
  return (digests ?? []).filter(digest => digest.status !== 'success').length;
}

function buildSummary(searchCount: number, readCount: number, issueCount: number): string {
  const parts = ['执行过程'];
  if (searchCount > 0) parts.push(`搜索 ${searchCount} 次`);
  if (readCount > 0) parts.push(`读取 ${readCount} 个网页`);
  if (issueCount > 0) parts.push(`${issueCount} 个未使用`);
  return parts.join(' · ');
}

function toDigestRow(digest: AgentToolDigest): ExecutionDigestRow {
  return {
    id: digest.toolCallId,
    title: sanitizeExecutionTitle(digest),
    status: digest.status,
    summary: sanitizeExecutionSummary(digest),
  };
}

function sanitizeInternalText(value: string): string {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  if (
    lower.includes('reader-service')
    || lower.includes('url_read')
    || lower.includes('web_search')
    || lower.includes('已降级跳过')
    || lower.includes('http 5')
    || lower.includes('http 4')
  ) {
    return '部分资料暂时不可用，已基于可用信息继续。';
  }
  return normalized;
}
