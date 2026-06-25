import type { AnswerEvidenceItem } from './answerEvidenceModel';

const DEFAULT_ITEM_WIDTH = 176;
const DEFAULT_ITEM_GAP = 8;

interface AnswerEvidenceLayoutInput {
  items: AnswerEvidenceItem[];
  containerWidth: number;
  itemWidth?: number;
  itemGap?: number;
}

export interface AnswerEvidenceLayout {
  visibleItems: AnswerEvidenceItem[];
  hiddenSearchCount: number;
  hiddenUrlCount: number;
  hasHiddenItems: boolean;
}

export function layoutAnswerEvidenceItems({
  items,
  containerWidth,
  itemWidth = DEFAULT_ITEM_WIDTH,
  itemGap = DEFAULT_ITEM_GAP,
}: AnswerEvidenceLayoutInput): AnswerEvidenceLayout {
  if (items.length === 0) {
    return buildLayout([], items);
  }

  const capacity = estimateVisibleItemCapacity(containerWidth, itemWidth, itemGap);

  if (capacity >= items.length) {
    return buildLayout(items, items);
  }

  const visibleItems = selectVisibleItems(items, capacity);

  return buildLayout(visibleItems, items);
}

function estimateVisibleItemCapacity(containerWidth: number, itemWidth: number, itemGap: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const normalizedItemWidth = Math.max(1, Math.floor(itemWidth));
  const normalizedGap = Math.max(0, Math.floor(itemGap));

  return Math.max(1, Math.floor((containerWidth + normalizedGap) / (normalizedItemWidth + normalizedGap)));
}

function selectVisibleItems(items: AnswerEvidenceItem[], capacity: number): AnswerEvidenceItem[] {
  const normalizedCapacity = Math.max(1, Math.floor(capacity));
  const searchItems = items.filter(item => item.kind === 'search_source');
  const urlItems = items.filter(item => item.kind === 'url_read');

  if (searchItems.length > 0 && urlItems.length > 0) {
    if (normalizedCapacity === 1) {
      return searchItems.slice(0, 1);
    }

    const searchCount = Math.min(searchItems.length, normalizedCapacity - 1);
    const urlCount = Math.min(urlItems.length, normalizedCapacity - searchCount);
    const remainingSlots = normalizedCapacity - searchCount - urlCount;

    return [
      ...searchItems.slice(0, searchCount),
      ...urlItems.slice(0, urlCount + remainingSlots),
    ];
  }

  return items.slice(0, normalizedCapacity);
}

function buildLayout(visibleItems: AnswerEvidenceItem[], allItems: AnswerEvidenceItem[]): AnswerEvidenceLayout {
  const visibleSearchCount = visibleItems.filter(item => item.kind === 'search_source').length;
  const visibleUrlCount = visibleItems.filter(item => item.kind === 'url_read').length;
  const searchCount = allItems.filter(item => item.kind === 'search_source').length;
  const urlCount = allItems.filter(item => item.kind === 'url_read').length;
  const hiddenSearchCount = Math.max(0, searchCount - visibleSearchCount);
  const hiddenUrlCount = Math.max(0, urlCount - visibleUrlCount);

  return {
    visibleItems,
    hiddenSearchCount,
    hiddenUrlCount,
    hasHiddenItems: hiddenSearchCount > 0 || hiddenUrlCount > 0,
  };
}
