import type {
  ContentBlock,
  FileBlock,
  NetworkSourceStatus,
  SearchBlock,
  SearchSourceSummary,
  SourceReference,
  TextBlock,
  ThinkingBlock,
  UrlBlock,
} from '@/types/conversation';
import {
  STRUCTURED_TOOL_RESULT_CONTRACTS,
  normalizeUnsupportedResultBlock,
  normalizeStructuredToolResultBlock,
} from '@/lib/chat/structuredToolResults';

interface ContentBlockContract {
  type: string;
  schemaVersion: number | null;
  decode: (value: Record<string, unknown>) => ContentBlock | null;
}

const CONTENT_BLOCK_CONTRACTS: readonly ContentBlockContract[] = [
  { type: 'text', schemaVersion: null, decode: decodeTextBlock },
  { type: 'thinking', schemaVersion: null, decode: decodeThinkingBlock },
  { type: 'file', schemaVersion: null, decode: decodeFileBlock },
  { type: 'search', schemaVersion: null, decode: decodeSearchBlock },
  { type: 'url_read', schemaVersion: null, decode: decodeUrlBlock },
  ...STRUCTURED_TOOL_RESULT_CONTRACTS.map(contract => ({
    type: contract.type,
    schemaVersion: contract.schemaVersion,
    decode: contract.type === 'unsupported_result'
      ? normalizeUnsupportedResultBlock
      : decodeStructuredToolResultBlock,
  })),
];

const CONTENT_BLOCK_CONTRACTS_BY_TYPE = CONTENT_BLOCK_CONTRACTS.reduce(
  (registry, contract) => {
    const contracts = registry.get(contract.type) ?? [];
    contracts.push(contract);
    registry.set(contract.type, contracts);
    return registry;
  },
  new Map<string, ContentBlockContract[]>(),
);

export interface RegisteredContentBlockContract {
  type: string;
  schemaVersion: number | null;
}

export function registeredContentBlockContracts(): RegisteredContentBlockContract[] {
  return CONTENT_BLOCK_CONTRACTS.map(({ type, schemaVersion }) => ({ type, schemaVersion }));
}

export function normalizeContentBlock(value: unknown): ContentBlock | null {
  const source = asRecord(value);
  if (!source) return buildUnsupportedResult({}, 'invalid_payload');
  if (typeof source.type !== 'string') return buildUnsupportedResult(source, 'invalid_payload');
  const contracts = CONTENT_BLOCK_CONTRACTS_BY_TYPE.get(source.type);
  if (!contracts) return buildUnsupportedResult(source, 'unsupported_type');
  const versionedContracts = contracts.filter(contract => contract.schemaVersion !== null);
  if (versionedContracts.length > 0 && !Number.isInteger(source.schema_version)) {
    return buildUnsupportedResult(source, 'invalid_payload');
  }
  const contract = versionedContracts.length > 0
    ? versionedContracts.find(item => item.schemaVersion === source.schema_version)
    : contracts.find(item => item.schemaVersion === null);
  if (!contract) return buildUnsupportedResult(source, 'unsupported_version');
  return contract.decode(source) ?? buildUnsupportedResult(source, 'invalid_payload');
}

function decodeStructuredToolResultBlock(source: Record<string, unknown>): ContentBlock | null {
  if (!hasRequiredStructuredResultFields(source)) return null;
  return normalizeStructuredToolResultBlock(source);
}

function hasRequiredStructuredResultFields(source: Record<string, unknown>): boolean {
  const provider = boundedRequiredString(source.provider, 40);
  const status = productResultStatus(source.status);
  if (!provider || !status) return false;

  if (source.type === 'place_results') {
    const query = boundedRequiredString(source.query, 80);
    const resultCount = boundedInteger(source.result_count, 0, 5);
    if (!query || resultCount === null || !Array.isArray(source.places)) return false;
    if (source.places.length !== resultCount || source.places.length > 5) return false;
    return source.places.every(place => {
      const item = asRecord(place);
      return Boolean(item && boundedRequiredString(item.name, 120));
    });
  }

  if (source.type === 'route_results') {
    if (!hasRequiredRouteEndpoint(source.origin) || !hasRequiredRouteEndpoint(source.destination)) {
      return false;
    }
    if (!Array.isArray(source.routes) || source.routes.length < 1 || source.routes.length > 3) {
      return false;
    }
    return source.routes.every(route => {
      const item = asRecord(route);
      return Boolean(item && isRouteMode(item.mode));
    });
  }

  if (source.type === 'weather_results') {
    return normalizeStructuredToolResultBlock(source)?.type === 'weather_results';
  }

  if (source.type === 'flight_results' || source.type === 'train_results') {
    if (source.provider !== 'flyai' || !hasRequiredTravelResultBase(source)) return false;
    const collectionKey = source.type === 'flight_results' ? 'flights' : 'trains';
    const numberKey = source.type === 'flight_results' ? 'flight_no' : 'train_no';
    const options = source[collectionKey];
    const resultCount = boundedInteger(source.result_count, 0, 5);
    if (!Array.isArray(options) || resultCount === null || options.length !== resultCount) return false;
    return options.every(option => {
      const item = asRecord(option);
      return Boolean(
        item
        && boundedRequiredString(item.option_id, 80)
        && boundedRequiredString(item[numberKey], 40)
        && item.stops === 0
        && boundedInteger(item.duration_s, 0, 172_800) !== null
        && hasRequiredTravelEndpoint(item.departure)
        && hasRequiredTravelEndpoint(item.arrival)
        && hasValidTravelMoney(item.price),
      );
    });
  }

  return false;
}

function hasRequiredTravelResultBase(source: Record<string, unknown>): boolean {
  return Boolean(
    boundedRequiredString(source.origin, 80)
    && boundedRequiredString(source.destination, 80)
    && isIsoDate(source.departure_date)
    && isIsoDateTime(source.observed_at),
  );
}

function hasRequiredTravelEndpoint(value: unknown): boolean {
  const endpoint = asRecord(value);
  return Boolean(
    endpoint
    && boundedRequiredString(endpoint.city, 80)
    && boundedRequiredString(endpoint.station_name, 120)
    && isIsoDateTime(endpoint.scheduled_at),
  );
}

function hasValidTravelMoney(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  const money = asRecord(value);
  return Boolean(
    money
    && money.currency === 'CNY'
    && boundedInteger(money.amount_minor, 0, 100_000_000) !== null,
  );
}

function isIsoDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isIsoDateTime(value: unknown): boolean {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function hasRequiredRouteEndpoint(value: unknown): boolean {
  const endpoint = asRecord(value);
  return Boolean(endpoint && boundedRequiredString(endpoint.label, 120));
}

function isRouteMode(value: unknown): boolean {
  return value === 'driving' || value === 'transit' || value === 'walking' || value === 'bicycling';
}

function productResultStatus(value: unknown): boolean {
  return value === 'success' || value === 'degraded';
}

function boundedRequiredString(value: unknown, maxLength: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : null;
}

export function normalizeContentBlocks(value: unknown): ContentBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks = value
    .map(normalizeContentBlock)
    .filter((block): block is ContentBlock => block !== null);
  const usedIds = new Set<string>();
  return blocks.map(block => {
    if (block.type !== 'unsupported_result' || !usedIds.has(block.id)) {
      usedIds.add(block.id);
      return block;
    }
    let collisionIndex = 2;
    let id = withIdSuffix(block.id, collisionIndex);
    while (usedIds.has(id)) {
      collisionIndex += 1;
      id = withIdSuffix(block.id, collisionIndex);
    }
    usedIds.add(id);
    return { ...block, id };
  });
}

function withIdSuffix(id: string, collisionIndex: number): string {
  const suffix = `-${collisionIndex}`;
  return `${id.slice(0, 160 - suffix.length)}${suffix}`;
}

function decodeTextBlock(source: Record<string, unknown>): TextBlock | null {
  const id = requiredString(source.id);
  if (!id || typeof source.text !== 'string') return null;
  return { type: 'text', id, text: source.text };
}

function decodeThinkingBlock(source: Record<string, unknown>): ThinkingBlock | null {
  const id = requiredString(source.id);
  if (!id || typeof source.thinking !== 'string') return null;
  return { type: 'thinking', id, thinking: source.thinking };
}

function decodeFileBlock(source: Record<string, unknown>): FileBlock | null {
  const id = requiredString(source.id);
  const fileId = requiredString(source.file_id);
  if (!id || !fileId) return null;
  return {
    type: 'file',
    id,
    file_id: fileId,
    filename: optionalString(source.filename) ?? '',
    mime_type: optionalString(source.mime_type) ?? '',
    ...optionalField('thumbnail_url', optionalString(source.thumbnail_url)),
    ...optionalField('width', nonNegativeNumber(source.width)),
    ...optionalField('height', nonNegativeNumber(source.height)),
  };
}

function decodeSearchBlock(source: Record<string, unknown>): SearchBlock | null {
  const id = requiredString(source.id);
  if (!id || typeof source.query !== 'string') return null;
  return {
    type: 'search',
    id,
    query: source.query,
    sources: normalizeArray(source.sources, normalizeSearchSource, 20),
    ...optionalField('tool_call_log_id', optionalString(source.tool_call_log_id)),
    ...optionalField('status', networkSourceStatus(source.status)),
    ...optionalField('error_message', optionalNullableString(source.error_message)),
    ...optionalField('source_count', nonNegativeNumber(source.source_count)),
    source_refs: normalizeArray(source.source_refs, normalizeSourceReference, 40),
    ...optionalField('requested_provider', optionalNullableString(source.requested_provider)),
    ...optionalField('result_provider', optionalNullableString(source.result_provider)),
    ...optionalField('fallback_used', optionalBoolean(source.fallback_used)),
    provider_chain: normalizeStringArray(source.provider_chain, 10),
    ...optionalField('requested_count', nonNegativeNumber(source.requested_count)),
    ...optionalField('actual_count', nonNegativeNumber(source.actual_count)),
    ...optionalField('context_source_count', nonNegativeNumber(source.context_source_count)),
    ...optionalField('context_source_limit', nonNegativeNumber(source.context_source_limit)),
    ...optionalField('search_budget', optionalNullableString(source.search_budget)),
    ...optionalField('intent', optionalNullableString(source.intent)),
    domains: normalizeStringArray(source.domains, 20),
    ...optionalField('recency_days', nonNegativeNumber(source.recency_days)),
    ...optionalField('budget_limited', optionalBoolean(source.budget_limited)),
  };
}

function decodeUrlBlock(source: Record<string, unknown>): UrlBlock | null {
  const id = requiredString(source.id);
  const url = requiredString(source.url);
  if (!id || !url) return null;
  return {
    type: 'url_read',
    id,
    url,
    ...optionalField('title', optionalString(source.title)),
    ...optionalField('favicon', optionalString(source.favicon)),
    ...optionalField('tool_call_log_id', optionalString(source.tool_call_log_id)),
    ...optionalField('status', networkSourceStatus(source.status)),
    ...optionalField('error_message', optionalNullableString(source.error_message)),
    ...optionalField('source_count', nonNegativeNumber(source.source_count)),
    source_refs: normalizeArray(source.source_refs, normalizeSourceReference, 40),
    ...optionalField('reason', optionalNullableString(source.reason)),
  };
}

function normalizeSearchSource(value: unknown): SearchSourceSummary | null {
  const source = asRecord(value);
  if (!source) return null;
  const title = requiredString(source.title);
  const url = requiredString(source.url);
  if (!title || !url) return null;
  return { title, url, ...optionalField('favicon', optionalString(source.favicon)) };
}

function normalizeSourceReference(value: unknown): SourceReference | null {
  const source = asRecord(value);
  if (!source || (source.kind !== 'search' && source.kind !== 'url_read')) return null;
  return {
    kind: source.kind,
    title: optionalString(source.title) ?? '',
    url: optionalString(source.url) ?? '',
    ...optionalField('domain', optionalString(source.domain)),
    ...optionalField('favicon', optionalString(source.favicon)),
    ...optionalField('status', networkSourceStatus(source.status)),
    ...optionalField('tool_call_log_id', optionalString(source.tool_call_log_id)),
    ...optionalField('error_message', optionalNullableString(source.error_message)),
  };
}

function normalizeArray<T>(
  value: unknown,
  normalize: (item: unknown) => T | null,
  limit: number,
): T[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, limit)
    .map(normalize)
    .filter((item): item is T => item !== null);
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, limit)
    .map(optionalString)
    .filter((item): item is string => item !== undefined);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function networkSourceStatus(value: unknown): NetworkSourceStatus | undefined {
  return value === 'success' || value === 'failed' || value === 'degraded' || value === 'interrupted'
    ? value
    : undefined;
}

function optionalField<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : { [key]: value } as Record<K, V>;
}

function buildUnsupportedResult(
  source: Record<string, unknown>,
  reason: 'unsupported_type' | 'unsupported_version' | 'invalid_payload',
): ContentBlock {
  const rawSourceType = optionalString(source.type);
  const sourceType = rawSourceType && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(rawSourceType)
    ? rawSourceType
    : 'unknown';
  const rawId = requiredString(source.id);
  const id = rawId && /^[A-Za-z0-9_-]{1,160}$/.test(rawId) ? rawId : `unsupported-${sourceType}`;
  return {
    type: 'unsupported_result',
    id,
    source_type: sourceType,
    ...(Number.isInteger(source.schema_version)
      ? { source_schema_version: Number(source.schema_version) }
      : {}),
    reason,
  };
}
