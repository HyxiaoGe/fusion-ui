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
  hiddenKnowledgeCount: number;
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
  const knowledgeItems = items.filter(item => item.kind === 'knowledge');

  // 保留既有网页依据布局：搜索和深读同时存在时尽量各预览一条。
  if (knowledgeItems.length === 0 && searchItems.length > 0 && urlItems.length > 0) {
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

  // 知识来源按统一 citation_index 顺序预览，避免编号与展示顺序错位。
  return items.slice(0, normalizedCapacity);
}

function buildLayout(visibleItems: AnswerEvidenceItem[], allItems: AnswerEvidenceItem[]): AnswerEvidenceLayout {
  const visibleSearchCount = visibleItems.filter(item => item.kind === 'search_source').length;
  const visibleUrlCount = visibleItems.filter(item => item.kind === 'url_read').length;
  const visibleKnowledgeCount = visibleItems.filter(item => item.kind === 'knowledge').length;
  const searchCount = allItems.filter(item => item.kind === 'search_source').length;
  const urlCount = allItems.filter(item => item.kind === 'url_read').length;
  const knowledgeCount = allItems.filter(item => item.kind === 'knowledge').length;
  const hiddenSearchCount = Math.max(0, searchCount - visibleSearchCount);
  const hiddenUrlCount = Math.max(0, urlCount - visibleUrlCount);
  const hiddenKnowledgeCount = Math.max(0, knowledgeCount - visibleKnowledgeCount);

  return {
    visibleItems,
    hiddenSearchCount,
    hiddenUrlCount,
    hiddenKnowledgeCount,
    hasHiddenItems: hiddenSearchCount > 0 || hiddenUrlCount > 0 || hiddenKnowledgeCount > 0,
  };
}
