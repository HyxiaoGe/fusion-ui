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
      places: [{ name: '餐厅', photos: [] }],
      limitations: [],
    });
  });
});
