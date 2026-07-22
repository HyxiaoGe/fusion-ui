import { describe, expect, it } from 'vitest';
import { normalizeStructuredToolResultBlock } from './structuredToolResults';

describe('normalizeStructuredToolResultBlock', () => {
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
