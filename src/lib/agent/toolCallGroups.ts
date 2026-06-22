import type { ToolCallState, ToolCallStatus } from '@/types/agentRun';
import { getToolMeta } from './toolRegistry';

export type ToolCallGroupKind = 'web_search' | 'url_read' | 'other';
export type ToolCallGroupStatus =
  | 'running'
  | 'success'
  | 'partial'
  | 'degraded'
  | 'failed'
  | 'interrupted';

export interface ToolCallGroupDetail {
  id: string;
  primary: string;
  secondary?: string;
  status: ToolCallStatus;
  truncated: boolean;
  fullValue?: string;
}

export interface ToolCallGroup {
  id: string;
  kind: ToolCallGroupKind;
  toolName: string;
  label: string;
  count: number;
  resultCount: number;
  status: ToolCallGroupStatus;
  summary: string;
  details: ToolCallGroupDetail[];
  hasExpandableDetails: boolean;
  shouldShowDetailsByDefault: boolean;
}

export function groupToolCalls(calls: ToolCallState[]): ToolCallGroup[] {
  const buckets = new Map<string, ToolCallState[]>();

  calls.forEach(call => {
    const id = getGroupId(call.toolName);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(call);
    else buckets.set(id, [call]);
  });

  return Array.from(buckets.entries()).map(([id, groupCalls]) => {
    const first = groupCalls[0];
    const meta = getToolMeta(first.toolName);
    const kind = getGroupKind(first.toolName);
    const status = deriveGroupStatus(groupCalls);
    const resultCount = groupCalls.reduce((sum, call) => sum + (call.resultSummary?.count ?? 0), 0);
    const details = groupCalls.map(toGroupDetail);
    const hasExpandableDetails = shouldHaveExpandableDetails(groupCalls, status);

    return {
      id,
      kind,
      toolName: first.toolName,
      label: meta.label,
      count: groupCalls.length,
      resultCount,
      status,
      summary: buildSummary(kind, status, groupCalls.length, resultCount, countByStatus(groupCalls, 'failed')),
      details,
      hasExpandableDetails,
      shouldShowDetailsByDefault: status !== 'success',
    };
  });
}

export function getToolGroupStatusClass(status: ToolCallGroupStatus): string {
  switch (status) {
    case 'running':
      return 'text-info';
    case 'partial':
    case 'degraded':
      return 'text-warn';
    case 'failed':
      return 'text-danger';
    case 'success':
    case 'interrupted':
      return 'text-muted-foreground';
    default: {
      void (status as never);
      return 'text-muted-foreground';
    }
  }
}

function getGroupId(toolName: string): string {
  if (toolName === 'web_search') return 'web_search';
  if (toolName === 'url_read') return 'url_read';
  return `other:${toolName}`;
}

function getGroupKind(toolName: string): ToolCallGroupKind {
  if (toolName === 'web_search') return 'web_search';
  if (toolName === 'url_read') return 'url_read';
  return 'other';
}

function deriveGroupStatus(calls: ToolCallState[]): ToolCallGroupStatus {
  if (calls.some(call => call.status === 'running')) return 'running';
  const statuses = new Set(calls.map(call => call.status));
  if (statuses.size > 1) return 'partial';
  const status = calls[0]?.status;
  if (status === 'success') return 'success';
  if (status === 'degraded') return 'degraded';
  if (status === 'failed') return 'failed';
  if (status === 'interrupted') return 'interrupted';
  return 'success';
}

function countByStatus(calls: ToolCallState[], status: ToolCallStatus): number {
  return calls.filter(call => call.status === status).length;
}

function buildSummary(
  kind: ToolCallGroupKind,
  status: ToolCallGroupStatus,
  count: number,
  resultCount: number,
  failedCount: number,
): string {
  if (kind === 'web_search') {
    if (status === 'running') return `正在搜索 · ${count} 个查询`;
    if (status === 'partial') return `搜索 ${count} 次 · ${failedCount} 次失败`;
    if (status === 'failed') return `搜索失败 · ${count} 个查询`;
    if (status === 'degraded') return '搜索降级 · 已跳过外部结果';
    if (status === 'interrupted') return `搜索已中断 · ${count} 个查询`;
    return resultCount > 0 ? `搜索 ${count} 次 · 共 ${resultCount} 条结果` : `搜索 ${count} 次`;
  }

  if (kind === 'url_read') {
    if (status === 'running') return `正在读取网页 · ${count} 个目标`;
    if (status === 'partial') return `读取 ${count} 个网页 · ${failedCount} 个失败`;
    if (status === 'failed') return `网页读取失败 · ${count} 个目标`;
    if (status === 'degraded') return '网页读取降级 · 已跳过部分页面';
    if (status === 'interrupted') return `网页读取已中断 · ${count} 个目标`;
    return `读取 ${count} 个网页`;
  }

  if (status === 'running') return `正在调用工具 · ${count} 个任务`;
  if (status === 'partial') return `调用 ${count} 个工具 · ${failedCount} 个失败`;
  if (status === 'failed') return `工具调用失败 · ${count} 个任务`;
  if (status === 'degraded') return '工具调用降级 · 已跳过部分结果';
  if (status === 'interrupted') return `工具调用已中断 · ${count} 个任务`;
  return `调用 ${count} 个工具`;
}

function toGroupDetail(call: ToolCallState): ToolCallGroupDetail {
  const target = getTarget(call);
  const resultTitle = call.resultSummary?.title;
  return {
    id: call.toolCallId,
    primary: target.short,
    secondary: call.error || resultTitle || getStatusText(call.status),
    status: call.status,
    truncated: call.resultSummary?.truncated === true,
    fullValue: target.full,
  };
}

function getTarget(call: ToolCallState): { short: string; full: string } {
  if (call.toolName === 'web_search') {
    const query = String(call.arguments.query ?? '').trim() || '未命名查询';
    return { short: query, full: query };
  }

  if (call.toolName === 'url_read') {
    const rawUrl = String(call.arguments.url ?? '').trim() || '未命名网页';
    return { short: getHostname(rawUrl), full: rawUrl };
  }

  const summarized = getToolMeta(call.toolName).summarize(call.arguments).trim();
  const value = summarized || call.toolName;
  return { short: value, full: value };
}

function getHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname || rawUrl;
  } catch {
    return rawUrl;
  }
}

function getStatusText(status: ToolCallStatus): string | undefined {
  switch (status) {
    case 'running':
      return '进行中';
    case 'failed':
      return '未完成';
    case 'degraded':
      return '部分结果不可用';
    case 'interrupted':
      return '已中断';
    case 'success':
      return undefined;
    default: {
      void (status as never);
      return undefined;
    }
  }
}

function shouldHaveExpandableDetails(calls: ToolCallState[], status: ToolCallGroupStatus): boolean {
  if (calls.length > 1) return true;
  if (status !== 'success') return true;
  return calls.some(call => call.resultSummary?.truncated === true);
}
