import { describe, expect, it } from 'vitest';
import type { AnswerEvidenceItem } from './answerEvidenceModel';
import { layoutAnswerEvidenceItems } from './answerEvidenceLayout';

const searchItem = (index: number): AnswerEvidenceItem => ({
  id: `search-${index}`,
  kind: 'search_source',
  title: `搜索 ${index + 1}`,
  url: `https://search-${index + 1}.example.com`,
  domain: `search-${index + 1}.example.com`,
  sourceIndex: index,
});

const urlItem = (index: number): AnswerEvidenceItem => ({
  id: `url-${index}`,
  kind: 'url_read',
  title: `网页 ${index + 1}`,
  url: `https://url-${index + 1}.example.com`,
  domain: `url-${index + 1}.example.com`,
});

describe('layoutAnswerEvidenceItems', () => {
  it('没有可用宽度时保留完整依据，避免首屏被错误裁剪', () => {
    const items = [searchItem(0), searchItem(1), urlItem(0)];

    expect(layoutAnswerEvidenceItems({ items, containerWidth: 0 }).visibleItems).toEqual(items);
  });

  it('宽度足够时展示全部依据且不产生隐藏计数', () => {
    const items = [searchItem(0), searchItem(1), searchItem(2), urlItem(0)];

    const layout = layoutAnswerEvidenceItems({
      items,
      containerWidth: 900,
      itemWidth: 180,
      itemGap: 8,
    });

    expect(layout.visibleItems).toEqual(items);
    expect(layout.hiddenSearchCount).toBe(0);
    expect(layout.hiddenUrlCount).toBe(0);
    expect(layout.hasHiddenItems).toBe(false);
  });

  it('宽度不足时只保留能容纳的一行数量并统计隐藏搜索', () => {
    const items = [searchItem(0), searchItem(1), searchItem(2), searchItem(3)];

    const layout = layoutAnswerEvidenceItems({
      items,
      containerWidth: 420,
      itemWidth: 180,
      itemGap: 8,
    });

    expect(layout.visibleItems.map(item => item.id)).toEqual(['search-0', 'search-1']);
    expect(layout.hiddenSearchCount).toBe(2);
    expect(layout.hiddenUrlCount).toBe(0);
    expect(layout.hasHiddenItems).toBe(true);
  });

  it('混合依据且空间有限时优先保留搜索，并尽量保留至少一个网页读取来源', () => {
    const items = [
      searchItem(0),
      searchItem(1),
      searchItem(2),
      urlItem(0),
      urlItem(1),
    ];

    const layout = layoutAnswerEvidenceItems({
      items,
      containerWidth: 560,
      itemWidth: 180,
      itemGap: 8,
    });

    expect(layout.visibleItems.map(item => item.id)).toEqual(['search-0', 'search-1', 'url-0']);
    expect(layout.hiddenSearchCount).toBe(1);
    expect(layout.hiddenUrlCount).toBe(1);
  });

  it('混合依据但只能放一个时保留搜索优先级', () => {
    const items = [searchItem(0), urlItem(0), urlItem(1)];

    const layout = layoutAnswerEvidenceItems({
      items,
      containerWidth: 180,
      itemWidth: 180,
      itemGap: 8,
    });

    expect(layout.visibleItems.map(item => item.id)).toEqual(['search-0']);
    expect(layout.hiddenSearchCount).toBe(0);
    expect(layout.hiddenUrlCount).toBe(2);
  });
});
