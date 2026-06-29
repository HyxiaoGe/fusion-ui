import type { NetworkSourceStatus, SearchBlock, SourceReference, UrlBlock } from '@/types/conversation';
import type { AnswerEvidenceItem, AnswerEvidenceModel } from './answerEvidenceModel';

export type AnswerEvidenceSidebarItemKind = 'search' | 'url_read';
export type AnswerEvidenceSidebarItemStatus = NetworkSourceStatus;

export interface AnswerEvidenceSidebarUsedItem {
  id: string;
  kind: AnswerEvidenceSidebarItemKind;
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  sourceIndex?: number;
}

export interface AnswerEvidenceSidebarIssueItem {
  id: string;
  kind: AnswerEvidenceSidebarItemKind;
  title: string;
  url?: string;
  domain?: string;
  status: Exclude<AnswerEvidenceSidebarItemStatus, 'success'>;
  reason: string;
}

export interface AnswerEvidenceSidebarSummary {
  usedCount: number;
  searchCount: number;
  urlCount: number;
  issueCount: number;
}

export interface AnswerEvidenceSidebarModel {
  summary: AnswerEvidenceSidebarSummary;
  usedItems: AnswerEvidenceSidebarUsedItem[];
  issueItems: AnswerEvidenceSidebarIssueItem[];
  searchQueries: string[];
  isRenderable: boolean;
}

interface DeriveAnswerEvidenceSidebarInput {
  answerEvidence: AnswerEvidenceModel | null;
  searchBlock?: SearchBlock | null;
  urlBlocks: UrlBlock[];
  searchQueries?: string[];
}

export function deriveAnswerEvidenceSidebar(
  input: DeriveAnswerEvidenceSidebarInput,
): AnswerEvidenceSidebarModel | null {
  const usedItems = input.answerEvidence?.items.map(toUsedItem) ?? [];
  const issueItems = collectIssueItems(input.searchBlock ?? null, input.urlBlocks);
  const searchQueries = normalizeSearchQueries([
    ...(input.searchQueries ?? []),
    input.searchBlock?.query ?? '',
  ]);

  if (usedItems.length === 0 && issueItems.length === 0) {
    return null;
  }

  return {
    summary: {
      usedCount: usedItems.length,
      searchCount: input.answerEvidence?.searchCount ?? countUsedByKind(usedItems, 'search'),
      urlCount: input.answerEvidence?.urlCount ?? countUsedByKind(usedItems, 'url_read'),
      issueCount: issueItems.length,
    },
    usedItems,
    issueItems,
    searchQueries,
    isRenderable: true,
  };
}

function normalizeSearchQueries(queries: string[]): string[] {
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

function toUsedItem(item: AnswerEvidenceItem): AnswerEvidenceSidebarUsedItem {
  return {
    id: item.id,
    kind: item.kind === 'search_source' ? 'search' : 'url_read',
    title: item.title,
    url: item.url,
    domain: item.domain,
    favicon: item.favicon,
    sourceIndex: item.kind === 'search_source' ? item.sourceIndex : undefined,
  };
}

function collectIssueItems(
  searchBlock: SearchBlock | null,
  urlBlocks: UrlBlock[],
): AnswerEvidenceSidebarIssueItem[] {
  const items: AnswerEvidenceSidebarIssueItem[] = [];
  const seen = new Set<string>();

  const add = (item: AnswerEvidenceSidebarIssueItem) => {
    const key = item.url ? `url:${item.url}` : `${item.kind}:${item.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  collectSourceRefIssues(searchBlock?.source_refs ?? []).forEach(add);

  if (searchBlock && isIssueStatus(searchBlock.status) && !hasSourceRefs(searchBlock)) {
    add({
      id: `search-block-${searchBlock.id}`,
      kind: 'search',
      title: searchBlock.query,
      status: searchBlock.status,
      reason: getIssueReason('search', searchBlock.status, searchBlock.error_message),
    });
  }

  urlBlocks.forEach(block => {
    collectSourceRefIssues(block.source_refs ?? []).forEach(add);
    if (isIssueStatus(block.status) && !hasSourceRefs(block)) {
      add({
        id: `url-block-${block.id}`,
        kind: 'url_read',
        title: normalizeTitle(block.title, block.url),
        url: block.url,
        domain: deriveDomain(block.url),
        status: block.status,
        reason: getIssueReason('url_read', block.status, block.error_message),
      });
    }
  });

  return items;
}

function collectSourceRefIssues(sourceRefs: SourceReference[]): AnswerEvidenceSidebarIssueItem[] {
  return sourceRefs
    .filter(ref => isIssueStatus(ref.status))
    .map((ref, index) => ({
      id: `source-ref-issue-${index}-${ref.kind}-${ref.url || ref.title}`,
      kind: ref.kind,
      title: normalizeTitle(ref.title, ref.url || ref.kind),
      url: ref.url || undefined,
      domain: ref.url ? deriveDomain(ref.url) : undefined,
      status: ref.status as Exclude<AnswerEvidenceSidebarItemStatus, 'success'>,
      reason: getIssueReason(ref.kind, ref.status, ref.error_message),
    }));
}

function hasSourceRefs(block: SearchBlock | UrlBlock): boolean {
  return Boolean(block.source_refs && block.source_refs.length > 0);
}

function isIssueStatus(
  status: NetworkSourceStatus | undefined,
): status is Exclude<NetworkSourceStatus, 'success'> {
  return status === 'failed' || status === 'degraded' || status === 'interrupted';
}

function getIssueReason(
  kind: AnswerEvidenceSidebarItemKind,
  status: NetworkSourceStatus | undefined,
  errorMessage?: string | null,
): string {
  const rawReason = errorMessage?.trim();
  if (rawReason === 'url 为空') {
    return '缺少可读取的网址';
  }

  if (kind === 'search') {
    if (status === 'interrupted') {
      return '搜索已中断';
    }
    return '部分搜索结果未能使用';
  }

  if (kind === 'url_read') {
    if (status === 'failed') {
      return '网页暂时无法读取';
    }
    if (status === 'degraded') {
      return '部分网页暂时无法读取';
    }
    if (status === 'interrupted') {
      return '读取已中断';
    }
  }

  if (rawReason && !isInternalFailureReason(rawReason)) {
    return rawReason;
  }

  if (status === 'failed') {
    return '网页暂时无法读取';
  }

  if (status === 'degraded') {
    return '部分网页暂时无法读取';
  }

  if (status === 'interrupted') {
    return '读取已中断';
  }

  return '未取得可用内容';
}

function isInternalFailureReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized.includes('reader-service')
    || normalized.includes('web_search')
    || normalized.includes('url_read')
    || normalized.includes('timeout')
    || normalized.includes('超时')
    || normalized.includes('本轮联网预算')
    || normalized.includes('已降级跳过')
    || normalized.includes('降级处理')
    || normalized.includes('预算');
}

function normalizeTitle(title: string | undefined, fallback: string): string {
  return title?.trim() || fallback;
}

function deriveDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || url;
  } catch {
    return url;
  }
}

function countUsedByKind(items: AnswerEvidenceSidebarUsedItem[], kind: AnswerEvidenceSidebarItemKind): number {
  return items.filter(item => item.kind === kind).length;
}
