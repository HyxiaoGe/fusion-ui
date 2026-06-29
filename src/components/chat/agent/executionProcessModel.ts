import type { AgentEvidenceItem, AgentRunState, AgentToolDigest, ToolCallState, ToolCallStatus } from '@/types/agentRun';
import { groupToolCalls, type ToolCallGroup, type ToolCallGroupDetail } from '@/lib/agent/toolCallGroups';

export interface ExecutionProcessModel {
  isRenderable: boolean;
  summary: string;
  searchCount: number;
  readCount: number;
  skippedReadCount: number;
  searchCandidateCount: number;
  searchQueries: string[];
  searchSources: ExecutionProcessSource[];
  groups: ToolCallGroup[];
  digestRows: ExecutionDigestRow[];
}

export interface ExecutionProcessModelOptions {
  searchSources?: ExecutionProcessSource[];
  searchQueries?: string[];
}

export interface ExecutionProcessSource {
  id: string;
  title: string;
  url: string;
  domain?: string;
  favicon?: string;
}

export interface ExecutionDigestRow {
  id: string;
  title: string;
  status: AgentToolDigest['status'];
  summary: string;
}

export function buildExecutionProcessModel(
  run: AgentRunState,
  options: ExecutionProcessModelOptions = {},
): ExecutionProcessModel {
  const toolCalls = run.steps.flatMap(step => step.toolCalls);
  const visibleToolCalls = toolCalls.filter(isVisibleToolCall);
  const groups = groupToolCalls(visibleToolCalls);
  const digestRows = (run.toolDigests ?? []).map(toDigestRow);
  const searchSources = collectSearchSources(run, options.searchSources ?? []);
  const searchQueries = collectSearchQueries(toolCalls, options.searchQueries ?? []);
  const searchCount = countSearches(toolCalls, run.toolDigests);
  const readCount = countSuccessfulReads(toolCalls, run.toolDigests);
  const skippedReadCount = countSkippedReads(toolCalls, run.toolDigests);
  const searchCandidateCount = Math.max(
    countSearchCandidates(toolCalls, run.toolDigests),
    searchSources.length,
  );
  const isRenderable = searchCount > 0
    || readCount > 0
    || groups.length > 0;

  return {
    isRenderable,
    summary: buildSummary(searchCount, readCount),
    searchCount,
    readCount,
    skippedReadCount,
    searchCandidateCount,
    searchQueries,
    searchSources,
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

function isVisibleToolCall(call: ToolCallState): boolean {
  if (call.toolName !== 'url_read') return true;
  return call.status === 'success' || call.status === 'running';
}

function countSearches(toolCalls: ToolCallState[], digests: AgentToolDigest[] | undefined): number {
  const callCount = toolCalls.filter(call => call.toolName === 'web_search').length;
  if (callCount > 0) return callCount;
  return (digests ?? []).filter(digest => digest.toolName === 'web_search').length;
}

function countSuccessfulReads(toolCalls: ToolCallState[], digests: AgentToolDigest[] | undefined): number {
  const readCalls = toolCalls.filter(call => call.toolName === 'url_read');
  if (readCalls.length > 0) {
    return readCalls.filter(call => call.status === 'success').length;
  }
  return (digests ?? []).filter(digest => digest.toolName === 'url_read' && digest.status === 'success').length;
}

function countSkippedReads(toolCalls: ToolCallState[], digests: AgentToolDigest[] | undefined): number {
  const readCalls = toolCalls.filter(call => call.toolName === 'url_read');
  if (readCalls.length > 0) {
    return readCalls.filter(call => call.status !== 'success' && call.status !== 'running').length;
  }
  return (digests ?? []).filter(digest => digest.toolName === 'url_read' && digest.status !== 'success').length;
}

function countSearchCandidates(toolCalls: ToolCallState[], digests: AgentToolDigest[] | undefined): number {
  const callCount = toolCalls
    .filter(call => call.toolName === 'web_search')
    .reduce((count, call) => count + (call.resultSummary?.count ?? 0), 0);
  if (callCount > 0) return callCount;
  return (digests ?? [])
    .filter(digest => digest.toolName === 'web_search')
    .reduce((count, digest) => count + extractCandidateCount(digest.summary), 0);
}

function collectSearchQueries(
  toolCalls: ToolCallState[],
  fallbackQueries: string[],
): string[] {
  return dedupeSearchQueries([
    ...toolCalls
      .filter(call => call.toolName === 'web_search')
      .map(call => stringArg(call.arguments.query)),
    ...fallbackQueries,
  ]);
}

function stringArg(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function dedupeSearchQueries(queries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawQuery of queries) {
    const query = rawQuery.trim();
    if (!query || seen.has(query)) continue;
    seen.add(query);
    result.push(query);
  }

  return result;
}

function collectSearchSources(
  run: AgentRunState,
  fallbackSources: ExecutionProcessSource[],
): ExecutionProcessSource[] {
  const evidenceById = new Map(
    (run.evidence ?? [])
      .filter(isRenderableSearchEvidence)
      .map(evidence => [evidence.id, toExecutionProcessSource(evidence)]),
  );
  const digestSourceIds = (run.toolDigests ?? [])
    .filter(digest => digest.toolName === 'web_search' && digest.status === 'success')
    .flatMap(digest => digest.sourceRefs);
  const digestSources = digestSourceIds
    .map(sourceId => evidenceById.get(sourceId))
    .filter((source): source is ExecutionProcessSource => Boolean(source));

  if (digestSources.length > 0) {
    return dedupeSources(digestSources);
  }

  const evidenceSources = (run.evidence ?? [])
    .filter(isRenderableSearchEvidence)
    .map(toExecutionProcessSource);
  if (evidenceSources.length > 0) {
    return dedupeSources(evidenceSources);
  }

  return dedupeSources(fallbackSources);
}

function isRenderableSearchEvidence(evidence: AgentEvidenceItem): boolean {
  return evidence.kind === 'web'
    && evidence.status !== 'discarded'
    && Boolean(evidence.url?.trim());
}

function toExecutionProcessSource(evidence: AgentEvidenceItem): ExecutionProcessSource {
  return {
    id: evidence.id,
    title: evidence.title.trim() || evidence.url || '搜索结果',
    url: evidence.url ?? '',
    domain: evidence.domain || deriveDomain(evidence.url),
  };
}

function dedupeSources(sources: ExecutionProcessSource[]): ExecutionProcessSource[] {
  const seen = new Set<string>();
  const result: ExecutionProcessSource[] = [];

  for (const source of sources) {
    const url = source.url.trim();
    if (!url) continue;
    const key = url || source.title;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...source,
      title: source.title.trim() || url,
      url,
      domain: source.domain?.trim() || deriveDomain(url),
    });
  }

  return result;
}

function buildSummary(searchCount: number, readCount: number): string {
  const parts = ['执行过程'];
  if (searchCount > 0) parts.push(`搜索 ${searchCount} 次`);
  if (readCount > 0) parts.push(`读取 ${readCount} 个网页`);
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

function extractCandidateCount(summary: string): number {
  const match = summary.match(/(?:保留|找到)\s*(\d+)\s*条/);
  return match ? Number(match[1]) : 0;
}

function deriveDomain(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || undefined;
  } catch {
    return undefined;
  }
}
