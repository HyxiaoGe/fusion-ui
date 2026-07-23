import { describe, expect, it } from 'vitest';
import {
  normalizeContentBlock,
  normalizeContentBlocks,
  registeredContentBlockContracts,
} from './contentBlockRegistry';

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
});
