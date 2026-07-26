import { describe, expect, it } from 'vitest';

import type {
  ContentBlock,
  FlightResultsBlock,
  ItineraryResultsBlock,
  TrainResultsBlock,
  WeatherResultsBlock,
} from '@/types/conversation';

import { deriveItineraryResultPresentation } from './itineraryResultPresentation';

function flightBlock(
  id: string,
  optionId: string,
  departureDate = '2026-08-01',
): FlightResultsBlock {
  return {
    type: 'flight_results',
    id,
    schema_version: 1,
    provider: 'flyai',
    attribution: { label: '飞猪旅行' },
    status: 'success',
    origin: departureDate === '2026-08-01' ? '深圳' : '上海',
    destination: departureDate === '2026-08-01' ? '上海' : '深圳',
    departure_date: departureDate,
    observed_at: '2026-07-26T09:00:00+08:00',
    result_count: 1,
    flights: [{
      option_id: optionId,
      flight_no: optionId === 'flight-outbound' ? 'CZ1234' : 'CZ5678',
      departure: {
        city: departureDate === '2026-08-01' ? '深圳' : '上海',
        station_name: departureDate === '2026-08-01' ? '深圳宝安国际机场' : '上海虹桥国际机场',
        scheduled_at: `${departureDate}T08:00:00+08:00`,
      },
      arrival: {
        city: departureDate === '2026-08-01' ? '上海' : '深圳',
        station_name: departureDate === '2026-08-01' ? '上海虹桥国际机场' : '深圳宝安国际机场',
        scheduled_at: `${departureDate}T10:20:00+08:00`,
      },
      duration_s: 8_400,
      stops: 0,
      price: { currency: 'CNY', amount_minor: 58_000 },
      actions: [],
    }],
    limitations: [],
  };
}

function trainBlock(id: string, optionId: string): TrainResultsBlock {
  return {
    type: 'train_results',
    id,
    schema_version: 1,
    provider: 'flyai',
    attribution: { label: '飞猪旅行' },
    status: 'success',
    origin: '深圳',
    destination: '上海',
    departure_date: '2026-08-01',
    observed_at: '2026-07-26T09:05:00+08:00',
    result_count: 1,
    trains: [{
      option_id: optionId,
      train_no: optionId.includes('later') ? 'G101' : 'G100',
      departure: {
        city: '深圳',
        station_name: '深圳北站',
        scheduled_at: '2026-08-01T08:00:00+08:00',
      },
      arrival: {
        city: '上海',
        station_name: '上海虹桥站',
        scheduled_at: '2026-08-01T15:00:00+08:00',
      },
      duration_s: 25_200,
      stops: 0,
      price: { currency: 'CNY', amount_minor: 49_800 },
      actions: [],
    }],
    limitations: [],
  };
}

function weatherBlock(id: string, fetchedAt: string, weather: string): WeatherResultsBlock {
  return {
    type: 'weather_results',
    id,
    schema_version: 1,
    provider: 'amap',
    attribution: { label: '高德地图' },
    status: 'degraded',
    query: '上海',
    resolved_location: '上海市',
    day_count: 1,
    forecast_days: [{
      date: '2026-08-01',
      weekday: 6,
      day_weather: weather,
      night_weather: weather,
      high_c: 32,
      low_c: 27,
    }],
    fetched_at: fetchedAt,
    limitations: [],
  };
}

function itineraryBlock(
  overrides: Partial<ItineraryResultsBlock> = {},
): ItineraryResultsBlock {
  return {
    type: 'itinerary_results',
    id: 'itinerary-1',
    schema_version: 1,
    provider: 'fusion',
    status: 'success',
    trip_type: 'round_trip',
    origin: '深圳',
    destination: '上海',
    start_date: '2026-08-01',
    end_date: '2026-08-03',
    recommended_plan_id: null,
    plans: [{
      id: 'lowest-price',
      title: '最低参考价组合',
      status: 'complete',
      strategy: 'lowest_reference_price',
      tags: ['lowest_reference_price'],
      known_cost: { currency: 'CNY', amount_minor: 116_000 },
      known_duration_s: 16_800,
      sections: [
        {
          id: 'outbound',
          kind: 'outbound_transport',
          status: 'complete',
          title: '去程',
          coverage: null,
          result_refs: [{ block_id: 'flight-outbound-block', item_ids: ['flight-outbound'] }],
        },
        {
          id: 'return',
          kind: 'return_transport',
          status: 'complete',
          title: '返程',
          coverage: null,
          result_refs: [{ block_id: 'flight-return-block', item_ids: ['flight-return'] }],
        },
        {
          id: 'weather',
          kind: 'destination_weather',
          status: 'complete',
          title: '目的地天气',
          coverage: 'full',
          result_refs: [
            { block_id: 'weather-old', item_ids: [] },
            { block_id: 'weather-new', item_ids: [] },
          ],
        },
      ],
    }],
    availability: [
      { journey: 'outbound', mode: 'flight', status: 'available' },
      { journey: 'return', mode: 'flight', status: 'available' },
      { journey: 'destination_weather', mode: 'weather', status: 'available' },
    ],
    limitations: ['参考票价不等于完整旅行总预算'],
    ...overrides,
  };
}

describe('deriveItineraryResultPresentation', () => {
  it('先按原始 block id 解析引用，再在 section 内过滤候选并合并重复天气', () => {
    const outbound = flightBlock('flight-outbound-block', 'flight-outbound');
    const returnFlight = flightBlock('flight-return-block', 'flight-return', '2026-08-03');
    const oldWeather = weatherBlock('weather-old', '2026-07-26T08:00:00+08:00', '多云');
    const newWeather = weatherBlock('weather-new', '2026-07-26T10:00:00+08:00', '阵雨');

    const presentation = deriveItineraryResultPresentation([
      outbound,
      returnFlight,
      oldWeather,
      newWeather,
      itineraryBlock(),
    ]);

    expect(presentation.items).toHaveLength(1);
    const item = presentation.items[0];
    expect(item.kind).toBe('itinerary');
    if (item.kind !== 'itinerary') throw new Error('应生成统一行程展示');
    expect(item.consumedBlockIds).toEqual([
      'flight-outbound-block',
      'flight-return-block',
      'weather-old',
      'weather-new',
    ]);
    expect(item.plans[0].sections[0].blocks).toEqual([
      expect.objectContaining({
        type: 'flight_results',
        flights: [expect.objectContaining({ option_id: 'flight-outbound' })],
      }),
    ]);
    expect(item.plans[0].sections[2].blocks).toEqual([
      expect.objectContaining({
        id: 'weather-new',
        type: 'weather_results',
        forecast_days: [expect.objectContaining({ day_weather: '阵雨' })],
      }),
    ]);
    expect(item.attributions).toEqual(['飞猪旅行', '高德地图']);
  });

  it('同一 section 引用多个同查询旅行块时保留原始引用并复用现有合并去重', () => {
    const first = trainBlock('train-first', 'train-first-option');
    const later = trainBlock('train-later', 'train-later-option');
    const itinerary = itineraryBlock({
      trip_type: 'one_way',
      end_date: null,
      plans: [{
        id: 'shortest',
        title: '班次耗时最短组合',
        status: 'complete',
        strategy: 'shortest_scheduled_duration',
        tags: ['shortest_scheduled_duration'],
        known_cost: { currency: 'CNY', amount_minor: 49_800 },
        known_duration_s: 25_200,
        sections: [{
          id: 'outbound',
          kind: 'outbound_transport',
          status: 'complete',
          title: '去程',
          coverage: null,
          result_refs: [
            { block_id: 'train-first', item_ids: ['train-first-option'] },
            { block_id: 'train-later', item_ids: ['train-later-option'] },
          ],
        }],
      }],
    });

    const presentation = deriveItineraryResultPresentation([first, later, itinerary]);
    const item = presentation.items[0];
    if (item.kind !== 'itinerary') throw new Error('应生成统一行程展示');
    expect(item.plans[0].sections[0].blocks).toEqual([
      expect.objectContaining({
        id: 'train-first',
        result_count: 2,
        trains: [
          expect.objectContaining({ option_id: 'train-first-option' }),
          expect.objectContaining({ option_id: 'train-later-option' }),
        ],
      }),
    ]);
    expect(item.consumedBlockIds).toEqual(['train-first', 'train-later']);
  });

  it('坏引用或不存在的候选使 itinerary 安全降级且绝不隐藏源卡', () => {
    const source = flightBlock('flight-outbound-block', 'flight-outbound');
    const invalidItinerary = itineraryBlock({
      plans: [{
        ...itineraryBlock().plans[0],
        sections: [{
          id: 'outbound',
          kind: 'outbound_transport',
          status: 'complete',
          title: '去程',
          coverage: null,
          result_refs: [{
            block_id: 'flight-outbound-block',
            item_ids: ['missing-option'],
          }],
        }],
      }],
    });

    const presentation = deriveItineraryResultPresentation([source, invalidItinerary]);

    expect(presentation.items).toEqual([
      {
        kind: 'standalone',
        block: source,
      },
      {
        kind: 'standalone',
        block: {
          type: 'unsupported_result',
          id: 'itinerary-1',
          source_type: 'itinerary_results',
          source_schema_version: 1,
          reason: 'invalid_payload',
        },
      },
    ]);
  });

  it('源候选 option_id 重复时拒绝引用，不能借数组长度掩盖 missing id', () => {
    const source = flightBlock('flight-outbound-block', 'flight-outbound');
    const duplicatedSource: FlightResultsBlock = {
      ...source,
      result_count: 2,
      flights: [
        ...(source.flights ?? []),
        { ...(source.flights ?? [])[0] },
      ],
    };
    const invalidItinerary = itineraryBlock({
      plans: [{
        ...itineraryBlock().plans[0],
        sections: [{
          id: 'outbound',
          kind: 'outbound_transport',
          status: 'complete',
          title: '去程',
          coverage: null,
          result_refs: [{
            block_id: 'flight-outbound-block',
            item_ids: ['flight-outbound', 'missing-option'],
          }],
        }],
      }],
    });

    const presentation = deriveItineraryResultPresentation([
      duplicatedSource,
      invalidItinerary,
    ]);

    expect(presentation.items).toEqual([
      {
        kind: 'standalone',
        block: expect.objectContaining({
          id: 'flight-outbound-block',
          type: 'flight_results',
          result_count: 1,
        }),
      },
      {
        kind: 'standalone',
        block: {
          type: 'unsupported_result',
          id: 'itinerary-1',
          source_type: 'itinerary_results',
          source_schema_version: 1,
          reason: 'invalid_payload',
        },
      },
    ]);
  });

  it('只隐藏被成功消费的引用块，未引用结果继续走既有顶层旅行合并', () => {
    const referenced = flightBlock('flight-outbound-block', 'flight-outbound');
    const standaloneFirst = trainBlock('train-first', 'train-first-option');
    const standaloneLater = trainBlock('train-later', 'train-later-option');
    const itinerary = itineraryBlock({
      trip_type: 'one_way',
      end_date: null,
      plans: [{
        ...itineraryBlock().plans[0],
        sections: [{
          id: 'outbound',
          kind: 'outbound_transport',
          status: 'complete',
          title: '去程',
          coverage: null,
          result_refs: [{ block_id: 'flight-outbound-block', item_ids: ['flight-outbound'] }],
        }],
      }],
    });

    const presentation = deriveItineraryResultPresentation([
      referenced,
      standaloneFirst,
      standaloneLater,
      itinerary,
    ]);

    expect(presentation.items).toEqual([
      expect.objectContaining({ kind: 'itinerary' }),
      {
        kind: 'standalone',
        block: expect.objectContaining({
          id: 'train-first',
          type: 'train_results',
          result_count: 2,
        }),
      },
    ]);
  });

  it('未知 itinerary 版本不会消费任何源块', () => {
    const source = flightBlock('flight-outbound-block', 'flight-outbound');
    const future = {
      type: 'unsupported_result',
      id: 'itinerary-future',
      source_type: 'itinerary_results',
      source_schema_version: 2,
      reason: 'unsupported_version',
    } as const;

    const blocks: ContentBlock[] = [source, future];
    expect(deriveItineraryResultPresentation(blocks).items).toEqual([
      { kind: 'standalone', block: source },
      { kind: 'standalone', block: future },
    ]);
  });
});
