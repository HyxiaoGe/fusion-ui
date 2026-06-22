import type { SearchSourceSummary, UrlBlock } from '@/types/conversation';

export type AnswerEvidenceKind = 'search_source' | 'url_read';

interface BaseAnswerEvidenceItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  favicon?: string;
}

type SearchAnswerEvidenceItem = BaseAnswerEvidenceItem & {
  kind: 'search_source';
  sourceIndex: number;
};

type UrlReadAnswerEvidenceItem = BaseAnswerEvidenceItem & {
  kind: 'url_read';
};

export type AnswerEvidenceItem = SearchAnswerEvidenceItem | UrlReadAnswerEvidenceItem;

export interface AnswerEvidenceModel {
  items: AnswerEvidenceItem[];
  previewItems: AnswerEvidenceItem[];
  searchCount: number;
  urlCount: number;
  totalCount: number;
  hiddenSearchCount: number;
  hiddenUrlCount: number;
  summary: string;
  hasSearchSources: boolean;
}

interface DeriveAnswerEvidenceInput {
  searchSources: SearchSourceSummary[];
  urlBlocks: UrlBlock[];
  previewLimit?: number;
}

export function deriveAnswerEvidence(input: DeriveAnswerEvidenceInput): AnswerEvidenceModel | null {
  const searchItems = input.searchSources.map(toSearchEvidenceItem);
  const urlItems = input.urlBlocks.map(toUrlEvidenceItem);
  const items = [...searchItems, ...urlItems];

  if (items.length === 0) {
    return null;
  }

  const previewLimit = normalizePreviewLimit(input.previewLimit);
  const previewItems = derivePreviewItems(searchItems, urlItems, previewLimit);
  const previewSearchCount = previewItems.filter(item => item.kind === 'search_source').length;
  const previewUrlCount = previewItems.filter(item => item.kind === 'url_read').length;
  const hiddenSearchCount = Math.max(0, searchItems.length - previewSearchCount);
  const hiddenUrlCount = Math.max(0, urlItems.length - previewUrlCount);

  return {
    items,
    previewItems,
    searchCount: searchItems.length,
    urlCount: urlItems.length,
    totalCount: items.length,
    hiddenSearchCount,
    hiddenUrlCount,
    summary: buildSummary(searchItems.length, urlItems.length),
    hasSearchSources: searchItems.length > 0,
  };
}

function toSearchEvidenceItem(source: SearchSourceSummary, index: number): SearchAnswerEvidenceItem {
  return {
    id: `search-${index}`,
    kind: 'search_source',
    title: normalizeTitle(source.title, source.url),
    url: source.url,
    domain: deriveDomain(source.url),
    favicon: source.favicon,
    sourceIndex: index,
  };
}

function toUrlEvidenceItem(block: UrlBlock): UrlReadAnswerEvidenceItem {
  return {
    id: `url-${block.id}`,
    kind: 'url_read',
    title: normalizeTitle(block.title, block.url),
    url: block.url,
    domain: deriveDomain(block.url),
    favicon: block.favicon,
  };
}

function normalizeTitle(title: string | undefined, fallbackUrl: string): string {
  return title?.trim() || fallbackUrl;
}

function deriveDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || url;
  } catch {
    return url;
  }
}

function normalizePreviewLimit(previewLimit: number | undefined): number {
  const rawLimit = previewLimit ?? 3;

  if (!Number.isFinite(rawLimit)) {
    return 3;
  }

  return Math.max(1, Math.floor(rawLimit));
}

function derivePreviewItems(
  searchItems: SearchAnswerEvidenceItem[],
  urlItems: UrlReadAnswerEvidenceItem[],
  previewLimit: number,
): AnswerEvidenceItem[] {
  if (searchItems.length > 0 && urlItems.length > 0) {
    if (previewLimit === 1) {
      return urlItems.slice(0, 1);
    }

    const searchPreviewCount = Math.min(searchItems.length, previewLimit - 1);
    const urlPreviewCount = previewLimit - searchPreviewCount;

    return [
      ...searchItems.slice(0, searchPreviewCount),
      ...urlItems.slice(0, urlPreviewCount),
    ];
  }

  return [...searchItems, ...urlItems].slice(0, previewLimit);
}

function buildSummary(searchCount: number, urlCount: number): string {
  const parts = ['回答依据'];

  if (searchCount > 0) {
    parts.push(`搜索 ${searchCount} 条`);
  }

  if (urlCount > 0) {
    parts.push(`读取 ${urlCount} 个网页`);
  }

  return parts.join(' · ');
}
