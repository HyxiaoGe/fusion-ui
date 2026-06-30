import type { SearchSourceSummary, SourceReference, UrlBlock } from '@/types/conversation';

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
  deepRead?: boolean;
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
  sourceRefs?: SourceReference[];
  searchSources: SearchSourceSummary[];
  urlBlocks: UrlBlock[];
  searchProvider?: string | null;
  previewLimit?: number;
}

export function deriveAnswerEvidence(input: DeriveAnswerEvidenceInput): AnswerEvidenceModel | null {
  const useSourceRefs = Boolean(input.sourceRefs && input.sourceRefs.length > 0);
  const sourceRefItems = input.sourceRefs?.filter(isUsableSourceRef) ?? [];
  const unifiedItems = useSourceRefs
    ? toSourceRefEvidenceItems(sourceRefItems, buildFaviconFallbacks(input.searchSources, input.urlBlocks))
    : null;
  const legacyItems = unifiedItems ? null : toLegacyEvidenceItems(input.searchSources, input.urlBlocks);
  const searchItems = unifiedItems?.searchItems ?? legacyItems?.searchItems ?? [];
  const urlItems = unifiedItems?.urlItems ?? legacyItems?.urlItems ?? [];
  const urlCount = unifiedItems?.urlCount ?? legacyItems?.urlCount ?? urlItems.length;
  const items = [...searchItems, ...urlItems];

  if (items.length === 0) {
    return null;
  }

  return {
    items,
    previewItems: items,
    searchCount: searchItems.length,
    urlCount,
    totalCount: items.length,
    hiddenSearchCount: 0,
    hiddenUrlCount: 0,
    summary: buildSummary(searchItems.length, urlCount, deriveSearchProviderLabel(input.searchProvider)),
    hasSearchSources: searchItems.length > 0,
  };
}

function toSearchEvidenceItem(
  source: SearchSourceSummary,
  index: number,
  deepReadUrls: Set<string> = new Set(),
): SearchAnswerEvidenceItem {
  return {
    id: `search-${index}`,
    kind: 'search_source',
    title: normalizeTitle(source.title, source.url),
    url: source.url,
    domain: deriveDomain(source.url),
    favicon: normalizeFavicon(source.url, source.favicon),
    sourceIndex: index,
    deepRead: deepReadUrls.has(normalizeUrlKey(source.url)),
  };
}

function toUrlEvidenceItem(block: UrlBlock): UrlReadAnswerEvidenceItem {
  return {
    id: `url-${block.id}`,
    kind: 'url_read',
    title: normalizeTitle(block.title, block.url),
    url: block.url,
    domain: deriveDomain(block.url),
    favicon: normalizeFavicon(block.url, block.favicon),
  };
}

function toSourceRefEvidenceItems(
  sourceRefs: SourceReference[],
  faviconFallbacks: FaviconFallbacks,
): {
  searchItems: SearchAnswerEvidenceItem[];
  urlItems: UrlReadAnswerEvidenceItem[];
  urlCount: number;
} {
  let searchIndex = 0;
  const urlReadRefs = sourceRefs.filter(source => source.kind === 'url_read');
  const deepReadUrls = new Set(urlReadRefs.map(source => normalizeUrlKey(source.url)).filter(Boolean));
  const searchUrls = new Set(
    sourceRefs
      .filter(source => source.kind === 'search')
      .map(source => normalizeUrlKey(source.url))
      .filter(Boolean),
  );
  const searchItems: SearchAnswerEvidenceItem[] = [];
  const urlItems: UrlReadAnswerEvidenceItem[] = [];

  sourceRefs.forEach((source, index) => {
    const base = {
      id: `source-ref-${index}`,
      title: normalizeTitle(source.title, source.url),
      url: source.url,
      domain: normalizeDomain(source.domain, source.url),
      favicon: normalizeFavicon(source.url, source.favicon || findFallbackFavicon(source.url, faviconFallbacks)),
    };

    if (source.kind === 'search') {
      const urlKey = normalizeUrlKey(source.url);
      searchItems.push({
        ...base,
        kind: 'search_source',
        sourceIndex: searchIndex,
        deepRead: deepReadUrls.has(urlKey),
      });
      searchIndex += 1;
    } else {
      const urlKey = normalizeUrlKey(source.url);
      if (searchUrls.has(urlKey)) {
        return;
      }
      urlItems.push({
        ...base,
        kind: 'url_read',
      });
    }
  });

  return {
    searchItems,
    urlItems,
    urlCount: deepReadUrls.size,
  };
}

function toLegacyEvidenceItems(
  searchSources: SearchSourceSummary[],
  urlBlocks: UrlBlock[],
): {
  searchItems: SearchAnswerEvidenceItem[];
  urlItems: UrlReadAnswerEvidenceItem[];
  urlCount: number;
} {
  const successfulUrlBlocks = urlBlocks.filter(isSuccessfulUrlBlock);
  const deepReadUrls = new Set(successfulUrlBlocks.map(block => normalizeUrlKey(block.url)).filter(Boolean));
  const searchUrls = new Set(searchSources.map(source => normalizeUrlKey(source.url)).filter(Boolean));
  return {
    searchItems: searchSources.map((source, index) => toSearchEvidenceItem(source, index, deepReadUrls)),
    urlItems: successfulUrlBlocks
      .filter(block => !searchUrls.has(normalizeUrlKey(block.url)))
      .map(toUrlEvidenceItem),
    urlCount: deepReadUrls.size,
  };
}

interface FaviconFallbacks {
  byUrl: Map<string, string>;
  byDomain: Map<string, string>;
}

function buildFaviconFallbacks(
  searchSources: SearchSourceSummary[],
  urlBlocks: UrlBlock[],
): FaviconFallbacks {
  const byUrl = new Map<string, string>();
  const byDomain = new Map<string, string>();

  const add = (url: string, favicon?: string) => {
    if (!favicon?.trim()) return;
    byUrl.set(url, favicon);
    const domain = deriveDomain(url);
    if (!byDomain.has(domain)) {
      byDomain.set(domain, favicon);
    }
  };

  searchSources.forEach(source => add(source.url, source.favicon));
  urlBlocks.forEach(block => add(block.url, block.favicon));

  return { byUrl, byDomain };
}

function findFallbackFavicon(url: string, fallback: FaviconFallbacks): string | undefined {
  return fallback.byUrl.get(url) ?? fallback.byDomain.get(deriveDomain(url));
}

function normalizeFavicon(url: string, favicon: string | undefined): string | undefined {
  const trimmed = favicon?.trim();
  if (trimmed) {
    return trimmed;
  }

  return deriveSameOriginFavicon(url);
}

function deriveSameOriginFavicon(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

function isUsableSourceRef(source: SourceReference): boolean {
  if (!source.url?.trim()) {
    return false;
  }

  return source.status == null || source.status === 'success';
}

function isSuccessfulUrlBlock(block: UrlBlock): boolean {
  return block.status == null || block.status === 'success';
}

function normalizeTitle(title: string | undefined, fallbackUrl: string): string {
  return title?.trim() || fallbackUrl;
}

function normalizeDomain(domain: string | undefined, fallbackUrl: string): string {
  return domain?.trim() || deriveDomain(fallbackUrl);
}

function deriveDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || url;
  } catch {
    return url;
  }
}

function buildSummary(searchCount: number, urlCount: number, searchProviderLabel?: string): string {
  const parts = ['回答依据'];

  if (searchCount > 0) {
    parts.push(`搜索候选 ${searchCount} 条`);
  }

  if (urlCount > 0) {
    parts.push(`深读 ${urlCount} 个网页`);
  }

  if (searchCount > 0 && searchProviderLabel) {
    parts.push(`本次搜索由 ${searchProviderLabel} 提供`);
  }

  return parts.join(' · ');
}

function normalizeUrlKey(url: string | undefined): string {
  const trimmed = url?.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

const SEARCH_PROVIDER_LABELS: Record<string, string> = {
  brave: 'Brave',
  firecrawl: 'Firecrawl',
  tavily: 'Tavily',
};

function deriveSearchProviderLabel(provider: string | null | undefined): string | undefined {
  if (!provider) {
    return undefined;
  }

  const trimmed = provider.trim();
  if (!trimmed) {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  return SEARCH_PROVIDER_LABELS[normalized] ?? trimmed;
}
