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
  isRenderable: boolean;
}

interface DeriveAnswerEvidenceSidebarInput {
  answerEvidence: AnswerEvidenceModel | null;
  searchBlock?: SearchBlock | null;
  urlBlocks: UrlBlock[];
}

export function deriveAnswerEvidenceSidebar(
  input: DeriveAnswerEvidenceSidebarInput,
): AnswerEvidenceSidebarModel | null {
  const usedItems = input.answerEvidence?.items.map(toUsedItem) ?? [];
  const issueItems = collectIssueItems(input.searchBlock ?? null, input.urlBlocks);

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
    isRenderable: true,
  };
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
      reason: getIssueReason(searchBlock.status, searchBlock.error_message),
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
        reason: getIssueReason(block.status, block.error_message),
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
      reason: getIssueReason(ref.status, ref.error_message),
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

function getIssueReason(status: NetworkSourceStatus | undefined, errorMessage?: string | null): string {
  if (errorMessage?.trim()) {
    return errorMessage.trim();
  }

  if (status === 'degraded') {
    return '部分内容不可用，已降级处理';
  }

  if (status === 'interrupted') {
    return '读取已中断';
  }

  return '未取得可用内容';
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
