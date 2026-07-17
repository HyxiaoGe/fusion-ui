import type {
  PlaceResultsBlock,
  ProviderPlacePhoto,
  ProviderPlaceResult,
  ProviderRouteEndpoint,
  ProviderRouteResult,
  RouteResultsBlock,
  StructuredToolResultBlock,
} from '@/types/conversation';

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
    ...optionalField('platform_url', optionalString(source.platform_url)),
  };
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
    ...optionalField('distance_m', nonNegativeNumber(source.distance_m)),
    ...optionalField('duration_s', nonNegativeNumber(source.duration_s)),
    ...optionalField('summary', optionalString(source.summary)),
    ...optionalField('toll_yuan', nonNegativeNumber(source.toll_yuan)),
    ...optionalField('transfers', nonNegativeNumber(source.transfers)),
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

function optionalField<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : { [key]: value } as Record<K, V>;
}
