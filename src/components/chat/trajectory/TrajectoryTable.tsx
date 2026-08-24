'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import { projectTrajectoryTableRows } from '@/lib/trajectory/trajectoryTableModel';
import {
  clampTrajectoryScrollTop,
  getScrollTopForIndex,
  getVirtualRange,
  TRAJECTORY_ROW_HEIGHT,
} from '@/lib/trajectory/virtualRange';
import { cn } from '@/lib/utils';
import { TrajectoryCell as TrajectoryCellRow } from './TrajectoryCell';

export interface TrajectoryInspectTarget {
  requestId: string;
  cellKey: string;
}

export interface TrajectoryViewportState {
  scrollTop: number;
  atTail: boolean;
  userInitiated: boolean;
}

export interface TrajectoryTableProps {
  cells: readonly TrajectoryCell[];
  selectedCellKey: string | null;
  inspectTarget?: TrajectoryInspectTarget | null;
  searchQuery?: string;
  focusedCellKeys?: ReadonlySet<string> | null;
  viewportHeight?: number;
  initialScrollTop?: number;
  /** 新会话或新视图恢复事务必须更换 identity；同 identity 不会覆盖后续用户滚动。 */
  restoreKey?: string | number | null;
  onSelectCell?: (cell: TrajectoryCell, sourceIndex: number) => void;
  onInspectTargetResolved?: (
    target: TrajectoryInspectTarget,
    visibleIndex: number,
    cell: TrajectoryCell,
  ) => void;
  onInspectTargetUnavailable?: (target: TrajectoryInspectTarget) => void;
  onViewportStateChange?: (state: TrajectoryViewportState) => void;
  className?: string;
  /** 仅供旧 Ledger 兼容层保留既有可访问名称。 */
  ariaLabel?: string;
}

const DEFAULT_VIEWPORT_HEIGHT = 560;
const AT_TAIL_TOLERANCE_PX = 8;

export function TrajectoryTable({
  cells,
  selectedCellKey,
  inspectTarget = null,
  searchQuery = '',
  focusedCellKeys = null,
  viewportHeight,
  initialScrollTop = 0,
  restoreKey = null,
  onSelectCell,
  onInspectTargetResolved,
  onInspectTargetUnavailable,
  onViewportStateChange,
  className,
  ariaLabel = '轨迹记录表',
}: TrajectoryTableProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const handledInspectRequestRef = useRef<string | null>(null);
  const handledControlledSelectionRef = useRef<{ key: string; index: number } | null>(null);
  const restoredIdentityRef = useRef<{ key: string | number | null } | null>(null);
  const suppressedScrollTopRef = useRef<number | null>(null);
  const rows = useMemo(() => projectTrajectoryTableRows({
    cells,
    searchQuery,
    focusedCellKeys,
  }), [cells, focusedCellKeys, searchQuery]);
  const selectedIndex = rows.findIndex(row => row.cell.key === selectedCellKey);
  const [activeKey, setActiveKey] = useState<string | null>(() => (
    selectedIndex >= 0 ? rows[selectedIndex].cell.key : rows[0]?.cell.key ?? null
  ));
  const [scrollTop, setScrollTop] = useState(() => Math.max(0, initialScrollTop));
  const scrollTopRef = useRef(scrollTop);
  const explicitViewportHeight = typeof viewportHeight === 'number'
    && Number.isFinite(viewportHeight)
    && viewportHeight > 0
    ? viewportHeight
    : null;
  const [observedViewportHeight, setObservedViewportHeight] = useState<number | null>(null);
  const measuredHeight = explicitViewportHeight ?? observedViewportHeight ?? DEFAULT_VIEWPORT_HEIGHT;
  const [focusRequestIndex, setFocusRequestIndex] = useState<number | null>(null);
  const requestedActiveIndex = rows.findIndex(row => row.cell.key === activeKey);
  const range = getVirtualRange({
    itemCount: rows.length,
    scrollTop,
    viewportHeight: measuredHeight,
  });
  const activeIndex = requestedActiveIndex >= range.startIndex
    && requestedActiveIndex < range.endIndex
    ? requestedActiveIndex
    : range.startIndex;

  const reportViewport = useCallback((nextScrollTop: number, userInitiated: boolean) => {
    onViewportStateChange?.({
      scrollTop: nextScrollTop,
      atTail: isAtTail(rows.length, nextScrollTop, measuredHeight),
      userInitiated,
    });
  }, [measuredHeight, onViewportStateChange, rows.length]);

  const applyProgrammaticScroll = useCallback((nextScrollTop: number) => {
    const viewport = viewportRef.current;
    suppressedScrollTopRef.current = nextScrollTop;
    if (viewport) viewport.scrollTop = nextScrollTop;
    scrollTopRef.current = nextScrollTop;
    setScrollTop(current => current === nextScrollTop ? current : nextScrollTop);
    reportViewport(nextScrollTop, false);
  }, [reportViewport]);

  useLayoutEffect(() => {
    if (explicitViewportHeight !== null) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observeHeight = (height: number) => {
      const nextHeight = Number.isFinite(height) && height > 0 ? height : null;
      setObservedViewportHeight(current => current === nextHeight ? current : nextHeight);
    };
    observeHeight(viewport.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height ?? viewport.clientHeight;
      observeHeight(height);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [explicitViewportHeight]);

  useLayoutEffect(() => {
    const restoredIdentity = restoredIdentityRef.current;
    if (restoredIdentity && Object.is(restoredIdentity.key, restoreKey)) return;
    if (rows.length === 0) return;
    const restoreViewportHeight = explicitViewportHeight ?? observedViewportHeight;
    if (restoreViewportHeight === null) return;
    const restoredScrollTop = clampTrajectoryScrollTop({
      itemCount: rows.length,
      scrollTop: initialScrollTop,
      viewportHeight: restoreViewportHeight,
    });
    restoredIdentityRef.current = { key: restoreKey };
    applyProgrammaticScroll(restoredScrollTop);
  }, [
    applyProgrammaticScroll,
    explicitViewportHeight,
    initialScrollTop,
    observedViewportHeight,
    restoreKey,
    rows.length,
  ]);

  const scrollToIndex = useCallback((index: number, align: 'auto' | 'center' = 'auto') => {
    const viewport = viewportRef.current;
    const nextScrollTop = getScrollTopForIndex({
      itemCount: rows.length,
      index,
      currentScrollTop: viewport?.scrollTop ?? scrollTopRef.current,
      viewportHeight: measuredHeight,
      align,
    });
    applyProgrammaticScroll(nextScrollTop);
  }, [applyProgrammaticScroll, measuredHeight, rows.length]);

  useEffect(() => {
    if (selectedIndex < 0 || selectedCellKey === null) {
      handledControlledSelectionRef.current = null;
      return;
    }
    const handled = handledControlledSelectionRef.current;
    if (handled?.key === selectedCellKey && handled.index === selectedIndex) return;
    handledControlledSelectionRef.current = { key: selectedCellKey, index: selectedIndex };
    setActiveKey(selectedCellKey);
    const mountedTarget = viewportRef.current?.querySelector(
      `[data-trajectory-index="${selectedIndex}"]`,
    );
    if (!mountedTarget) scrollToIndex(selectedIndex, 'auto');
  }, [scrollToIndex, selectedCellKey, selectedIndex]);

  useEffect(() => {
    if (!inspectTarget) {
      handledInspectRequestRef.current = null;
      return;
    }
    if (handledInspectRequestRef.current === inspectTarget.requestId) return;
    handledInspectRequestRef.current = inspectTarget.requestId;
    const index = rows.findIndex(row => row.cell.key === inspectTarget.cellKey);
    if (index < 0) {
      onInspectTargetUnavailable?.(inspectTarget);
      return;
    }
    setActiveKey(rows[index].cell.key);
    scrollToIndex(index, 'center');
    setFocusRequestIndex(index);
    onInspectTargetResolved?.(inspectTarget, index, rows[index].cell);
  }, [inspectTarget, onInspectTargetResolved, onInspectTargetUnavailable, rows, scrollToIndex]);

  useEffect(() => {
    if (rows.length === 0) {
      setActiveKey(null);
      return;
    }
    if (!rows.some(row => row.key === activeKey)) setActiveKey(rows[0].key);
  }, [activeKey, rows]);

  useLayoutEffect(() => {
    if (focusRequestIndex === null) return;
    const target = viewportRef.current?.querySelector<HTMLElement>(
      `[data-trajectory-index="${focusRequestIndex}"]`,
    );
    if (!target) return;
    target.focus({ preventScroll: true });
    setFocusRequestIndex(null);
  }, [focusRequestIndex, range.endIndex, range.startIndex]);

  const moveToIndex = useCallback((index: number) => {
    if (rows.length === 0) return;
    const nextIndex = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[nextIndex];
    setActiveKey(row.cell.key);
    scrollToIndex(nextIndex, 'center');
    setFocusRequestIndex(nextIndex);
    onSelectCell?.(row.cell, row.sourceIndex);
  }, [onSelectCell, rows, scrollToIndex]);

  const handleKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') targetIndex = index + 1;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') targetIndex = index - 1;
    else if (event.key === 'Home') targetIndex = 0;
    else if (event.key === 'End') targetIndex = rows.length - 1;
    if (targetIndex === null) return;
    event.preventDefault();
    moveToIndex(targetIndex);
  }, [moveToIndex, rows.length]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    scrollTopRef.current = nextScrollTop;
    setScrollTop(nextScrollTop);
    const suppressedScrollTop = suppressedScrollTopRef.current;
    suppressedScrollTopRef.current = null;
    if (suppressedScrollTop !== null && Math.abs(suppressedScrollTop - nextScrollTop) <= 0.5) return;
    reportViewport(nextScrollTop, true);
  };

  const isFiltered = Boolean(searchQuery.trim()) || Boolean(focusedCellKeys?.size);

  return (
    <div className={cn(
      'flex min-h-28 min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-background',
      className,
    )}>
      <div
        aria-hidden="true"
        className="grid h-9 shrink-0 grid-cols-[3rem_minmax(7.5rem,0.9fr)_minmax(4.5rem,0.55fr)_minmax(12rem,2.5fr)_minmax(8rem,1fr)_5.5rem] items-center gap-2 border-b border-border/70 bg-muted/60 px-3 text-[11px] font-medium text-muted-foreground"
      >
        <span>#</span>
        <span>Turn / Attempt</span>
        <span>类型</span>
        <span>名称 / 摘要</span>
        <span>状态</span>
        <span className="text-right">耗时</span>
      </div>
      <div
        ref={viewportRef}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={rows.length ? `trajectory-cell-${activeIndex + 1}` : undefined}
        onScroll={handleScroll}
        style={{ height: viewportHeight === undefined ? '100%' : `${viewportHeight}px` }}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pt-20 scroll-pb-20"
      >
        {rows.length === 0 ? (
          <p className="flex h-full min-h-28 items-center justify-center px-4 text-sm text-muted-foreground">
            {cells.length === 0 ? '当前会话暂无轨迹记录' : isFiltered ? '没有匹配记录' : '当前会话暂无轨迹记录'}
          </p>
        ) : (
          <>
            <div aria-hidden="true" style={{ height: `${range.offsetTop}px` }} />
            {rows.slice(range.startIndex, range.endIndex).map((row, relativeIndex) => {
              const index = range.startIndex + relativeIndex;
              return (
                <TrajectoryCellRow
                  key={row.cell.key}
                  cell={row.cell}
                  turnNumber={row.turnNumber}
                  attemptNumber={row.attemptNumber}
                  selected={row.cell.key === selectedCellKey}
                  highlighted={row.cell.key === inspectTarget?.cellKey}
                  active={index === activeIndex}
                  position={index + 1}
                  setSize={rows.length}
                  sourceNumber={row.sourceIndex + 1}
                  kindLabel={row.kindLabel}
                  summary={row.summary}
                  statusLabel={row.statusLabel}
                  durationMs={row.durationMs}
                  attemptCount={row.attemptCount}
                  searchQuery={searchQuery}
                  matched={row.matched}
                  onSelect={() => {
                    setActiveKey(row.cell.key);
                    onSelectCell?.(row.cell, row.sourceIndex);
                  }}
                  onKeyDown={event => handleKeyDown(event, index)}
                />
              );
            })}
            <div aria-hidden="true" style={{ height: `${range.offsetBottom}px` }} />
          </>
        )}
      </div>
    </div>
  );
}

function isAtTail(itemCount: number, scrollTop: number, viewportHeight: number): boolean {
  const maximumScrollTop = Math.max(0, (itemCount * TRAJECTORY_ROW_HEIGHT) - viewportHeight);
  return maximumScrollTop - scrollTop <= AT_TAIL_TOLERANCE_PX;
}
