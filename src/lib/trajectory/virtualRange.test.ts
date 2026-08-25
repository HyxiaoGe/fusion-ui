import { describe, expect, it } from 'vitest';
import {
  getScrollTopForIndex,
  getVirtualRange,
} from './virtualRange';

describe('virtualRange', () => {
  it('在列表开头按 32px 行高与 12 行 overscan 计算窗口', () => {
    expect(getVirtualRange({
      itemCount: 5000,
      scrollTop: 0,
      viewportHeight: 560,
    })).toEqual({
      startIndex: 0,
      endIndex: 30,
      offsetTop: 0,
      offsetBottom: 159040,
      totalHeight: 160000,
    });
  });

  it('在列表中部与尾部只返回当前可见区域附近的行', () => {
    expect(getVirtualRange({
      itemCount: 5000,
      scrollTop: 5600,
      viewportHeight: 560,
    })).toEqual({
      startIndex: 163,
      endIndex: 205,
      offsetTop: 5216,
      offsetBottom: 153440,
      totalHeight: 160000,
    });

    expect(getVirtualRange({
      itemCount: 5000,
      scrollTop: 159440,
      viewportHeight: 560,
    })).toEqual({
      startIndex: 4970,
      endIndex: 5000,
      offsetTop: 159040,
      offsetBottom: 0,
      totalHeight: 160000,
    });
  });

  it('把未挂载目标滚入视口，并对首尾边界做钳制', () => {
    expect(getScrollTopForIndex({
      itemCount: 5000,
      index: 2500,
      currentScrollTop: 0,
      viewportHeight: 560,
    })).toBe(79472);
    expect(getScrollTopForIndex({
      itemCount: 5000,
      index: -20,
      currentScrollTop: 500,
      viewportHeight: 560,
      align: 'start',
    })).toBe(0);
    expect(getScrollTopForIndex({
      itemCount: 5000,
      index: 9999,
      currentScrollTop: 0,
      viewportHeight: 560,
      align: 'end',
    })).toBe(159440);
  });

  it('目标已完全可见时保持当前滚动位置', () => {
    expect(getScrollTopForIndex({
      itemCount: 100,
      index: 12,
      currentScrollTop: 320,
      viewportHeight: 560,
    })).toBe(320);
  });

  it('空列表返回零尺寸，定位也不会产生负滚动值', () => {
    expect(getVirtualRange({
      itemCount: 0,
      scrollTop: 100,
      viewportHeight: 560,
    })).toEqual({
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      offsetBottom: 0,
      totalHeight: 0,
    });
    expect(getScrollTopForIndex({
      itemCount: 0,
      index: 4,
      currentScrollTop: 100,
      viewportHeight: 560,
    })).toBe(0);
  });

  it('把底部浮层占位计入滚动域，使尾部记录能滚到浮层上方', () => {
    expect(getVirtualRange({
      itemCount: 100,
      scrollTop: Number.MAX_SAFE_INTEGER,
      viewportHeight: 560,
      bottomInset: 256,
    })).toMatchObject({
      startIndex: 78,
      endIndex: 100,
      offsetBottom: 256,
      totalHeight: 3456,
    });
    expect(getScrollTopForIndex({
      itemCount: 100,
      index: 99,
      currentScrollTop: 0,
      viewportHeight: 560,
      bottomInset: 256,
      align: 'end',
    })).toBe(2896);
  });

  it('视口 resize 后重新扩大或收窄渲染窗口', () => {
    const compact = getVirtualRange({
      itemCount: 5000,
      scrollTop: 2800,
      viewportHeight: 280,
    });
    const expanded = getVirtualRange({
      itemCount: 5000,
      scrollTop: 2800,
      viewportHeight: 840,
    });

    expect(compact).toMatchObject({ startIndex: 75, endIndex: 109 });
    expect(expanded).toMatchObject({ startIndex: 75, endIndex: 126 });
  });

  it('5000 行在常见桌面视口下始终挂载不超过 200 条记录', () => {
    for (const scrollTop of [0, 32, 3200, 80000, 159440]) {
      const range = getVirtualRange({
        itemCount: 5000,
        scrollTop,
        viewportHeight: 1440,
      });
      expect(range.endIndex - range.startIndex).toBeLessThanOrEqual(200);
    }
  });
});
