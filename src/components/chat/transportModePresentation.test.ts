import { describe, expect, it } from 'vitest';
import { resolveTransportModePresentation } from './transportModePresentation';

describe('resolveTransportModePresentation', () => {
  it.each([
    [{ mode: 'transit', transitType: 'subway' }, 'subway', '地铁'],
    [{ mode: 'motorcycle' }, 'motorcycle', '摩托车'],
    [{ mode: 'high_speed_rail' }, 'high-speed-rail', '高铁'],
    [{ mode: 'flight' }, 'flight', '飞机'],
    [{ mode: 'ferry' }, 'ferry', '轮渡'],
  ])('为当前及后续出行方式返回稳定展示信息', (input, iconKind, label) => {
    expect(resolveTransportModePresentation(input)).toMatchObject({ iconKind, label });
  });

  it('线路分段优先于顶层公共交通类型', () => {
    expect(resolveTransportModePresentation({
      mode: 'transit',
      transitType: 'mixed',
      legKind: 'subway',
    })).toMatchObject({ iconKind: 'subway', label: '地铁' });
  });

  it('无法识别的新方式安全回退为通用路线', () => {
    expect(resolveTransportModePresentation({ mode: 'future_vehicle' })).toEqual({
      iconKind: 'route',
      label: '路线方案',
      tone: 'neutral',
    });
  });
});
