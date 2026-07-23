import { describe, expect, it } from 'vitest';
import {
  normalizeContentBlock,
  normalizeContentBlocks,
  registeredContentBlockContracts,
} from './contentBlockRegistry';

function weatherPayload(overrides: Record<string, unknown> = {}) {
  return {
    type: 'weather_results',
    id: 'weather-1',
    schema_version: 1,
    provider: 'amap',
    attribution: { label: '高德地图' },
    status: 'success',
    query: '南景新村',
    resolved_location: '龙华区',
    day_count: 4,
    forecast_days: [
      {
        date: '2026-07-23',
        weekday: 4,
        day_weather: '雷阵雨',
        night_weather: '雷阵雨',
        high_c: 32,
        low_c: 27,
        day_wind_direction: '南',
        night_wind_direction: '南',
        day_wind_power: '1-3',
        night_wind_power: '1-3',
      },
      {
        date: '2026-07-24',
        weekday: 5,
        day_weather: '多云',
        night_weather: '多云',
        high_c: 33,
        low_c: 27,
      },
      {
        date: '2026-07-25',
        weekday: 6,
        day_weather: '晴',
        night_weather: '多云',
        high_c: 34,
        low_c: 28,
      },
      {
        date: '2026-07-26',
        weekday: 7,
        day_weather: '阵雨',
        night_weather: '阵雨',
        high_c: 32,
        low_c: 27,
      },
    ],
    fetched_at: '2026-07-23T12:00:00+08:00',
    limitations: [],
    tool_call_log_id: 'tc-weather',
    ...overrides,
  };
}

describe('contentBlockRegistry', () => {
  it('注册现有核心、依据和富结果契约', () => {
    expect(registeredContentBlockContracts()).toEqual([
      { type: 'text', schemaVersion: null },
      { type: 'thinking', schemaVersion: null },
      { type: 'file', schemaVersion: null },
      { type: 'search', schemaVersion: null },
      { type: 'url_read', schemaVersion: null },
      { type: 'place_results', schemaVersion: 1 },
      { type: 'route_results', schemaVersion: 1 },
      { type: 'flight_results', schemaVersion: 1 },
      { type: 'train_results', schemaVersion: 1 },
      { type: 'weather_results', schemaVersion: 1 },
      { type: 'unsupported_result', schemaVersion: null },
    ]);
  });

  it('逐块隔离未知类型、未来版本和损坏块并生成安全占位', () => {
    const blocks = normalizeContentBlocks([
      { type: 'text', id: 'text-1', text: '第一段' },
      { type: 'future_result', id: 'future-1', schema_version: 1, private: 'sentinel' },
      {
        type: 'place_results',
        id: 'places-v2',
        schema_version: 2,
        places: [{ name: '未来地点' }],
      },
      { type: 'text', id: '', text: '损坏文本' },
      { type: 'thinking', id: 'thinking-1', thinking: '继续处理' },
    ]);

    expect(blocks).toEqual([
      { type: 'text', id: 'text-1', text: '第一段' },
      {
        type: 'unsupported_result',
        id: 'future-1',
        source_type: 'future_result',
        source_schema_version: 1,
        reason: 'unsupported_type',
      },
      {
        type: 'unsupported_result',
        id: 'places-v2',
        source_type: 'place_results',
        source_schema_version: 2,
        reason: 'unsupported_version',
      },
      {
        type: 'unsupported_result',
        id: 'unsupported-text',
        source_type: 'text',
        reason: 'invalid_payload',
      },
      { type: 'thinking', id: 'thinking-1', thinking: '继续处理' },
    ]);
    expect(JSON.stringify(blocks)).not.toContain('sentinel');
  });

  it('缺少 type 的对象也降级为安全占位，不把原始字段带入状态', () => {
    const block = normalizeContentBlock({
      id: 'broken-1',
      schema_version: 1,
      secret: 'must-not-reach-ui-state',
    });

    expect(block).toEqual({
      type: 'unsupported_result',
      id: 'broken-1',
      source_type: 'unknown',
      source_schema_version: 1,
      reason: 'invalid_payload',
    });
    expect(JSON.stringify(block)).not.toContain('must-not-reach-ui-state');
  });

  it('为同一消息内缺少 id 的多个损坏块生成不冲突的占位 id', () => {
    expect(normalizeContentBlocks([
      { type: 'text', id: '', text: '损坏文本一' },
      { type: 'text', id: '', text: '损坏文本二' },
    ])).toEqual([
      {
        type: 'unsupported_result',
        id: 'unsupported-text',
        source_type: 'text',
        reason: 'invalid_payload',
      },
      {
        type: 'unsupported_result',
        id: 'unsupported-text-2',
        source_type: 'text',
        reason: 'invalid_payload',
      },
    ]);
  });

  it('完整恢复搜索展示元数据而不是只保留基础来源', () => {
    expect(normalizeContentBlock({
      type: 'search',
      id: 'search-1',
      query: '深圳天气',
      sources: [{ title: '气象局', url: 'https://example.com/weather' }],
      source_refs: [{ kind: 'search', title: '气象局', url: 'https://example.com/weather' }],
      requested_count: 8,
      actual_count: 3,
      context_source_count: 2,
      context_source_limit: 5,
      search_budget: 'balanced',
      intent: 'freshness',
      domains: ['example.com'],
      recency_days: 7,
      budget_limited: true,
    })).toEqual(expect.objectContaining({
      type: 'search',
      requested_count: 8,
      actual_count: 3,
      context_source_count: 2,
      context_source_limit: 5,
      search_budget: 'balanced',
      intent: 'freshness',
      domains: ['example.com'],
      recency_days: 7,
      budget_limited: true,
    }));
  });

  it('富结果必须匹配已注册 schema_version', () => {
    expect(normalizeContentBlock({
      type: 'place_results',
      id: 'places-1',
      schema_version: 1,
      provider: 'amap',
      query: '民治餐厅',
      status: 'success',
      result_count: 1,
      places: [{ name: '民治餐厅' }],
    })).toEqual(expect.objectContaining({ type: 'place_results', schema_version: 1 }));

    expect(normalizeContentBlock({
      type: 'route_results',
      id: 'routes-without-version',
      provider: 'amap',
      status: 'success',
      origin: { label: '民治' },
      destination: { label: '深圳北站' },
      routes: [{ mode: 'driving' }],
    })).toEqual({
      type: 'unsupported_result',
      id: 'routes-without-version',
      source_type: 'route_results',
      reason: 'invalid_payload',
    });
  });

  it('富结果缺少后端必填字段时按损坏 payload 降级', () => {
    expect(normalizeContentBlock({
      type: 'place_results',
      id: 'places-missing-required',
      schema_version: 1,
      places: [{ name: '民治餐厅' }],
    })).toEqual({
      type: 'unsupported_result',
      id: 'places-missing-required',
      source_type: 'place_results',
      source_schema_version: 1,
      reason: 'invalid_payload',
    });

    expect(normalizeContentBlock({
      type: 'route_results',
      id: 'routes-missing-required',
      schema_version: 1,
      routes: [{ mode: 'driving' }],
    })).toEqual({
      type: 'unsupported_result',
      id: 'routes-missing-required',
      source_type: 'route_results',
      source_schema_version: 1,
      reason: 'invalid_payload',
    });
  });

  it('航班和高铁结果校验行程、数量及最低必填字段，并允许空结果', () => {
    const common = {
      schema_version: 1,
      provider: 'flyai',
      status: 'success',
      origin: '深圳',
      destination: '上海',
      departure_date: '2026-08-01',
      observed_at: '2026-07-22T15:00:00+08:00',
    };

    expect(normalizeContentBlock({
      ...common,
      type: 'flight_results',
      id: 'flights-empty',
      result_count: 0,
      flights: [],
    })).toEqual(expect.objectContaining({ type: 'flight_results', flights: [] }));

    expect(normalizeContentBlock({
      ...common,
      type: 'train_results',
      id: 'trains-1',
      result_count: 1,
      trains: [{
        option_id: 'train-1',
        train_no: 'G100',
        departure: { city: '深圳', station_name: '深圳北站', scheduled_at: '2026-08-01T09:00:00+08:00' },
        arrival: { city: '上海', station_name: '上海虹桥站', scheduled_at: '2026-08-01T16:00:00+08:00' },
        duration_s: 25_200,
        stops: 0,
      }],
    })).toEqual(expect.objectContaining({ type: 'train_results', result_count: 1 }));

    expect(normalizeContentBlock({
      ...common,
      type: 'flight_results',
      id: 'flights-count-mismatch',
      result_count: 2,
      flights: [{ flight_no: 'CZ1234' }],
    })).toEqual(expect.objectContaining({
      type: 'unsupported_result',
      reason: 'invalid_payload',
    }));
  });

  it('天气结果只接收高德四天安全投影，并丢弃原始上游字段', () => {
    const block = normalizeContentBlock(weatherPayload({
      raw_payload: { forecasts: ['must-not-reach-state'] },
      forecast_days: weatherPayload().forecast_days instanceof Array
        ? weatherPayload().forecast_days.map(day => ({
          ...day as Record<string, unknown>,
          private_code: 'must-not-reach-state',
        }))
        : [],
    }));

    expect(block).toEqual({
      type: 'weather_results',
      id: 'weather-1',
      schema_version: 1,
      provider: 'amap',
      attribution: { label: '高德地图' },
      status: 'success',
      query: '南景新村',
      resolved_location: '龙华区',
      day_count: 4,
      forecast_days: weatherPayload().forecast_days,
      fetched_at: '2026-07-23T12:00:00+08:00',
      limitations: [],
      tool_call_log_id: 'tc-weather',
    });
    expect(JSON.stringify(block)).not.toMatch(/raw_payload|private_code|must-not-reach-state/);
  });

  it('天气未来版本和非法 payload 降级为不含原始字段的安全占位', () => {
    const future = normalizeContentBlock(weatherPayload({
      id: 'weather-v2',
      schema_version: 2,
      secret: 'future-secret',
    }));
    expect(future).toEqual({
      type: 'unsupported_result',
      id: 'weather-v2',
      source_type: 'weather_results',
      source_schema_version: 2,
      reason: 'unsupported_version',
    });
    expect(JSON.stringify(future)).not.toContain('future-secret');

    const validDays = weatherPayload().forecast_days as Array<Record<string, unknown>>;
    const weatherAtLimit = '晴'.repeat(80);
    const windAtLimit = '东'.repeat(40);
    expect(normalizeContentBlock(weatherPayload({
      id: 'weather-length-boundary',
      forecast_days: [{
        ...validDays[0],
        day_weather: weatherAtLimit,
        night_weather: weatherAtLimit,
        day_wind_direction: windAtLimit,
        night_wind_direction: windAtLimit,
        day_wind_power: windAtLimit,
        night_wind_power: windAtLimit,
      }, ...validDays.slice(1)],
    }))).toEqual(expect.objectContaining({
      type: 'weather_results',
      forecast_days: [
        expect.objectContaining({
          day_weather: weatherAtLimit,
          night_weather: weatherAtLimit,
          day_wind_direction: windAtLimit,
          night_wind_direction: windAtLimit,
          day_wind_power: windAtLimit,
          night_wind_power: windAtLimit,
        }),
        ...validDays.slice(1),
      ],
    }));

    const invalidPayloads = [
      weatherPayload({ id: 'weather-provider', provider: 'other' }),
      weatherPayload({ id: 'weather-query', query: ' ' }),
      weatherPayload({ id: 'weather-location', resolved_location: '' }),
      weatherPayload({ id: 'weather-count', day_count: 3 }),
      weatherPayload({ id: 'weather-empty', day_count: 0, forecast_days: [] }),
      weatherPayload({
        id: 'weather-too-many-days',
        day_count: 5,
        forecast_days: [
          ...validDays,
          {
            ...validDays[3],
            date: '2026-07-27',
            weekday: 1,
          },
        ],
      }),
      weatherPayload({
        id: 'weather-order',
        forecast_days: [validDays[1], validDays[0], validDays[2], validDays[3]],
      }),
      weatherPayload({
        id: 'weather-duplicate',
        forecast_days: [validDays[0], validDays[0], validDays[2], validDays[3]],
      }),
      weatherPayload({
        id: 'weather-weekday',
        forecast_days: [{ ...validDays[0], weekday: 0 }, ...validDays.slice(1)],
      }),
      weatherPayload({
        id: 'weather-invalid-date',
        forecast_days: [{
          ...validDays[0],
          date: '2026-02-30',
          weekday: 1,
        }, ...validDays.slice(1)],
      }),
      weatherPayload({
        id: 'weather-weekday-mismatch',
        forecast_days: [{ ...validDays[0], weekday: 5 }, ...validDays.slice(1)],
      }),
      weatherPayload({
        id: 'weather-temperature',
        forecast_days: [{ ...validDays[0], high_c: 101 }, ...validDays.slice(1)],
      }),
      weatherPayload({
        id: 'weather-temperature-order',
        forecast_days: [{ ...validDays[0], high_c: 20, low_c: 27 }, ...validDays.slice(1)],
      }),
      weatherPayload({
        id: 'weather-phenomenon',
        forecast_days: [{ ...validDays[0], day_weather: '' }, ...validDays.slice(1)],
      }),
      weatherPayload({
        id: 'weather-phenomenon-overflow',
        forecast_days: [{
          ...validDays[0],
          day_weather: `${weatherAtLimit}超`,
        }, ...validDays.slice(1)],
      }),
      weatherPayload({
        id: 'weather-wind-overflow',
        forecast_days: [{
          ...validDays[0],
          day_wind_direction: `${windAtLimit}超`,
        }, ...validDays.slice(1)],
      }),
      weatherPayload({
        id: 'weather-partial-success',
        day_count: 3,
        forecast_days: validDays.slice(0, 3),
      }),
      weatherPayload({
        id: 'weather-full-degraded',
        status: 'degraded',
      }),
      weatherPayload({ id: 'weather-timezone', fetched_at: '2026-07-23T12:00:00' }),
    ];

    invalidPayloads.forEach(payload => {
      const block = normalizeContentBlock({ ...payload, secret: 'invalid-secret' });
      expect(block).toEqual(expect.objectContaining({
        type: 'unsupported_result',
        id: payload.id,
        source_type: 'weather_results',
        source_schema_version: 1,
        reason: 'invalid_payload',
      }));
      expect(JSON.stringify(block)).not.toContain('invalid-secret');
    });

    expect(normalizeContentBlock(weatherPayload({
      id: 'weather-degraded-partial',
      status: 'degraded',
      day_count: 3,
      forecast_days: validDays.slice(0, 3),
    }))).toEqual(expect.objectContaining({
      type: 'weather_results',
      day_count: 3,
      status: 'degraded',
    }));
  });
});
