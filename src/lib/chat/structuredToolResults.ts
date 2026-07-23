import type {
  ContentBlock,
  ForecastDay,
  FlightResultsBlock,
  PlaceResultsBlock,
  ProviderFlightResult,
  ProviderPlacePhoto,
  ProviderPlaceResult,
  ProviderRouteEndpoint,
  ProviderRouteResult,
  ProviderTransitAlternative,
  ProviderTransitLeg,
  ProviderTransitLegKind,
  ProviderTransitType,
  ProviderTrainResult,
  RouteResultsBlock,
  StructuredResultAction,
  StructuredResultAttribution,
  StructuredToolResultBlock,
  TrainResultsBlock,
  TravelEndpoint,
  TravelMoney,
  UnsupportedResultBlock,
  WeatherResultsBlock,
} from '@/types/conversation';

export const STRUCTURED_TOOL_RESULT_CONTRACTS = [
  { type: 'place_results', schemaVersion: 1 },
  { type: 'route_results', schemaVersion: 1 },
  { type: 'flight_results', schemaVersion: 1 },
  { type: 'train_results', schemaVersion: 1 },
  { type: 'weather_results', schemaVersion: 1 },
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
  const collected: StructuredToolResultBlock[] = [];
  const travelBlockIndex = new Map<string, number>();

  blocks.forEach(block => {
    if (!isStructuredToolResultBlock(block)) return;
    if (!isTravelResultBlock(block)) {
      collected.push(block);
      return;
    }

    const queryKey = travelResultQueryKey(block);
    if (!queryKey) {
      collected.push(block);
      return;
    }

    const existingIndex = travelBlockIndex.get(queryKey);
    if (existingIndex === undefined) {
      travelBlockIndex.set(queryKey, collected.length);
      collected.push(dedupeTravelResultBlock(block));
      return;
    }

    const existing = collected[existingIndex];
    if (!isTravelResultBlock(existing) || existing.type !== block.type) {
      collected.push(block);
      return;
    }
    collected[existingIndex] = mergeTravelResultBlocks(existing, block);
  });

  return collected;
}

type TravelResultBlock = FlightResultsBlock | TrainResultsBlock;

function isTravelResultBlock(block: StructuredToolResultBlock): block is TravelResultBlock {
  return block.type === 'flight_results' || block.type === 'train_results';
}

function travelResultQueryKey(block: TravelResultBlock): string | null {
  const provider = canonicalTravelKeyPart(block.provider);
  const attribution = canonicalTravelKeyPart(block.attribution?.label);
  const origin = canonicalTravelKeyPart(block.origin);
  const destination = canonicalTravelKeyPart(block.destination);
  const departureDate = canonicalTravelKeyPart(block.departure_date);
  if (
    (!provider && !attribution)
    || !origin
    || !destination
    || !departureDate
  ) {
    return null;
  }
  return [
    block.type,
    provider,
    attribution,
    origin,
    destination,
    departureDate,
  ].join('\0');
}

function canonicalTravelKeyPart(value: string | null | undefined): string {
  return value?.trim().normalize('NFKC').toLocaleLowerCase('zh-CN') ?? '';
}

function dedupeTravelResultBlock(block: TravelResultBlock): TravelResultBlock {
  if (block.type === 'flight_results') {
    const flights = dedupeTravelOptions(block.flights ?? [], flightIdentity);
    return flights.length === (block.flights?.length ?? 0)
      ? block
      : { ...block, result_count: flights.length, flights };
  }
  const trains = dedupeTravelOptions(block.trains ?? [], trainIdentity);
  return trains.length === (block.trains?.length ?? 0)
    ? block
    : { ...block, result_count: trains.length, trains };
}

function mergeTravelResultBlocks(
  existing: TravelResultBlock,
  incoming: TravelResultBlock,
): TravelResultBlock {
  const shared = {
    status: existing.status === 'degraded' || incoming.status === 'degraded'
      ? 'degraded' as const
      : existing.status ?? incoming.status,
    observed_at: latestObservedAt(existing.observed_at, incoming.observed_at),
    limitations: mergeUniqueStrings(existing.limitations, incoming.limitations, 8),
  };

  if (existing.type === 'flight_results' && incoming.type === 'flight_results') {
    const flights = dedupeTravelOptions(
      [...(existing.flights ?? []), ...(incoming.flights ?? [])],
      flightIdentity,
    );
    return { ...existing, ...shared, result_count: flights.length, flights };
  }
  if (existing.type === 'train_results' && incoming.type === 'train_results') {
    const trains = dedupeTravelOptions(
      [...(existing.trains ?? []), ...(incoming.trains ?? [])],
      trainIdentity,
    );
    return { ...existing, ...shared, result_count: trains.length, trains };
  }
  return existing;
}

function dedupeTravelOptions<T>(
  options: readonly T[],
  identity: (option: T) => string | null,
): T[] {
  const seen = new Set<string>();
  return options.filter(option => {
    const key = identity(option);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function flightIdentity(option: ProviderFlightResult): string | null {
  return travelOptionIdentity(
    option.flight_no,
    option.departure,
    option.arrival,
    option.cabin_class,
    option.option_id,
  );
}

function trainIdentity(option: ProviderTrainResult): string | null {
  return travelOptionIdentity(
    option.train_no,
    option.departure,
    option.arrival,
    option.seat_class,
    option.option_id,
  );
}

function travelOptionIdentity(
  number: string | null | undefined,
  departure: TravelEndpoint | null | undefined,
  arrival: TravelEndpoint | null | undefined,
  travelClass: string | null | undefined,
  optionId: string | null | undefined,
): string | null {
  const normalizedNumber = canonicalTravelKeyPart(number);
  const departureAt = canonicalInstant(departure?.scheduled_at);
  const arrivalAt = canonicalInstant(arrival?.scheduled_at);
  if (normalizedNumber && departureAt && arrivalAt) {
    return [
      'schedule',
      normalizedNumber,
      departureAt,
      arrivalAt,
      canonicalTravelKeyPart(travelClass),
    ].join('\0');
  }
  const normalizedOptionId = optionId?.trim();
  return normalizedOptionId
    ? ['option', normalizedOptionId, canonicalTravelKeyPart(travelClass)].join('\0')
    : null;
}

function canonicalInstant(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) return '';
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : normalized;
}

function latestObservedAt(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null | undefined {
  const existingTime = Date.parse(existing ?? '');
  const incomingTime = Date.parse(incoming ?? '');
  if (!Number.isFinite(incomingTime)) return existing;
  if (!Number.isFinite(existingTime) || incomingTime > existingTime) return incoming;
  return existing;
}

function mergeUniqueStrings(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined,
  limit: number,
): string[] {
  const seen = new Set<string>();
  return [...(existing ?? []), ...(incoming ?? [])].filter(item => {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized) || seen.size >= limit) return false;
    seen.add(normalized);
    return true;
  });
}

export function hasUsableStructuredToolResult(blocks: readonly ContentBlock[]): boolean {
  return collectStructuredToolResultBlocks(blocks).some(block => {
    if (block.type === 'place_results') return (block.places?.length ?? 0) > 0;
    if (block.type === 'route_results') return (block.routes?.length ?? 0) > 0;
    if (block.type === 'flight_results') return (block.flights?.length ?? 0) > 0;
    if (block.type === 'train_results') return (block.trains?.length ?? 0) > 0;
    if (block.type === 'weather_results') return block.forecast_days.length > 0;
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

  if (source.type === 'flight_results') {
    const block: FlightResultsBlock = {
      type: 'flight_results',
      id,
      schema_version: 1,
      ...normalizeTravelResultBase(source),
      flights: normalizeArray(source.flights, normalizeFlight, 5),
    };
    return block;
  }

  if (source.type === 'train_results') {
    const block: TrainResultsBlock = {
      type: 'train_results',
      id,
      schema_version: 1,
      ...normalizeTravelResultBase(source),
      trains: normalizeArray(source.trains, normalizeTrain, 5),
    };
    return block;
  }

  if (source.type === 'weather_results') {
    return normalizeWeatherResultBlock(source, id);
  }

  return null;
}

function normalizeTravelResultBase(source: Record<string, unknown>) {
  return {
    ...optionalField('provider', boundedString(source.provider, 40)),
    ...optionalField(
      'attribution',
      normalizeAttribution(source.attribution) ?? normalizeTravelAttribution(source.provider),
    ),
    ...optionalField('status', productResultStatus(source.status)),
    ...optionalField('origin', boundedString(source.origin, 80)),
    ...optionalField('destination', boundedString(source.destination, 80)),
    ...optionalField('departure_date', boundedString(source.departure_date, 10)),
    ...optionalField('observed_at', boundedString(source.observed_at, 48)),
    ...optionalField('result_count', nonNegativeNumber(source.result_count)),
    limitations: normalizeBoundedStringArray(source.limitations, 8, 240),
    ...optionalField('tool_call_log_id', boundedString(source.tool_call_log_id, 160)),
  };
}

function normalizeWeatherResultBlock(
  source: Record<string, unknown>,
  id: string,
): WeatherResultsBlock | null {
  if (source.provider !== 'amap') return null;
  const status = productResultStatus(source.status);
  const query = boundedString(source.query, 120);
  const resolvedLocation = boundedString(source.resolved_location, 120);
  const dayCount = integerInRange(source.day_count, 1, 4);
  const fetchedAt = boundedString(source.fetched_at, 48);
  if (
    !status
    || !query
    || !resolvedLocation
    || dayCount === undefined
    || !fetchedAt
    || !isZonedIsoDateTime(fetchedAt)
    || !Array.isArray(source.forecast_days)
    || source.forecast_days.length !== dayCount
    || source.forecast_days.length > 4
    || status !== (dayCount === 4 ? 'success' : 'degraded')
  ) {
    return null;
  }

  const normalizedDays = source.forecast_days.map(normalizeForecastDay);
  if (normalizedDays.some(day => day === null)) return null;
  const forecastDays = normalizedDays as ForecastDay[];
  if (forecastDays.some((day, index) => index > 0 && day.date <= forecastDays[index - 1].date)) {
    return null;
  }

  return {
    type: 'weather_results',
    id,
    schema_version: 1,
    provider: 'amap',
    attribution: normalizeAttribution(source.attribution)
      ?? normalizeLegacyAttribution(source.provider),
    status,
    query,
    resolved_location: resolvedLocation,
    day_count: dayCount as WeatherResultsBlock['day_count'],
    forecast_days: forecastDays,
    fetched_at: fetchedAt,
    limitations: normalizeBoundedStringArray(source.limitations, 8, 240),
    ...optionalField('tool_call_log_id', boundedString(source.tool_call_log_id, 160)),
  };
}

function normalizeForecastDay(value: unknown): ForecastDay | null {
  const source = asRecord(value);
  if (!source) return null;
  const date = boundedString(source.date, 10);
  const weekday = integerInRange(source.weekday, 1, 7);
  const dayWeather = boundedString(source.day_weather, 80);
  const nightWeather = boundedString(source.night_weather, 80);
  const highC = finiteNumberInRange(source.high_c, -100, 100);
  const lowC = finiteNumberInRange(source.low_c, -100, 100);
  const dayWindDirection = boundedString(source.day_wind_direction, 40);
  const nightWindDirection = boundedString(source.night_wind_direction, 40);
  const dayWindPower = boundedString(source.day_wind_power, 40);
  const nightWindPower = boundedString(source.night_wind_power, 40);
  const expectedWeekday = date ? isoWeekday(date) : undefined;
  if (
    !date
    || expectedWeekday === undefined
    || weekday === undefined
    || weekday !== expectedWeekday
    || !dayWeather
    || !nightWeather
    || highC === undefined
    || lowC === undefined
    || highC < lowC
    || hasInvalidOptionalString(source.day_wind_direction, dayWindDirection)
    || hasInvalidOptionalString(source.night_wind_direction, nightWindDirection)
    || hasInvalidOptionalString(source.day_wind_power, dayWindPower)
    || hasInvalidOptionalString(source.night_wind_power, nightWindPower)
  ) {
    return null;
  }

  return {
    date,
    weekday: weekday as ForecastDay['weekday'],
    day_weather: dayWeather,
    night_weather: nightWeather,
    high_c: highC,
    low_c: lowC,
    ...optionalField('day_wind_direction', dayWindDirection),
    ...optionalField('night_wind_direction', nightWindDirection),
    ...optionalField('day_wind_power', dayWindPower),
    ...optionalField('night_wind_power', nightWindPower),
  };
}

function normalizeFlight(value: unknown): ProviderFlightResult | null {
  const source = asRecord(value);
  if (!source) return null;
  return {
    ...optionalField('option_id', boundedString(source.option_id, 80)),
    ...optionalField('airline_name', boundedString(source.airline_name, 100)),
    ...optionalField('flight_no', boundedString(source.flight_no, 40)),
    ...optionalField('departure', normalizeTravelEndpoint(source.departure)),
    ...optionalField('arrival', normalizeTravelEndpoint(source.arrival)),
    ...optionalField('duration_s', nonNegativeNumber(source.duration_s)),
    ...optionalField('cabin_class', boundedString(source.cabin_class, 80)),
    ...optionalField('stops', directStops(source.stops)),
    ...optionalField('price', normalizeMoney(source.price)),
    actions: normalizeArray(source.actions, normalizeExternalAction, 1),
  };
}

function normalizeTrain(value: unknown): ProviderTrainResult | null {
  const source = asRecord(value);
  if (!source) return null;
  return {
    ...optionalField('option_id', boundedString(source.option_id, 80)),
    ...optionalField('train_no', boundedString(source.train_no, 40)),
    ...optionalField('train_type', boundedString(source.train_type, 100)),
    ...optionalField('departure', normalizeTravelEndpoint(source.departure)),
    ...optionalField('arrival', normalizeTravelEndpoint(source.arrival)),
    ...optionalField('duration_s', nonNegativeNumber(source.duration_s)),
    ...optionalField('seat_class', boundedString(source.seat_class, 80)),
    ...optionalField('stops', directStops(source.stops)),
    ...optionalField('price', normalizeMoney(source.price)),
    actions: normalizeArray(source.actions, normalizeExternalAction, 1),
  };
}

function normalizeTravelEndpoint(value: unknown): TravelEndpoint | undefined {
  const source = asRecord(value);
  if (!source) return undefined;
  const endpoint: TravelEndpoint = {
    ...optionalField('city', boundedString(source.city, 80)),
    ...optionalField('station_name', boundedString(source.station_name, 120)),
    ...optionalField('station_code', boundedString(source.station_code, 16)),
    ...optionalField('terminal', boundedString(source.terminal, 32)),
    ...optionalField('scheduled_at', boundedString(source.scheduled_at, 48)),
  };
  return Object.keys(endpoint).length > 0 ? endpoint : undefined;
}

function normalizeMoney(value: unknown): TravelMoney | undefined {
  const source = asRecord(value);
  if (!source || source.currency !== 'CNY') return undefined;
  const amountMinor = nonNegativeInteger(source.amount_minor, 100_000_000);
  return amountMinor === undefined ? undefined : { currency: 'CNY', amount_minor: amountMinor };
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

function normalizeTravelAttribution(value: unknown): StructuredResultAttribution | undefined {
  const provider = optionalString(value)?.toLowerCase();
  if (!provider) return undefined;
  return provider === 'flyai' ? { label: '飞猪旅行' } : { label: '出行服务' };
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

function normalizeBoundedStringArray(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, limit)
    .map(item => boundedString(item, maxLength))
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

function hasInvalidOptionalString(
  rawValue: unknown,
  normalizedValue: string | undefined,
): boolean {
  return rawValue !== undefined && rawValue !== null && normalizedValue === undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function nonNegativeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number | undefined {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= maximum
    ? Number(value)
    : undefined;
}

function integerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : undefined;
}

function finiteNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
    ? value
    : undefined;
}

function isoWeekday(value: string): ForecastDay['weekday'] | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return undefined;
  }
  const weekday = date.getUTCDay();
  return (weekday === 0 ? 7 : weekday) as ForecastDay['weekday'];
}

function isZonedIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function directStops(value: unknown): 0 | undefined {
  return value === 0 ? 0 : undefined;
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
