import { describe, expect, it } from 'vitest';
import type { ProviderRouteResult } from '@/types/conversation';
import { buildRoutePresentation, findFastestRouteIndex } from './routePresentation';

describe('findFastestRouteIndex', () => {
  it('仅在至少两个方案中存在唯一最快方案时返回该方案', () => {
    expect(findFastestRouteIndex([
      { mode: 'driving', duration_s: 1_080 },
      { mode: 'transit', duration_s: 1_980 },
      { mode: 'bicycling', duration_s: 2_220 },
    ])).toBe(0);
  });

  it('单方案、并列最快或可比较用时不足时不标记用时最短', () => {
    expect(findFastestRouteIndex([{ mode: 'driving', duration_s: 1_080 }])).toBeNull();
    expect(findFastestRouteIndex([
      { mode: 'driving', duration_s: 1_080 },
      { mode: 'transit', duration_s: 1_080 },
    ])).toBeNull();
    expect(findFastestRouteIndex([
      { mode: 'driving', duration_s: 1_080 },
      { mode: 'transit' },
    ])).toBeNull();
  });
});

describe('buildRoutePresentation', () => {
  it('单路线使用 single 展示', () => {
    expect(buildRoutePresentation([{ mode: 'driving' }])).toEqual({
      variant: 'single',
      initialSelectedIndex: 0,
    });
  });

  it('多路线且都没有线路段或备选方案时使用 grid 展示', () => {
    expect(buildRoutePresentation([
      { mode: 'driving' },
      { mode: 'walking', legs: [] },
      { mode: 'bicycling', alternatives: null },
    ])).toEqual({
      variant: 'grid',
      initialSelectedIndex: 0,
    });
  });

  it('多路线中恰好一条复杂路线时使用 summary-detail 并默认选中复杂路线', () => {
    const routes: ProviderRouteResult[] = [
      { mode: 'driving' },
      { mode: 'transit', legs: [{ kind: 'subway', line_name: '地铁 1 号线' }] },
      { mode: 'bicycling' },
    ];

    expect(buildRoutePresentation(routes)).toEqual({
      variant: 'summary-detail',
      initialSelectedIndex: 1,
    });
  });

  it('多条路线包含线路段或备选方案时使用 stack 展示', () => {
    expect(buildRoutePresentation([
      { mode: 'transit', legs: [{ kind: 'bus', line_name: 'M201 路' }] },
      { mode: 'transit', alternatives: [{ transit_type: 'subway' }] },
      { mode: 'driving' },
    ])).toEqual({
      variant: 'stack',
      initialSelectedIndex: 0,
    });
  });
});
