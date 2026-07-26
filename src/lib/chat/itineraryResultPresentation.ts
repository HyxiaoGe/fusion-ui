import type {
  ContentBlock,
  FlightResultsBlock,
  ItineraryPlan,
  ItineraryResultsBlock,
  ItinerarySection,
  StructuredToolResultBlock,
  TrainResultsBlock,
  UnsupportedResultBlock,
  WeatherResultsBlock,
} from '@/types/conversation';

import {
  collectStructuredToolResultBlocks,
  isStructuredToolResultBlock,
} from './structuredToolResults';

export interface ItinerarySectionPresentation extends ItinerarySection {
  blocks: ItinerarySourceBlock[];
}

export interface ItineraryPlanPresentation extends ItineraryPlan {
  sections: ItinerarySectionPresentation[];
}

export interface ItineraryPresentationItem {
  kind: 'itinerary';
  block: ItineraryResultsBlock;
  plans: ItineraryPlanPresentation[];
  consumedBlockIds: string[];
  attributions: string[];
}

export interface StandaloneStructuredResultItem {
  kind: 'standalone';
  block: ItinerarySourceBlock;
}

export type ItinerarySourceBlock = Exclude<
  StructuredToolResultBlock,
  ItineraryResultsBlock
>;

export interface ItineraryResultPresentation {
  items: Array<ItineraryPresentationItem | StandaloneStructuredResultItem>;
}

export function deriveItineraryResultPresentation(
  blocks: readonly ContentBlock[],
): ItineraryResultPresentation {
  const structuredBlocks = blocks.filter(isStructuredToolResultBlock);
  const sourceBlocksById = new Map<string, StructuredToolResultBlock>();
  const duplicateSourceIds = new Set<string>();
  for (const block of structuredBlocks) {
    if (sourceBlocksById.has(block.id)) duplicateSourceIds.add(block.id);
    sourceBlocksById.set(block.id, block);
  }

  const itineraryItems: ItineraryPresentationItem[] = [];
  const rejectedItineraries: UnsupportedResultBlock[] = [];
  const consumedBlockIds = new Set<string>();

  for (const block of structuredBlocks) {
    if (block.type !== 'itinerary_results') continue;
    const item = resolveItinerary(block, sourceBlocksById, duplicateSourceIds);
    if (!item) {
      rejectedItineraries.push(invalidItinerary(block));
      continue;
    }
    itineraryItems.push(item);
    item.consumedBlockIds.forEach(id => consumedBlockIds.add(id));
  }

  const standaloneSources = collectStructuredToolResultBlocks(
    structuredBlocks.filter(block =>
      block.type !== 'itinerary_results'
      && !consumedBlockIds.has(block.id)),
  ).filter((block): block is ItinerarySourceBlock => block.type !== 'itinerary_results')
    .map(block => ({ kind: 'standalone' as const, block }));

  return {
    items: [
      ...itineraryItems,
      ...standaloneSources,
      ...rejectedItineraries.map(block => ({ kind: 'standalone' as const, block })),
    ],
  };
}

function resolveItinerary(
  block: ItineraryResultsBlock,
  sourceBlocksById: Map<string, StructuredToolResultBlock>,
  duplicateSourceIds: Set<string>,
): ItineraryPresentationItem | null {
  const consumedBlockIds: string[] = [];
  const consumedSet = new Set<string>();
  const attributions: string[] = [];
  const attributionSet = new Set<string>();
  const plans: ItineraryPlanPresentation[] = [];

  for (const plan of block.plans) {
    const sections: ItinerarySectionPresentation[] = [];
    for (const section of plan.sections) {
      const resolved = resolveSection(section, sourceBlocksById, duplicateSourceIds);
      if (!resolved) return null;
      sections.push({ ...section, blocks: resolved });
      for (const source of resolved) {
        const sourceIds = section.result_refs.map(ref => ref.block_id);
        for (const sourceId of sourceIds) {
          if (!consumedSet.has(sourceId)) {
            consumedSet.add(sourceId);
            consumedBlockIds.push(sourceId);
          }
        }
        const label = source.type === 'unsupported_result'
          ? null
          : source.attribution?.label?.trim();
        if (label && !attributionSet.has(label)) {
          attributionSet.add(label);
          attributions.push(label);
        }
      }
    }
    plans.push({ ...plan, sections });
  }

  return {
    kind: 'itinerary',
    block,
    plans,
    consumedBlockIds,
    attributions,
  };
}

function resolveSection(
  section: ItinerarySection,
  sourceBlocksById: Map<string, StructuredToolResultBlock>,
  duplicateSourceIds: Set<string>,
): ItinerarySourceBlock[] | null {
  const resolved: ItinerarySourceBlock[] = [];
  for (const ref of section.result_refs) {
    if (duplicateSourceIds.has(ref.block_id)) return null;
    const source = sourceBlocksById.get(ref.block_id);
    if (!source || !matchesSectionType(section, source)) return null;
    const selected = selectReferencedItems(source, ref.item_ids);
    if (!selected) return null;
    resolved.push(selected);
  }
  if (section.kind === 'destination_weather') {
    const latest = latestWeather(resolved);
    return latest ? [latest] : null;
  }
  if (section.kind === 'outbound_transport' || section.kind === 'return_transport') {
    return collectStructuredToolResultBlocks(resolved).filter(
      (block): block is ItinerarySourceBlock => block.type !== 'itinerary_results',
    );
  }
  return resolved;
}

function matchesSectionType(
  section: ItinerarySection,
  source: StructuredToolResultBlock,
): source is ItinerarySourceBlock {
  if (section.kind === 'outbound_transport' || section.kind === 'return_transport') {
    return source.type === 'flight_results' || source.type === 'train_results';
  }
  if (section.kind === 'destination_weather') return source.type === 'weather_results';
  if (section.kind === 'local_route') return source.type === 'route_results';
  return false;
}

function selectReferencedItems(
  source: ItinerarySourceBlock,
  itemIds: string[],
): ItinerarySourceBlock | null {
  if (source.type === 'flight_results') {
    return selectFlightItems(source, itemIds);
  }
  if (source.type === 'train_results') {
    return selectTrainItems(source, itemIds);
  }
  return itemIds.length === 0 ? source : null;
}

function selectFlightItems(
  source: FlightResultsBlock,
  itemIds: string[],
): FlightResultsBlock | null {
  if (itemIds.length === 0) return null;
  const optionsById = uniqueOptionsById(source.flights ?? []);
  if (!optionsById || itemIds.some(itemId => !optionsById.has(itemId))) return null;
  const flights = itemIds.map(itemId => optionsById.get(itemId)!);
  return { ...source, result_count: flights.length, flights };
}

function selectTrainItems(
  source: TrainResultsBlock,
  itemIds: string[],
): TrainResultsBlock | null {
  if (itemIds.length === 0) return null;
  const optionsById = uniqueOptionsById(source.trains ?? []);
  if (!optionsById || itemIds.some(itemId => !optionsById.has(itemId))) return null;
  const trains = itemIds.map(itemId => optionsById.get(itemId)!);
  return { ...source, result_count: trains.length, trains };
}

function uniqueOptionsById<T extends { option_id?: string | null }>(
  options: readonly T[],
): Map<string, T> | null {
  const indexed = new Map<string, T>();
  for (const option of options) {
    const optionId = option.option_id?.trim();
    if (!optionId || indexed.has(optionId)) return null;
    indexed.set(optionId, option);
  }
  return indexed;
}

function latestWeather(
  blocks: ItinerarySourceBlock[],
): WeatherResultsBlock | null {
  const weatherBlocks = blocks.filter(
    (item): item is WeatherResultsBlock => item.type === 'weather_results',
  );
  if (weatherBlocks.length === 0) return null;
  return weatherBlocks.reduce((latest, current) =>
    Date.parse(current.fetched_at) >= Date.parse(latest.fetched_at) ? current : latest);
}

function invalidItinerary(block: ItineraryResultsBlock): UnsupportedResultBlock {
  return {
    type: 'unsupported_result',
    id: block.id,
    source_type: 'itinerary_results',
    source_schema_version: block.schema_version,
    reason: 'invalid_payload',
  };
}
