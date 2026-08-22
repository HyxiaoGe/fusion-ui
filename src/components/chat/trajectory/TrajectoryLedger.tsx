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
import {
  getScrollTopForIndex,
  getVirtualRange,
} from '@/lib/trajectory/virtualRange';
import { cn } from '@/lib/utils';
import { TrajectoryCell as TrajectoryCellRow } from './TrajectoryCell';

export interface TrajectoryInspectTarget {
  requestId: string;
  cellKey: string;
}

export interface TrajectoryLedgerProps {
  cells: readonly TrajectoryCell[];
  selectedCellKey: string | null;
  inspectTarget?: TrajectoryInspectTarget | null;
  viewportHeight?: number;
  initialScrollTop?: number;
  onSelectCell?: (cell: TrajectoryCell, index: number) => void;
  onInspectTargetResolved?: (
    target: TrajectoryInspectTarget,
    index: number,
    cell: TrajectoryCell,
  ) => void;
  onScrollTopChange?: (scrollTop: number) => void;
  className?: string;
}

interface LedgerRowMeta {
  cell: TrajectoryCell;
  turnNumber: number | null;
  attemptNumber: number | null;
}

function buildLedgerRows(cells: readonly TrajectoryCell[]): LedgerRowMeta[] {
  let turnNumber = 0;
  let currentRunId: string | null = null;
  let currentRunTurn: number | null = null;
  const turnsByUserMessageId = new Map<string, number>();
  return cells.map(cell => {
    if (cell.type === 'user') {
      turnNumber += 1;
      turnsByUserMessageId.set(cell.userMessageId, turnNumber);
      currentRunId = null;
      currentRunTurn = null;
    }
    let rowTurn = turnNumber || null;
    if (cell.type === 'run') {
      rowTurn = cell.association === 'unassociated'
        ? null
        : (cell.userMessageId ? turnsByUserMessageId.get(cell.userMessageId) ?? rowTurn : rowTurn);
      currentRunId = cell.runId;
      currentRunTurn = rowTurn;
    } else if (cell.runId !== null) {
      rowTurn = cell.runId === currentRunId ? currentRunTurn : null;
    }
    return {
      cell,
      turnNumber: rowTurn,
      attemptNumber: cell.type === 'run' && cell.attemptIndex !== null
        ? cell.attemptIndex + 1
        : null,
    };
  });
}

export function TrajectoryLedger({
  cells,
  selectedCellKey,
  inspectTarget = null,
  viewportHeight,
  initialScrollTop = 0,
  onSelectCell,
  onInspectTargetResolved,
  onScrollTopChange,
  className,
}: TrajectoryLedgerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const resolvedInspectRequestRef = useRef<string | null>(null);
  const rows = useMemo(() => buildLedgerRows(cells), [cells]);
  const selectedIndex = rows.findIndex(row => row.cell.key === selectedCellKey);
  const [activeKey, setActiveKey] = useState<string | null>(() => (
    selectedIndex >= 0 ? rows[selectedIndex].cell.key : rows[0]?.cell.key ?? null
  ));
  const [scrollTop, setScrollTop] = useState(() => Math.max(0, initialScrollTop));
  const [measuredHeight, setMeasuredHeight] = useState(() => viewportHeight ?? 560);
  const [focusRequestIndex, setFocusRequestIndex] = useState<number | null>(null);
  const activeIndex = Math.max(0, rows.findIndex(row => row.cell.key === activeKey));
  const range = getVirtualRange({
    itemCount: rows.length,
    scrollTop,
    viewportHeight: measuredHeight,
  });

  useEffect(() => {
    if (selectedIndex >= 0) setActiveKey(rows[selectedIndex].cell.key);
  }, [rows, selectedIndex]);

  useEffect(() => {
    if (viewportHeight !== undefined) setMeasuredHeight(viewportHeight);
  }, [viewportHeight]);

  useLayoutEffect(() => {
    if (viewportHeight !== undefined) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () => {
      if (viewport.clientHeight > 0) setMeasuredHeight(viewport.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const height = entries[0]?.contentRect.height ?? viewport.clientHeight;
      if (height > 0) setMeasuredHeight(height);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewportHeight]);

  const scrollToIndex = useCallback((index: number, align: 'auto' | 'center' = 'auto') => {
    const viewport = viewportRef.current;
    const nextScrollTop = getScrollTopForIndex({
      itemCount: rows.length,
      index,
      currentScrollTop: viewport?.scrollTop ?? scrollTop,
      viewportHeight: measuredHeight,
      align,
    });
    if (viewport) viewport.scrollTop = nextScrollTop;
    setScrollTop(nextScrollTop);
    onScrollTopChange?.(nextScrollTop);
  }, [measuredHeight, onScrollTopChange, rows.length, scrollTop]);

  useEffect(() => {
    if (!inspectTarget) {
      resolvedInspectRequestRef.current = null;
      return;
    }
    if (resolvedInspectRequestRef.current === inspectTarget.requestId) return;
    const index = rows.findIndex(row => row.cell.key === inspectTarget.cellKey);
    if (index < 0) return;
    resolvedInspectRequestRef.current = inspectTarget.requestId;
    setActiveKey(rows[index].cell.key);
    scrollToIndex(index, 'center');
    setFocusRequestIndex(index);
    onInspectTargetResolved?.(inspectTarget, index, rows[index].cell);
  }, [inspectTarget, onInspectTargetResolved, rows, scrollToIndex]);

  useLayoutEffect(() => {
    if (focusRequestIndex === null) return;
    const target = viewportRef.current?.querySelector<HTMLElement>(
      `[data-trajectory-index="${focusRequestIndex}"]`,
    );
    if (!target) return;
    target.focus({ preventScroll: true });
    setFocusRequestIndex(null);
  }, [focusRequestIndex, range.startIndex, range.endIndex]);

  const moveToIndex = useCallback((index: number) => {
    if (rows.length === 0) return;
    const nextIndex = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[nextIndex];
    setActiveKey(row.cell.key);
    scrollToIndex(nextIndex, 'center');
    setFocusRequestIndex(nextIndex);
    onSelectCell?.(row.cell, nextIndex);
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
    setScrollTop(nextScrollTop);
    onScrollTopChange?.(nextScrollTop);
  };

  return (
    <div
      ref={viewportRef}
      role="listbox"
      aria-label="轨迹账本"
      aria-activedescendant={rows.length ? `trajectory-cell-${activeIndex + 1}` : undefined}
      onScroll={handleScroll}
      style={{ height: viewportHeight === undefined ? '100%' : `${viewportHeight}px` }}
      className={cn(
        'relative min-h-28 overflow-y-auto overscroll-contain rounded-lg border border-border/60 bg-background scroll-pt-20 scroll-pb-20',
        className,
      )}
    >
      {rows.length === 0 ? (
        <p className="flex h-full min-h-28 items-center justify-center px-4 text-sm text-muted-foreground">
          当前会话暂无轨迹记录
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
                onSelect={() => {
                  setActiveKey(row.cell.key);
                  onSelectCell?.(row.cell, index);
                }}
                onKeyDown={event => handleKeyDown(event, index)}
              />
            );
          })}
          <div aria-hidden="true" style={{ height: `${range.offsetBottom}px` }} />
        </>
      )}
    </div>
  );
}
