import type { AgentEvidenceItem } from '@/types/agentRun';
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
  usedItems?: AnswerEvidenceItem[];
  candidateItems?: AnswerEvidenceItem[];
  usedCount?: number;
  candidateCount?: number;
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
  agentEvidence?: AgentEvidenceItem[] | null;
  searchProvider?: string | null;
  previewLimit?: number;
}

export function deriveAnswerEvidence(input: DeriveAnswerEvidenceInput): AnswerEvidenceModel | null {
  const agentEvidenceModel = deriveAgentEvidenceModel(input);
  if (agentEvidenceModel) {
    return agentEvidenceModel;
  }

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
    usedItems: items,
    candidateItems: [],
    usedCount: items.length,
    candidateCount: 0,
    searchCount: searchItems.length,
    urlCount,
    totalCount: items.length,
    hiddenSearchCount: 0,
    hiddenUrlCount: 0,
    summary: buildSummary(searchItems.length, urlCount, deriveSearchProviderLabel(input.searchProvider)),
    hasSearchSources: searchItems.length > 0,
  };
}

function deriveAgentEvidenceModel(input: DeriveAnswerEvidenceInput): AnswerEvidenceModel | null {
  const evidence = input.agentEvidence?.filter(isRenderableAgentWebEvidence) ?? [];
  if (evidence.length === 0) {
    return null;
  }

  const context = buildAgentEvidenceContext(input, evidence);
  const usedEvidence = evidence.filter(item => item.usedByFinalAnswer || item.status === 'used');
  const usedItems = dedupeEvidenceItems(usedEvidence.map((item, index) => toAgentEvidenceItem(item, index, context)));
  const usedKeys = new Set(usedItems.map(item => normalizeUrlKey(item.url)).filter(Boolean));
  const candidateEvidence = evidence.filter(item => isCandidateAgentEvidence(item) && !usedKeys.has(normalizeUrlKey(item.url)));
  const candidateItems = dedupeEvidenceItems(
    candidateEvidence.map((item, index) => toAgentEvidenceItem(item, index + usedItems.length, context)),
  );
  const primaryItems = usedItems.length > 0 ? usedItems : candidateItems;

  if (primaryItems.length === 0 && candidateItems.length === 0) {
    return null;
  }

  const allItems = [...usedItems, ...candidateItems];
  const searchCount = allItems.filter(item => item.kind === 'search_source').length;
  const urlCount = context.deepReadUrls.size;

  return {
    items: primaryItems,
    previewItems: primaryItems,
    usedItems,
    candidateItems,
    usedCount: usedItems.length,
    candidateCount: candidateItems.length,
    searchCount,
    urlCount,
    totalCount: allItems.length,
    hiddenSearchCount: 0,
    hiddenUrlCount: 0,
    summary: buildAgentEvidenceSummary({
      usedCount: usedItems.length,
      candidateCount: candidateItems.length,
      urlCount,
      searchProviderLabel: deriveSearchProviderLabel(input.searchProvider),
    }),
    hasSearchSources: searchCount > 0,
  };
}

interface AgentEvidenceContext {
  searchIndexByUrl: Map<string, number>;
  faviconByUrl: Map<string, string>;
  deepReadUrls: Set<string>;
}

function buildAgentEvidenceContext(
  input: DeriveAnswerEvidenceInput,
  evidence: AgentEvidenceItem[],
): AgentEvidenceContext {
  const searchIndexByUrl = new Map<string, number>();
  const faviconByUrl = new Map<string, string>();
  const deepReadUrls = new Set<string>();
  let searchIndex = 0;

  const addSearch = (url: string | undefined, favicon?: string) => {
    const key = normalizeUrlKey(url);
    if (!key) return;
    if (!searchIndexByUrl.has(key)) {
      searchIndexByUrl.set(key, searchIndex);
      searchIndex += 1;
    }
    if (favicon?.trim() && !faviconByUrl.has(key)) {
      faviconByUrl.set(key, favicon);
    }
  };

  const addDeepRead = (url: string | undefined, favicon?: string) => {
    const key = normalizeUrlKey(url);
    if (!key) return;
    deepReadUrls.add(key);
    if (favicon?.trim() && !faviconByUrl.has(key)) {
      faviconByUrl.set(key, favicon);
    }
  };

  input.sourceRefs?.forEach(ref => {
    if (ref.kind === 'search' && isUsableSourceRef(ref)) {
      addSearch(ref.url, ref.favicon);
    } else if (ref.kind === 'url_read' && isUsableSourceRef(ref)) {
      addDeepRead(ref.url, ref.favicon);
    }
  });
  input.searchSources.forEach(source => addSearch(source.url, source.favicon));
  input.urlBlocks.filter(isSuccessfulUrlBlock).forEach(block => addDeepRead(block.url, block.favicon));
  evidence
    .filter(item => item.status === 'read_success')
    .forEach(item => addDeepRead(item.url, undefined));

  return { searchIndexByUrl, faviconByUrl, deepReadUrls };
}

function toAgentEvidenceItem(
  evidence: AgentEvidenceItem,
  fallbackIndex: number,
  context: AgentEvidenceContext,
): AnswerEvidenceItem {
  const url = evidence.url ?? '';
  const urlKey = normalizeUrlKey(url);
  const searchIndex = context.searchIndexByUrl.get(urlKey);
  const favicon = context.faviconByUrl.get(urlKey);
  const domain = normalizeDomain(evidence.domain, url);
  const base = {
    id: `agent-evidence-${evidence.id || fallbackIndex}`,
    title: normalizeTitle(evidence.title, url),
    url,
    domain,
    favicon: normalizeFavicon(url, favicon),
  };

  if (evidence.status === 'read_success' || (searchIndex == null && context.deepReadUrls.has(urlKey))) {
    return {
      ...base,
      kind: 'url_read',
    };
  }

  return {
    ...base,
    kind: 'search_source',
    sourceIndex: searchIndex ?? fallbackIndex,
    deepRead: context.deepReadUrls.has(urlKey),
  };
}

function dedupeEvidenceItems(items: AnswerEvidenceItem[]): AnswerEvidenceItem[] {
  const deduped: AnswerEvidenceItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = normalizeUrlKey(item.url) || item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function isRenderableAgentWebEvidence(item: AgentEvidenceItem): boolean {
  if (item.kind !== 'web' || !item.url?.trim()) {
    return false;
  }

  return item.status === 'used'
    || item.usedByFinalAnswer
    || item.status === 'candidate'
    || item.status === 'selected'
    || item.status === 'read_success';
}

function isCandidateAgentEvidence(item: AgentEvidenceItem): boolean {
  return item.status === 'candidate' || item.status === 'selected' || item.status === 'read_success';
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

function buildAgentEvidenceSummary({
  usedCount,
  candidateCount,
  urlCount,
  searchProviderLabel,
}: {
  usedCount: number;
  candidateCount: number;
  urlCount: number;
  searchProviderLabel?: string;
}): string {
  const parts = ['回答依据'];

  if (usedCount > 0) {
    parts.push(`已使用 ${usedCount} 条`);
  }

  if (candidateCount > 0) {
    parts.push(`候选 ${candidateCount} 条`);
  }

  if (urlCount > 0) {
    parts.push(`深读 ${urlCount} 个网页`);
  }

  if ((usedCount > 0 || candidateCount > 0) && searchProviderLabel) {
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
