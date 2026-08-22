export interface VirtualRangeInput {
  itemCount: number;
  scrollTop: number;
  viewportHeight: number;
}

export interface VirtualRange {
  startIndex: number;
  endIndex: number;
  offsetTop: number;
  offsetBottom: number;
  totalHeight: number;
}

export interface ScrollToIndexInput {
  itemCount: number;
  index: number;
  currentScrollTop: number;
  viewportHeight: number;
  align?: 'auto' | 'start' | 'center' | 'end';
}

export const TRAJECTORY_ROW_HEIGHT = 56;
export const TRAJECTORY_OVERSCAN = 12;
export const MAX_TRAJECTORY_DOM_ROWS = 200;

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeItemCount(value: number): number {
  return Math.floor(finiteNonNegative(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** 计算固定行高账本当前需要挂载的半开区间。 */
export function getVirtualRange(input: VirtualRangeInput): VirtualRange {
  const itemCount = normalizeItemCount(input.itemCount);
  const totalHeight = itemCount * TRAJECTORY_ROW_HEIGHT;
  if (itemCount === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      offsetTop: 0,
      offsetBottom: 0,
      totalHeight: 0,
    };
  }

  const viewportHeight = finiteNonNegative(input.viewportHeight);
  const maximumScrollTop = Math.max(0, totalHeight - viewportHeight);
  const scrollTop = clamp(finiteNonNegative(input.scrollTop), 0, maximumScrollTop);
  const visibleStartIndex = clamp(
    Math.floor(scrollTop / TRAJECTORY_ROW_HEIGHT),
    0,
    itemCount - 1,
  );
  const visibleEndIndex = clamp(
    Math.ceil((scrollTop + viewportHeight) / TRAJECTORY_ROW_HEIGHT),
    visibleStartIndex + 1,
    itemCount,
  );
  let startIndex = Math.max(0, visibleStartIndex - TRAJECTORY_OVERSCAN);
  let endIndex = Math.min(itemCount, visibleEndIndex + TRAJECTORY_OVERSCAN);

  if (endIndex - startIndex > MAX_TRAJECTORY_DOM_ROWS) {
    endIndex = Math.min(itemCount, startIndex + MAX_TRAJECTORY_DOM_ROWS);
    startIndex = Math.max(0, endIndex - MAX_TRAJECTORY_DOM_ROWS);
  }

  return {
    startIndex,
    endIndex,
    offsetTop: startIndex * TRAJECTORY_ROW_HEIGHT,
    offsetBottom: (itemCount - endIndex) * TRAJECTORY_ROW_HEIGHT,
    totalHeight,
  };
}

/** 计算目标行进入视口所需的 scrollTop，不依赖目标行已经挂载。 */
export function getScrollTopForIndex(input: ScrollToIndexInput): number {
  const itemCount = normalizeItemCount(input.itemCount);
  if (itemCount === 0) return 0;

  const viewportHeight = finiteNonNegative(input.viewportHeight);
  const totalHeight = itemCount * TRAJECTORY_ROW_HEIGHT;
  const maximumScrollTop = Math.max(0, totalHeight - viewportHeight);
  const index = clamp(Math.floor(finiteNonNegative(input.index)), 0, itemCount - 1);
  const currentScrollTop = clamp(
    finiteNonNegative(input.currentScrollTop),
    0,
    maximumScrollTop,
  );
  const rowStart = index * TRAJECTORY_ROW_HEIGHT;
  const rowEnd = rowStart + TRAJECTORY_ROW_HEIGHT;
  let nextScrollTop: number;

  switch (input.align ?? 'auto') {
    case 'start':
      nextScrollTop = rowStart;
      break;
    case 'center':
      nextScrollTop = rowStart - ((viewportHeight - TRAJECTORY_ROW_HEIGHT) / 2);
      break;
    case 'end':
      nextScrollTop = rowEnd - viewportHeight;
      break;
    case 'auto':
      if (rowStart < currentScrollTop) nextScrollTop = rowStart;
      else if (rowEnd > currentScrollTop + viewportHeight) {
        nextScrollTop = rowEnd - viewportHeight;
      } else nextScrollTop = currentScrollTop;
      break;
  }

  return clamp(nextScrollTop, 0, maximumScrollTop);
}
