import { describe, expect, it } from 'vitest';
import type { ProviderRouteResult } from '@/types/conversation';
import { buildRoutePresentation } from './routePresentation';

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
