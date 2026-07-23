import { describe, expect, it } from 'vitest';
import type { FlightResultsBlock, TrainResultsBlock } from '@/types/conversation';
import {
  collectStructuredToolResultBlocks,
  normalizeStructuredToolResultBlock,
} from './structuredToolResults';

function trainResultBlock({
  id,
  origin = '深圳北',
  destination = '广州南',
  departureDate = '2026-08-01',
  provider = 'flyai',
  attribution = { label: '飞猪旅行' },
  trains,
}: {
  id: string;
  origin?: string;
  destination?: string;
  departureDate?: string;
  provider?: string | null;
  attribution?: TrainResultsBlock['attribution'];
  trains: TrainResultsBlock['trains'];
}): TrainResultsBlock {
  return {
    type: 'train_results',
    id,
    schema_version: 1,
    provider,
    attribution,
    status: 'success',
    origin,
    destination,
    departure_date: departureDate,
    observed_at: '2026-07-22T15:00:00+08:00',
    result_count: trains?.length ?? 0,
    trains,
    limitations: [],
  };
}

function trainOption(
  optionId: string,
  trainNo: string,
  departureAt: string,
  arrivalAt: string,
  seatClass?: string,
): NonNullable<TrainResultsBlock['trains']>[number] {
  return {
    option_id: optionId,
    train_no: trainNo,
    departure: { city: '深圳', station_name: '深圳北站', scheduled_at: departureAt },
    arrival: { city: '广州', station_name: '广州南站', scheduled_at: arrivalAt },
    duration_s: 1_920,
    seat_class: seatClass,
    stops: 0,
    actions: [],
  };
}

describe('normalizeStructuredToolResultBlock', () => {
  it('同一回答内按出行查询维度合并班次，并按稳定班次身份去重且保留首次顺序', () => {
    const first = trainResultBlock({
      id: 'trains-morning',
      trains: [
        trainOption('opt-g100', 'G100', '2026-08-01T08:00:00+08:00', '2026-08-01T08:32:00+08:00'),
        trainOption('opt-g2902-a', 'G2902', '2026-08-01T09:00:00+08:00', '2026-08-01T09:35:00+08:00'),
      ],
    });
    const later = trainResultBlock({
      id: 'trains-later',
      trains: [
        trainOption('opt-g2902-b', 'G2902', '2026-08-01T01:00:00Z', '2026-08-01T01:35:00Z'),
        trainOption('opt-g6012', 'G6012', '2026-08-01T10:00:00+08:00', '2026-08-01T10:40:00+08:00'),
      ],
    });

    const collected = collectStructuredToolResultBlocks([first, later]);

    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({
      id: 'trains-morning',
      type: 'train_results',
      result_count: 3,
      trains: [
        expect.objectContaining({ train_no: 'G100' }),
        expect.objectContaining({ train_no: 'G2902', option_id: 'opt-g2902-a' }),
        expect.objectContaining({ train_no: 'G6012' }),
      ],
    });
  });

  it('航班结果使用同一查询与班次身份规则合并去重', () => {
    const common = {
      type: 'flight_results' as const,
      schema_version: 1 as const,
      provider: 'flyai',
      status: 'success' as const,
      origin: '深圳',
      destination: '上海',
      departure_date: '2026-08-01',
      observed_at: '2026-07-22T15:00:00+08:00',
      limitations: [],
    };
    const cz1234 = {
      option_id: 'flight-cz-a',
      flight_no: 'CZ1234',
      departure: { city: '深圳', station_name: '深圳宝安国际机场', scheduled_at: '2026-08-01T08:30:00+08:00' },
      arrival: { city: '上海', station_name: '上海虹桥国际机场', scheduled_at: '2026-08-01T10:45:00+08:00' },
      duration_s: 8_100,
      stops: 0 as const,
      actions: [],
    };
    const first: FlightResultsBlock = {
      ...common,
      id: 'flights-first',
      result_count: 1,
      flights: [cz1234],
    };
    const later: FlightResultsBlock = {
      ...common,
      id: 'flights-later',
      result_count: 2,
      flights: [
        {
          ...cz1234,
          option_id: 'flight-cz-b',
          departure: { ...cz1234.departure, scheduled_at: '2026-08-01T00:30:00Z' },
          arrival: { ...cz1234.arrival, scheduled_at: '2026-08-01T02:45:00Z' },
        },
        {
          ...cz1234,
          option_id: 'flight-mu',
          flight_no: 'MU5678',
          departure: { ...cz1234.departure, scheduled_at: '2026-08-01T12:00:00+08:00' },
          arrival: { ...cz1234.arrival, scheduled_at: '2026-08-01T14:30:00+08:00' },
        },
      ],
    };

    expect(collectStructuredToolResultBlocks([first, later])).toEqual([
      expect.objectContaining({
        id: 'flights-first',
        result_count: 2,
        flights: [
          expect.objectContaining({ flight_no: 'CZ1234', option_id: 'flight-cz-a' }),
          expect.objectContaining({ flight_no: 'MU5678' }),
        ],
      }),
    ]);
  });

  it('不同供应商或归属标识的同路线结果保持隔离，归属完全未知时保守不合并', () => {
    const sharedTrain = trainOption(
      'opt-g100',
      'G100',
      '2026-08-01T08:00:00+08:00',
      '2026-08-01T08:32:00+08:00',
    );
    const blocks = [
      trainResultBlock({ id: 'flyai', trains: [sharedTrain] }),
      trainResultBlock({
        id: 'other-provider',
        provider: 'other-provider',
        trains: [sharedTrain],
      }),
      trainResultBlock({
        id: 'other-attribution',
        attribution: { label: '其他旅行服务' },
        trains: [sharedTrain],
      }),
      trainResultBlock({
        id: 'unknown-source-a',
        provider: null,
        attribution: null,
        trains: [sharedTrain],
      }),
      trainResultBlock({
        id: 'unknown-source-b',
        provider: null,
        attribution: null,
        trains: [sharedTrain],
      }),
    ];

    expect(collectStructuredToolResultBlocks(blocks).map(block => block.id)).toEqual([
      'flyai',
      'other-provider',
      'other-attribution',
      'unknown-source-a',
      'unknown-source-b',
    ]);
  });

  it('同一车次不折叠不同席别，同一航班不折叠不同舱等', () => {
    const trainFirst = trainResultBlock({
      id: 'train-seat-first',
      trains: [
        trainOption(
          'train-second-class',
          'G100',
          '2026-08-01T08:00:00+08:00',
          '2026-08-01T08:32:00+08:00',
          '二等座',
        ),
      ],
    });
    const trainLater = trainResultBlock({
      id: 'train-seat-later',
      trains: [
        trainOption(
          'train-business-class',
          'G100',
          '2026-08-01T08:00:00+08:00',
          '2026-08-01T08:32:00+08:00',
          '商务座',
        ),
      ],
    });
    const flightCommon = {
      type: 'flight_results' as const,
      schema_version: 1 as const,
      provider: 'flyai',
      attribution: { label: '飞猪旅行' },
      status: 'success' as const,
      origin: '深圳',
      destination: '上海',
      departure_date: '2026-08-01',
      observed_at: '2026-07-22T15:00:00+08:00',
      limitations: [],
    };
    const flightOption = {
      flight_no: 'CZ1234',
      departure: {
        city: '深圳',
        station_name: '深圳宝安国际机场',
        scheduled_at: '2026-08-01T08:30:00+08:00',
      },
      arrival: {
        city: '上海',
        station_name: '上海虹桥国际机场',
        scheduled_at: '2026-08-01T10:45:00+08:00',
      },
      duration_s: 8_100,
      stops: 0 as const,
      actions: [],
    };
    const flightFirst: FlightResultsBlock = {
      ...flightCommon,
      id: 'flight-cabin-first',
      result_count: 1,
      flights: [{ ...flightOption, option_id: 'flight-economy', cabin_class: '经济舱' }],
    };
    const flightLater: FlightResultsBlock = {
      ...flightCommon,
      id: 'flight-cabin-later',
      result_count: 1,
      flights: [{ ...flightOption, option_id: 'flight-business', cabin_class: '商务舱' }],
    };

    const trainCollected = collectStructuredToolResultBlocks([trainFirst, trainLater]);
    const flightCollected = collectStructuredToolResultBlocks([flightFirst, flightLater]);

    expect(trainCollected).toHaveLength(1);
    expect(trainCollected[0]).toMatchObject({
      result_count: 2,
      trains: [
        expect.objectContaining({ seat_class: '二等座' }),
        expect.objectContaining({ seat_class: '商务座' }),
      ],
    });
    expect(flightCollected).toHaveLength(1);
    expect(flightCollected[0]).toMatchObject({
      result_count: 2,
      flights: [
        expect.objectContaining({ cabin_class: '经济舱' }),
        expect.objectContaining({ cabin_class: '商务舱' }),
      ],
    });
  });

  it('班次时刻不完整时，option_id 回退身份仍保留舱等和席别', () => {
    const trainFirst = trainResultBlock({
      id: 'train-fallback-first',
      trains: [{ option_id: 'shared-train', train_no: 'G100', seat_class: '二等座' }],
    });
    const trainLater = trainResultBlock({
      id: 'train-fallback-later',
      trains: [{ option_id: 'shared-train', train_no: 'G100', seat_class: '商务座' }],
    });
    const flightCommon = {
      type: 'flight_results' as const,
      schema_version: 1 as const,
      provider: 'flyai',
      attribution: { label: '飞猪旅行' },
      status: 'success' as const,
      origin: '深圳',
      destination: '上海',
      departure_date: '2026-08-01',
      observed_at: '2026-07-22T15:00:00+08:00',
      limitations: [],
    };
    const flightFirst: FlightResultsBlock = {
      ...flightCommon,
      id: 'flight-fallback-first',
      result_count: 1,
      flights: [{ option_id: 'shared-flight', flight_no: 'CZ1234', cabin_class: '经济舱' }],
    };
    const flightLater: FlightResultsBlock = {
      ...flightCommon,
      id: 'flight-fallback-later',
      result_count: 1,
      flights: [{ option_id: 'shared-flight', flight_no: 'CZ1234', cabin_class: '商务舱' }],
    };

    expect(collectStructuredToolResultBlocks([trainFirst, trainLater])[0]).toMatchObject({
      result_count: 2,
      trains: [
        expect.objectContaining({ seat_class: '二等座' }),
        expect.objectContaining({ seat_class: '商务座' }),
      ],
    });
    expect(collectStructuredToolResultBlocks([flightFirst, flightLater])[0]).toMatchObject({
      result_count: 2,
      flights: [
        expect.objectContaining({ cabin_class: '经济舱' }),
        expect.objectContaining({ cabin_class: '商务舱' }),
      ],
    });
  });

  it('不同结果类型、路线或日期保持为独立结果块', () => {
    const baseTrain = trainResultBlock({
      id: 'trains-base',
      trains: [trainOption('opt-base', 'G100', '2026-08-01T08:00:00+08:00', '2026-08-01T08:32:00+08:00')],
    });
    const differentDate = trainResultBlock({
      id: 'trains-next-day',
      departureDate: '2026-08-02',
      trains: [trainOption('opt-next-day', 'G100', '2026-08-02T08:00:00+08:00', '2026-08-02T08:32:00+08:00')],
    });
    const differentRoute = trainResultBlock({
      id: 'trains-other-route',
      destination: '厦门北',
      trains: [trainOption('opt-other-route', 'D2288', '2026-08-01T10:00:00+08:00', '2026-08-01T13:30:00+08:00')],
    });
    const flight = {
      type: 'flight_results' as const,
      id: 'flights-base',
      schema_version: 1 as const,
      provider: 'flyai',
      status: 'success' as const,
      origin: '深圳北',
      destination: '广州南',
      departure_date: '2026-08-01',
      observed_at: '2026-07-22T15:00:00+08:00',
      result_count: 0,
      flights: [],
      limitations: [],
    };

    expect(collectStructuredToolResultBlocks([
      baseTrain,
      differentDate,
      differentRoute,
      flight,
    ]).map(block => block.id)).toEqual([
      'trains-base',
      'trains-next-day',
      'trains-other-route',
      'flights-base',
    ]);
  });

  it('航班与高铁结果只保留产品字段、最多 5 项和单个安全预订动作', () => {
    const flight = normalizeStructuredToolResultBlock({
      type: 'flight_results',
      id: 'flights-1',
      schema_version: 1,
      provider: 'flyai',
      attribution: { label: '飞猪旅行' },
      status: 'success',
      origin: '深圳',
      destination: '上海',
      departure_date: '2026-08-01',
      observed_at: '2026-07-22T15:00:00+08:00',
      result_count: 6,
      flights: Array.from({ length: 6 }, (_, index) => ({
        option_id: `flight-${index + 1}`,
        airline_name: '南方航空',
        flight_no: `CZ${1234 + index}`,
        departure: {
          city: '深圳',
          station_name: '深圳宝安国际机场',
          station_code: 'SZX',
          terminal: 'T3',
          scheduled_at: '2026-08-01T08:30:00+08:00',
          private_gate: 'hidden',
        },
        arrival: {
          city: '上海',
          station_name: '上海虹桥国际机场',
          station_code: 'SHA',
          terminal: 'T2',
          scheduled_at: '2026-08-01T10:45:00+08:00',
        },
        duration_s: 8_100,
        cabin_class: '经济舱',
        stops: 0,
        price: { currency: 'CNY', amount_minor: 88_000, private_quote: 'hidden' },
        actions: [
          { kind: 'open_external', label: '安全预订', url: 'https://a.feizhu.com/flight/1' },
          { kind: 'open_external', label: '不安全链接', url: 'http://unsafe.example.com/1' },
        ],
        raw: 'hidden',
      })),
      limitations: ['价格和班次以预订页为准'],
      tool_call_log_id: 'tc-flight',
      raw_payload: 'hidden',
    });

    expect(flight?.type).toBe('flight_results');
    if (flight?.type !== 'flight_results') throw new Error('应返回航班结果块');
    expect(flight.flights).toHaveLength(5);
    expect(flight.flights?.[0]).toEqual({
      option_id: 'flight-1',
      airline_name: '南方航空',
      flight_no: 'CZ1234',
      departure: {
        city: '深圳',
        station_name: '深圳宝安国际机场',
        station_code: 'SZX',
        terminal: 'T3',
        scheduled_at: '2026-08-01T08:30:00+08:00',
      },
      arrival: {
        city: '上海',
        station_name: '上海虹桥国际机场',
        station_code: 'SHA',
        terminal: 'T2',
        scheduled_at: '2026-08-01T10:45:00+08:00',
      },
      duration_s: 8_100,
      cabin_class: '经济舱',
      stops: 0,
      price: { currency: 'CNY', amount_minor: 88_000 },
      actions: [{ kind: 'open_external', label: '安全预订', url: 'https://a.feizhu.com/flight/1' }],
    });
    expect(JSON.stringify(flight)).not.toMatch(/private_gate|private_quote|raw_payload|"raw"/);

    const train = normalizeStructuredToolResultBlock({
      type: 'train_results',
      id: 'trains-1',
      schema_version: 1,
      provider: 'flyai',
      status: 'success',
      origin: '深圳北',
      destination: '广州南',
      departure_date: '2026-08-01',
      observed_at: '2026-07-22T15:00:00+08:00',
      result_count: 1,
      trains: [{
        option_id: 'train-1',
        train_no: 'G100',
        train_type: '高速动车',
        departure: { city: '深圳', station_name: '深圳北站', scheduled_at: '2026-08-01T09:00:00+08:00' },
        arrival: { city: '广州', station_name: '广州南站', scheduled_at: '2026-08-01T09:32:00+08:00' },
        duration_s: 1_920,
        seat_class: '二等座',
        stops: 0,
        price: { currency: 'CNY', amount_minor: 7_450 },
        actions: [],
      }],
    });

    expect(train).toMatchObject({
      type: 'train_results',
      trains: [expect.objectContaining({ train_no: 'G100', seat_class: '二等座' })],
    });
  });

  it('地点结果限制为 5 项，且每个地点最多保留 5 张图片供预览与降级', () => {
    const block = normalizeStructuredToolResultBlock({
      type: 'place_results',
      id: 'places-1',
      schema_version: 1,
      places: Array.from({ length: 6 }, (_, index) => ({
        name: `地点 ${index + 1}`,
        photos: Array.from({ length: 6 }, (_, photoIndex) => ({
          url: `https://img.example.com/${index + 1}-${photoIndex + 1}.jpg`,
        })),
      })),
    });

    expect(block?.type).toBe('place_results');
    if (block?.type !== 'place_results') throw new Error('应返回地点结果块');
    expect(block.places).toHaveLength(5);
    expect(block.places?.[0]?.photos).toEqual([
      { url: 'https://img.example.com/1-1.jpg' },
      { url: 'https://img.example.com/1-2.jpg' },
      { url: 'https://img.example.com/1-3.jpg' },
      { url: 'https://img.example.com/1-4.jpg' },
      { url: 'https://img.example.com/1-5.jpg' },
    ]);
  });

  it('路线结果和不可用方式都严格限制为 3 项', () => {
    const block = normalizeStructuredToolResultBlock({
      type: 'route_results',
      id: 'routes-1',
      schema_version: 1,
      status: 'degraded',
      routes: Array.from({ length: 5 }, (_, index) => ({ mode: `mode-${index + 1}` })),
      unavailable_modes: ['driving', 'transit', 'walking', 'bicycling'],
    });

    expect(block?.type).toBe('route_results');
    if (block?.type !== 'route_results') throw new Error('应返回路线结果块');
    expect(block.routes).toHaveLength(3);
    expect(block.unavailable_modes).toEqual(['driving', 'transit', 'walking']);
  });

  it('白名单保留公交方案详情，并限制主方案和备选方案的线路段数量', () => {
    const block = normalizeStructuredToolResultBlock({
      type: 'route_results',
      id: 'routes-transit',
      schema_version: 1,
      routes: [{
        mode: 'transit',
        transit_type: 'mixed',
        distance_m: 18_400,
        duration_s: 2_520,
        walking_distance_m: 860,
        transfers: 2,
        private_debug: 'internal-route',
        legs: Array.from({ length: 9 }, (_, index) => ({
          kind: index === 0 ? 'walking' : 'subway',
          line_name: index === 0 ? undefined : `地铁 ${index} 号线`,
          departure_stop: index === 0 ? undefined : `起点站 ${index}`,
          arrival_stop: index === 0 ? undefined : `终点站 ${index}`,
          via_stop_count: index,
          distance_m: 320 + index,
          duration_s: 300 + index,
          entrance: index === 0 ? undefined : 'A 口',
          exit: index === 0 ? undefined : 'D 口',
          internal_code: 'hidden-leg',
        })),
        alternatives: Array.from({ length: 3 }, (_, index) => ({
          transit_type: index === 0 ? 'subway' : 'bus',
          distance_m: 19_000 + index,
          duration_s: 2_700 + index,
          walking_distance_m: 500 + index,
          transfers: index,
          summary: `备选 ${index + 1}`,
          private_rank: index,
          legs: Array.from({ length: 9 }, (_, legIndex) => ({
            kind: 'bus',
            line_name: `M${legIndex + 1}`,
            departure_stop: '上车站',
            arrival_stop: '下车站',
            via_stop_count: legIndex,
            distance_m: 1_000,
            duration_s: 600,
            entrance: '入口',
            exit: '出口',
            raw_instruction: 'hidden',
          })),
        })),
      }],
    });

    expect(block?.type).toBe('route_results');
    if (block?.type !== 'route_results') throw new Error('应返回路线结果块');
    const route = block.routes?.[0];
    expect(route).toMatchObject({
      mode: 'transit',
      transit_type: 'mixed',
      distance_m: 18_400,
      duration_s: 2_520,
      walking_distance_m: 860,
      transfers: 2,
    });
    expect(route?.legs).toHaveLength(8);
    expect(route?.legs?.[1]).toEqual({
      kind: 'subway',
      line_name: '地铁 1 号线',
      departure_stop: '起点站 1',
      arrival_stop: '终点站 1',
      via_stop_count: 1,
      distance_m: 321,
      duration_s: 301,
      entrance: 'A 口',
      exit: 'D 口',
    });
    expect(route?.alternatives).toHaveLength(2);
    expect(route?.alternatives?.[0]?.legs).toHaveLength(8);
    expect(route).not.toHaveProperty('private_debug');
    expect(route?.legs?.[0]).not.toHaveProperty('internal_code');
    expect(route?.alternatives?.[0]).not.toHaveProperty('private_rank');
    expect(route?.alternatives?.[0]?.legs?.[0]).not.toHaveProperty('raw_instruction');
  });

  it('忽略未知公交类型和线路段类型，不影响其他合法字段', () => {
    const block = normalizeStructuredToolResultBlock({
      type: 'route_results',
      id: 'routes-unknown-enums',
      schema_version: 1,
      routes: [{
        mode: 'transit',
        transit_type: 'ferry',
        legs: [{ kind: 'teleport', line_name: '测试线' }],
        alternatives: [{ transit_type: 'plane', summary: '备选说明' }],
      }],
    });

    expect(block?.type).toBe('route_results');
    if (block?.type !== 'route_results') throw new Error('应返回路线结果块');
    expect(block.routes?.[0]).toEqual({
      mode: 'transit',
      legs: [{ line_name: '测试线' }],
      alternatives: [{ summary: '备选说明', legs: [] }],
    });
  });

  it('丢弃未知版本和内部扩展字段，只保留公开契约字段', () => {
    expect(normalizeStructuredToolResultBlock({
      type: 'place_results',
      id: 'future',
      schema_version: 2,
    })).toBeNull();

    const block = normalizeStructuredToolResultBlock({
      type: 'place_results',
      id: 'places-2',
      schema_version: 1,
      provider: 'amap',
      internal_alias: 'mcp__amap__local_search',
      places: [{ name: '餐厅', telephone: '0755-12345678' }],
    });

    expect(block).toEqual({
      type: 'place_results',
      id: 'places-2',
      schema_version: 1,
      provider: 'amap',
      attribution: { label: '高德地图' },
      places: [{ name: '餐厅', photos: [], actions: [] }],
      limitations: [],
    });
  });
});
