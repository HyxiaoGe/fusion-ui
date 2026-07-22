import type {
  ContentBlock,
  PlaceResultsBlock,
  ProviderPlacePhoto,
  ProviderPlaceResult,
  ProviderRouteEndpoint,
  ProviderRouteResult,
  ProviderTransitAlternative,
  ProviderTransitLeg,
  ProviderTransitLegKind,
  ProviderTransitType,
  RouteResultsBlock,
  StructuredResultAction,
  StructuredResultAttribution,
  StructuredToolResultBlock,
  UnsupportedResultBlock,
} from '@/types/conversation';

export const STRUCTURED_TOOL_RESULT_CONTRACTS = [
  { type: 'place_results', schemaVersion: 1 },
  { type: 'route_results', schemaVersion: 1 },
  { type: 'unsupported_result', schemaVersion: null },
] as const;

export type StructuredToolResultType = typeof STRUCTURED_TOOL_RESULT_CONTRACTS[number]['type'];

export function isStructuredToolResultType(value: unknown): value is StructuredToolResultType {
  return STRUCTURED_TOOL_RESULT_CONTRACTS.some(contract => contract.type === value);
}

export function isStructuredToolResultBlock(block: ContentBlock): block is StructuredToolResultBlock {
  return isStructuredToolResultType(block.type);
}

export function collectStructuredToolResultBlocks(
  blocks: readonly ContentBlock[],
): StructuredToolResultBlock[] {
  return blocks.filter(isStructuredToolResultBlock);
}

export function hasUsableStructuredToolResult(blocks: readonly ContentBlock[]): boolean {
  return collectStructuredToolResultBlocks(blocks).some(block => {
    if (block.type === 'place_results') return (block.places?.length ?? 0) > 0;
    if (block.type === 'route_results') return (block.routes?.length ?? 0) > 0;
    return true;
  });
}

export function normalizeUnsupportedResultBlock(value: unknown): UnsupportedResultBlock | null {
  const source = asRecord(value);
  if (!source || source.type !== 'unsupported_result') return null;
  const id = boundedString(source.id, 160);
  const sourceType = boundedString(source.source_type, 80);
  const reason = unsupportedReason(source.reason);
  if (!id || !sourceType || !reason) return null;
  return {
    type: 'unsupported_result',
    id,
    source_type: sourceType,
    ...(Number.isInteger(source.source_schema_version) && Number(source.source_schema_version) >= 0
      ? { source_schema_version: Number(source.source_schema_version) }
      : {}),
    reason,
  };
}

export function normalizeStructuredToolResultBlock(value: unknown): StructuredToolResultBlock | null {
  const source = asRecord(value);
  if (!source || source.schema_version !== 1) return null;
  const id = optionalString(source.id);
  if (!id) return null;

  if (source.type === 'place_results') {
    const block: PlaceResultsBlock = {
      type: 'place_results',
      id,
      schema_version: 1,
      ...optionalField('provider', optionalString(source.provider)),
      ...optionalField(
        'attribution',
        normalizeAttribution(source.attribution) ?? normalizeLegacyAttribution(source.provider),
      ),
      ...optionalField('query', optionalString(source.query)),
      ...optionalField('near', optionalString(source.near)),
      ...optionalField('status', productResultStatus(source.status)),
      ...optionalField('result_count', nonNegativeNumber(source.result_count)),
      places: normalizeArray(source.places, normalizePlace, 5),
      limitations: normalizeStringArray(source.limitations, 8),
      ...optionalField('tool_call_log_id', optionalString(source.tool_call_log_id)),
    };
    return block;
  }

  if (source.type === 'route_results') {
    const block: RouteResultsBlock = {
      type: 'route_results',
      id,
      schema_version: 1,
      ...optionalField('provider', optionalString(source.provider)),
      ...optionalField(
        'attribution',
        normalizeAttribution(source.attribution) ?? normalizeLegacyAttribution(source.provider),
      ),
      ...optionalField('origin', normalizeEndpoint(source.origin)),
      ...optionalField('destination', normalizeEndpoint(source.destination)),
      routes: normalizeArray(source.routes, normalizeRoute, 3),
      unavailable_modes: normalizeStringArray(source.unavailable_modes, 3),
      limitations: normalizeStringArray(source.limitations, 8),
      ...optionalField('status', productResultStatus(source.status)),
      ...optionalField('tool_call_log_id', optionalString(source.tool_call_log_id)),
    };
    return block;
  }

  return null;
}

function normalizePlace(value: unknown): ProviderPlaceResult | null {
  const source = asRecord(value);
  if (!source) return null;
  const actions = normalizeArray(source.actions, normalizeExternalAction, 2);
  const legacyAction = actions.length === 0
    ? normalizeExternalAction({
      kind: 'open_external',
      label: '查看详情',
      url: source.platform_url,
    })
    : null;
  return {
    ...optionalField('provider_place_id', optionalString(source.provider_place_id)),
    ...optionalField('name', optionalString(source.name)),
    ...optionalField('address', optionalString(source.address)),
    ...optionalField('district', optionalString(source.district)),
    ...optionalField('business_area', optionalString(source.business_area)),
    ...optionalField('category', optionalString(source.category)),
    ...optionalField('distance_m', nonNegativeNumber(source.distance_m)),
    photos: normalizeArray(source.photos, normalizePhoto, 5),
    ...optionalField('rating', nonNegativeNumber(source.rating)),
    ...optionalField('reference_cost_yuan', nonNegativeNumber(source.reference_cost_yuan)),
    ...optionalField('open_hours', optionalString(source.open_hours)),
    ...optionalField('detail_status', detailStatus(source.detail_status)),
    actions: legacyAction ? [legacyAction] : actions,
  };
}

function normalizeAttribution(value: unknown): StructuredResultAttribution | undefined {
  const source = asRecord(value);
  const label = source ? boundedString(source.label, 80) : undefined;
  return label ? { label } : undefined;
}

function normalizeLegacyAttribution(value: unknown): StructuredResultAttribution | undefined {
  const provider = optionalString(value)?.toLowerCase();
  if (!provider) return undefined;
  return { label: provider === 'amap' ? '高德地图' : '地图服务' };
}

function normalizeExternalAction(value: unknown): StructuredResultAction | null {
  const source = asRecord(value);
  if (!source || source.kind !== 'open_external') return null;
  const label = boundedString(source.label, 40);
  const url = safeHttpsUrl(source.url);
  return label && url ? { kind: 'open_external', label, url } : null;
}

function safeHttpsUrl(value: unknown): string | undefined {
  const normalized = boundedString(value, 2048);
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizePhoto(value: unknown): ProviderPlacePhoto | null {
  const source = asRecord(value);
  if (!source) return null;
  const url = optionalString(source.url);
  if (!url) return null;
  return {
    url,
    ...optionalField('title', optionalString(source.title)),
  };
}

function normalizeEndpoint(value: unknown): ProviderRouteEndpoint | undefined {
  const source = asRecord(value);
  if (!source) return undefined;
  const label = optionalString(source.label);
  const city = optionalString(source.city);
  if (!label && !city) return undefined;
  return {
    ...optionalField('label', label),
    ...optionalField('city', city),
  };
}

function normalizeRoute(value: unknown): ProviderRouteResult | null {
  const source = asRecord(value);
  if (!source) return null;
  return {
    ...optionalField('mode', optionalString(source.mode)),
    ...optionalField('transit_type', transitType(source.transit_type)),
    ...optionalField('distance_m', nonNegativeNumber(source.distance_m)),
    ...optionalField('duration_s', nonNegativeNumber(source.duration_s)),
    ...optionalField('walking_distance_m', nonNegativeNumber(source.walking_distance_m)),
    ...optionalField('summary', optionalString(source.summary)),
    ...optionalField('toll_yuan', nonNegativeNumber(source.toll_yuan)),
    ...optionalField('transfers', nonNegativeNumber(source.transfers)),
    legs: normalizeArray(source.legs, normalizeTransitLeg, 8),
    alternatives: normalizeArray(source.alternatives, normalizeTransitAlternative, 2),
  };
}

function normalizeTransitLeg(value: unknown): ProviderTransitLeg | null {
  const source = asRecord(value);
  if (!source) return null;
  return {
    ...optionalField('kind', transitLegKind(source.kind)),
    ...optionalField('line_name', optionalString(source.line_name)),
    ...optionalField('departure_stop', optionalString(source.departure_stop)),
    ...optionalField('arrival_stop', optionalString(source.arrival_stop)),
    ...optionalField('via_stop_count', nonNegativeNumber(source.via_stop_count)),
    ...optionalField('distance_m', nonNegativeNumber(source.distance_m)),
    ...optionalField('duration_s', nonNegativeNumber(source.duration_s)),
    ...optionalField('entrance', optionalString(source.entrance)),
    ...optionalField('exit', optionalString(source.exit)),
  };
}

function normalizeTransitAlternative(value: unknown): ProviderTransitAlternative | null {
  const source = asRecord(value);
  if (!source) return null;
  return {
    ...optionalField('transit_type', transitType(source.transit_type)),
    ...optionalField('distance_m', nonNegativeNumber(source.distance_m)),
    ...optionalField('duration_s', nonNegativeNumber(source.duration_s)),
    ...optionalField('walking_distance_m', nonNegativeNumber(source.walking_distance_m)),
    ...optionalField('transfers', nonNegativeNumber(source.transfers)),
    ...optionalField('summary', optionalString(source.summary)),
    legs: normalizeArray(source.legs, normalizeTransitLeg, 8),
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
    .filter((item): item is string => Boolean(item));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  const normalized = optionalString(value);
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function productResultStatus(value: unknown): 'success' | 'degraded' | undefined {
  return value === 'success' || value === 'degraded'
    ? value
    : undefined;
}

function detailStatus(
  value: unknown,
): 'enriched' | 'unavailable' | 'budget_limited' | 'not_requested' | undefined {
  return value === 'enriched'
    || value === 'unavailable'
    || value === 'budget_limited'
    || value === 'not_requested'
    ? value
    : undefined;
}

function transitType(value: unknown): ProviderTransitType | undefined {
  return value === 'subway'
    || value === 'bus'
    || value === 'mixed'
    || value === 'public_transit'
    ? value
    : undefined;
}

function transitLegKind(value: unknown): ProviderTransitLegKind | undefined {
  return value === 'walking'
    || value === 'subway'
    || value === 'bus'
    || value === 'other'
    ? value
    : undefined;
}

function unsupportedReason(
  value: unknown,
): UnsupportedResultBlock['reason'] | undefined {
  return value === 'unsupported_type'
    || value === 'unsupported_version'
    || value === 'invalid_payload'
    ? value
    : undefined;
}

function optionalField<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : { [key]: value } as Record<K, V>;
}
