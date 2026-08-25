'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { NormalizedTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import {
  projectTrajectoryOverview,
  type OverviewSegment,
  type RunBand,
  type TrajectoryOverviewMode,
  type TrajectoryOverviewProjection,
  type TrajectoryOverviewTrack,
} from '@/lib/trajectory/trajectoryOverviewModel';
import type { TrajectoryCell } from '@/lib/trajectory/TrajectoryCellProjection';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import { cn } from '@/lib/utils';
import { formatTrajectoryStatus } from './TrajectoryCell';

export interface TrajectoryOverviewRange {
  start: number;
  end: number;
}

export interface TrajectoryOverviewProps {
  runs: readonly TrajectoryRunSummary[];
  focusedRunId: string | null;
  focusedRunEvents: readonly NormalizedTrajectoryEvent[];
  cells: readonly TrajectoryCell[];
  selectedCellKey?: string | null;
  searchMatchedCellKeys?: ReadonlySet<string>;
  range?: TrajectoryOverviewRange | null;
  mode?: TrajectoryOverviewMode;
  initialMode?: TrajectoryOverviewMode;
  projection?: TrajectoryOverviewProjection;
  onModeChange?: (mode: TrajectoryOverviewMode) => void;
  onSelectSegment?: (segment: OverviewSegment) => void;
  onSelectRun?: (runId: string) => void;
  onRequestRunFocus?: (runId: string) => void;
  onRangeChange?: (range: TrajectoryOverviewRange | null) => void;
  className?: string;
}

interface CanvasViewport {
  width: number;
  height: number;
  zoom: number;
  viewStart: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  currentX: number;
}

type CanvasHit =
  | { kind: 'segment'; segment: OverviewSegment }
  | { kind: 'run'; band: RunBand }
  | null;

const CANVAS_HEIGHT = 54;
const RUN_BAND_TOP = 0;
const RUN_BAND_HEIGHT = 8;
const TRACK_TOP: Record<TrajectoryOverviewTrack, number> = {
  input: 8,
  model: 23,
  tools: 38,
};
const TRACK_HEIGHT = 14;
const TRACK_LABEL_WIDTH = 48;
const MAX_RENDERED_SEGMENTS = 400;
const MAX_SEARCH_SEGMENTS = 48;
const TRACK_LABEL: Record<TrajectoryOverviewTrack, string> = {
  input: 'Input',
  model: 'Model',
  tools: 'Tools',
};
const MAX_ZOOM = 8;
const EMPTY_SEARCH_MATCHES: ReadonlySet<string> = new Set();

export function TrajectoryOverview({
  runs,
  focusedRunId,
  focusedRunEvents,
  cells,
  selectedCellKey = null,
  searchMatchedCellKeys = EMPTY_SEARCH_MATCHES,
  range: controlledRange,
  mode: controlledMode,
  initialMode = 'sequence',
  projection: controlledProjection,
  onModeChange,
  onSelectSegment,
  onSelectRun,
  onRequestRunFocus,
  onRangeChange,
  className,
}: TrajectoryOverviewProps) {
  const interactionRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rangeStartHandleRef = useRef<HTMLInputElement>(null);
  const focusNewRangeRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);
  const previousSelectedCellKeyRef = useRef(selectedCellKey);
  const [internalMode, setInternalMode] = useState<TrajectoryOverviewMode>(initialMode);
  const mode = controlledMode ?? internalMode;
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [internalRange, setInternalRange] = useState<TrajectoryOverviewRange | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [, setDragRenderVersion] = useState(0);
  const currentRange = controlledRange === undefined ? internalRange : controlledRange;
  const projection = useMemo(() => controlledProjection ?? projectTrajectoryOverview({
    runs,
    focusedRunId,
    focusedRunEvents,
    cells,
    mode,
  }), [cells, controlledProjection, focusedRunEvents, focusedRunId, mode, runs]);
  const visibleSegments = useMemo(() => {
    const viewEnd = viewStart + 1 / zoom;
    return projection.segments.filter(segment => segment.end >= viewStart && segment.start <= viewEnd);
  }, [projection.segments, viewStart, zoom]);
  const renderedSegments = useMemo(() => selectRenderedOverviewSegments({
    segments: visibleSegments,
    activeKey,
    selectedCellKey,
    searchMatchedCellKeys,
  }), [activeKey, searchMatchedCellKeys, selectedCellKey, visibleSegments]);
  const interactiveProjection = useMemo(() => ({
    ...projection,
    segments: renderedSegments,
  }), [projection, renderedSegments]);
  const activeSegment = projection.segments.find(segment => segment.key === activeKey) ?? null;

  useEffect(() => {
    const selectionChanged = previousSelectedCellKeyRef.current !== selectedCellKey;
    previousSelectedCellKeyRef.current = selectedCellKey;
    setActiveKey(current => {
      const selected = projection.segments.find(segment => segment.targetCellKey === selectedCellKey);
      if (selectionChanged && selected) return selected.key;
      if (current && projection.segments.some(segment => segment.key === current)) return current;
      return selected?.key ?? projection.segments[0]?.key ?? null;
    });
  }, [projection.segments, selectedCellKey]);

  useEffect(() => {
    if (!pendingRunId) return;
    const pendingBand = projection.runBands.find(item => item.runId === pendingRunId);
    if (focusedRunId === pendingRunId && pendingBand?.hydrated) setPendingRunId(null);
  }, [focusedRunId, pendingRunId, projection.runBands]);

  useEffect(() => {
    if (!currentRange || !focusNewRangeRef.current) return;
    focusNewRangeRef.current = false;
    rangeStartHandleRef.current?.focus();
  }, [currentRange]);

  const setRange = useCallback((nextRange: TrajectoryOverviewRange | null) => {
    if (controlledRange === undefined) setInternalRange(nextRange);
    onRangeChange?.(nextRange);
  }, [controlledRange, onRangeChange]);

  const requestRunFocus = useCallback((band: RunBand) => {
    onSelectRun?.(band.runId);
    if (!band.hydrated) {
      setPendingRunId(band.runId);
      onRequestRunFocus?.(band.runId);
    }
  }, [onRequestRunFocus, onSelectRun]);

  const requestFocusForRange = useCallback((nextRange: TrajectoryOverviewRange) => {
    const missingBand = projection.runBands.find(band => (
      !band.hydrated && band.end >= nextRange.start && band.start <= nextRange.end
    ));
    if (!missingBand) return;
    setPendingRunId(missingBand.runId);
    onRequestRunFocus?.(missingBand.runId);
  }, [onRequestRunFocus, projection.runBands]);

  const canvasViewport = useCallback((): CanvasViewport => {
    const rect = interactionRef.current?.getBoundingClientRect();
    return {
      width: Math.max(1, rect?.width ? rect.width - TRACK_LABEL_WIDTH : 1_000),
      height: Math.max(1, rect?.height || 160),
      zoom,
      viewStart,
    };
  }, [viewStart, zoom]);

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) return;
    let completedSynchronously = false;
    const frameId = window.requestAnimationFrame(() => {
      completedSynchronously = true;
      frameRef.current = null;
      setDragRenderVersion(current => current + 1);
    });
    if (!completedSynchronously) frameRef.current = frameId;
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const completePointerInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.currentX = pointerPlotX(event.clientX, rect);
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(drag.pointerId);
    const viewport = canvasViewport();
    if (Math.abs(drag.currentX - drag.startX) >= 4) {
      const first = canvasXToDomain(drag.startX, viewport);
      const second = canvasXToDomain(drag.currentX, viewport);
      const nextRange = normalizeRange(first, second);
      setRange(nextRange);
      requestFocusForRange(nextRange);
      scheduleDraw();
      return;
    }
    const hit = hitTestTrajectoryOverview(
      interactiveProjection,
      drag.currentX,
      event.clientY - rect.top,
      viewport,
    );
    if (hit?.kind === 'segment') {
      setActiveKey(hit.segment.key);
      onSelectSegment?.(hit.segment);
    } else if (hit?.kind === 'run') requestRunFocus(hit.band);
    scheduleDraw();
  }, [
    canvasViewport,
    onSelectSegment,
    interactiveProjection,
    requestFocusForRange,
    requestRunFocus,
    scheduleDraw,
    setRange,
  ]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX - rect.left < TRACK_LABEL_WIDTH) return;
    const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 1;
    const plotX = pointerPlotX(event.clientX, rect);
    dragRef.current = {
      pointerId,
      startX: plotX,
      currentX: plotX,
    };
    event.currentTarget.setPointerCapture?.(pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rootX = event.clientX - rect.left;
    if (rootX < TRACK_LABEL_WIDTH) {
      hoveredKeyRef.current = null;
      if (tooltipRef.current) tooltipRef.current.hidden = true;
      return;
    }
    const x = pointerPlotX(event.clientX, rect);
    const y = event.clientY - rect.top;
    if (dragRef.current) {
      dragRef.current.currentX = x;
      scheduleDraw();
      return;
    }
    const hit = hitTestTrajectoryOverview(interactiveProjection, x, y, canvasViewport());
    const segment = hit?.kind === 'segment' ? hit.segment : null;
    if (hoveredKeyRef.current === segment?.key) return;
    hoveredKeyRef.current = segment?.key ?? null;
    if (tooltipRef.current) {
      tooltipRef.current.hidden = segment === null;
      tooltipRef.current.textContent = segment ? segmentAccessibleText(segment) : '';
      tooltipRef.current.style.left = `${Math.min(rect.width - 12, rootX + 12)}px`;
      tooltipRef.current.style.top = `${Math.min(rect.height - 8, y + 8)}px`;
    }
  };

  const clearRange = useCallback(() => {
    dragRef.current = null;
    setPendingRunId(null);
    setRange(null);
    scheduleDraw();
  }, [scheduleDraw, setRange]);

  const createRange = () => {
    const visibleWidth = 1 / zoom;
    const nextRange = normalizeRange(
      viewStart + visibleWidth * 0.25,
      viewStart + visibleWidth * 0.75,
    );
    focusNewRangeRef.current = true;
    setRange(nextRange);
    requestFocusForRange(nextRange);
  };

  const panView = useCallback((direction: -1 | 1) => {
    if (zoom <= 1) return;
    const maximum = 1 - 1 / zoom;
    const step = 0.5 / zoom;
    setViewStart(current => roundDomain(clamp(current + direction * step, 0, maximum)));
  }, [zoom]);

  const onCanvasKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearRange();
      return;
    }
    if (zoom > 1 && event.shiftKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      panView(-1);
      return;
    }
    if (zoom > 1 && event.shiftKey && event.key === 'ArrowRight') {
      event.preventDefault();
      panView(1);
      return;
    }
    if (renderedSegments.length === 0) return;
    const currentIndex = renderedSegments.findIndex(segment => segment.key === activeKey);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = renderedSegments.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = Math.min(renderedSegments.length - 1, nextIndex + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = Math.max(0, nextIndex - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const selected = renderedSegments[currentIndex < 0 ? 0 : currentIndex];
      if (selected) onSelectSegment?.(selected);
      return;
    } else return;
    event.preventDefault();
    setActiveKey(renderedSegments[nextIndex].key);
  };

  const updateZoom = (nextZoom: number) => {
    const clampedZoom = clamp(nextZoom, 1, MAX_ZOOM);
    const anchor = activeSegment ? (activeSegment.start + activeSegment.end) / 2 : viewStart + 1 / zoom / 2;
    setZoom(clampedZoom);
    setViewStart(clamp(anchor - 1 / clampedZoom / 2, 0, 1 - 1 / clampedZoom));
  };

  const resetView = () => {
    setZoom(1);
    setViewStart(0);
  };

  const updateRangeHandle = (
    handle: 'start' | 'end',
    value: number,
  ) => {
    if (!currentRange) return;
    const normalized = clamp(value, 0, 1);
    const nextRange = handle === 'start'
      ? { start: Math.min(normalized, currentRange.end), end: currentRange.end }
      : { start: currentRange.start, end: Math.max(normalized, currentRange.start) };
    setRange(nextRange);
    requestFocusForRange(nextRange);
  };

  const onRangeHandleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    handle: 'start' | 'end',
  ) => {
    if (!currentRange) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      clearRange();
      return;
    }
    const current = currentRange[handle];
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - 0.01 / zoom;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + 0.01 / zoom;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    if (next === null) return;
    event.preventDefault();
    updateRangeHandle(handle, roundDomain(next));
  };

  const pendingRunNumber = pendingRunId
    ? projection.runBands.findIndex(item => item.runId === pendingRunId) + 1
    : 0;
  const activeText = activeSegment ? segmentAccessibleText(activeSegment) : '当前没有可见详细记录';
  const maximumViewStart = 1 - 1 / zoom;
  const canPanLeft = zoom > 1 && viewStart > 0;
  const canPanRight = zoom > 1 && viewStart < maximumViewStart;
  const changeMode = (nextMode: TrajectoryOverviewMode) => {
    if (controlledMode === undefined) setInternalMode(nextMode);
    onModeChange?.(nextMode);
  };

  return (
    <section
      aria-label="轨迹记录总览"
      className={cn('border-y border-border/60 bg-background', className)}
    >
      <div className="flex h-8 items-center gap-1.5 border-b border-border/50 px-2">
        <div className="inline-flex rounded-md border border-border/60 bg-muted/20 p-0.5" aria-label="投影模式">
          <ModeButton active={mode === 'sequence'} onClick={() => changeMode('sequence')}>顺序</ModeButton>
          <ModeButton active={mode === 'actual'} onClick={() => changeMode('actual')}>实际耗时</ModeButton>
        </div>
        <div className="inline-flex items-center gap-1" aria-label="缩放与平移控制">
          <ToolbarButton label="缩小" onClick={() => updateZoom(zoom / 2)} disabled={zoom === 1}>
            <Minus className="h-4 w-4" aria-hidden="true" />
          </ToolbarButton>
          <span className="min-w-8 text-center text-xs tabular-nums text-muted-foreground">{zoom}×</span>
          <ToolbarButton label="放大" onClick={() => updateZoom(zoom * 2)} disabled={zoom === MAX_ZOOM}>
            <Plus className="h-4 w-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="重置缩放" onClick={resetView}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="向左平移" onClick={() => panView(-1)} disabled={!canPanLeft}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="向右平移" onClick={() => panView(1)} disabled={!canPanRight}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </ToolbarButton>
        </div>
        <span className="ml-1 text-[11px] text-muted-foreground">
          {searchMatchedCellKeys.size > 0 ? `${searchMatchedCellKeys.size} 条搜索匹配` : '无搜索匹配'}
        </span>
        {currentRange ? (
          <button
            type="button"
            onClick={clearRange}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded border border-border/60 px-2 text-[11px] text-foreground outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            清除范围
          </button>
        ) : (
          <button
            type="button"
            onClick={createRange}
            className="ml-auto inline-flex h-7 items-center rounded border border-border/60 px-2 text-[11px] text-foreground outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            创建范围
          </button>
        )}
      </div>

      <div
        ref={interactionRef}
        role="application"
        tabIndex={0}
        aria-label={`轨迹记录总览，${mode === 'sequence' ? '顺序模式' : '实际耗时模式'}`}
        aria-describedby="trajectory-overview-instructions trajectory-overview-active"
        data-testid="trajectory-overview-tracks"
        className="relative h-[54px] touch-none overflow-visible bg-muted/10 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onKeyDown={onCanvasKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={completePointerInteraction}
        onPointerCancel={() => {
          dragRef.current = null;
          scheduleDraw();
        }}
        onPointerLeave={() => {
          hoveredKeyRef.current = null;
          if (tooltipRef.current) {
            tooltipRef.current.hidden = true;
            tooltipRef.current.textContent = '';
          }
        }}
        onContextMenu={event => {
          event.preventDefault();
          clearRange();
        }}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 border-r border-border/50 bg-background/95">
          {(['input', 'model', 'tools'] as const).map(track => (
            <span
              key={track}
              className="absolute left-1.5 text-[10px] font-medium text-muted-foreground"
              style={{ top: `${TRACK_TOP[track] + 1}px` }}
            >
              {TRACK_LABEL[track]}
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-12 right-0 overflow-hidden">
          {(['input', 'model', 'tools'] as const).map(track => (
            <span
              key={track}
              aria-hidden="true"
              className="absolute left-0 right-0 border-y border-border/20 bg-muted/25"
              style={{ top: `${TRACK_TOP[track]}px`, height: `${TRACK_HEIGHT}px` }}
            />
          ))}
          {projection.runBands.map(band => (
            <span
              key={band.runId}
              aria-hidden="true"
              className={cn(
                'absolute inset-y-0 border-x border-border/40',
                band.selected ? 'bg-primary/[0.035]' : 'bg-transparent',
              )}
              style={overviewBandStyle(band.start, band.end, viewStart, zoom)}
            />
          ))}
          {renderedSegments.map(segment => (
            <span
              key={segment.key}
              data-testid="trajectory-overview-segment"
              data-track={segment.track}
              aria-hidden="true"
              title={segmentAccessibleText(segment)}
              className={cn(
                'absolute min-w-px rounded-[2px] border border-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.04)]',
                (segment.key === activeKey || segment.targetCellKey === selectedCellKey)
                  && 'z-10 border-warn ring-1 ring-warn/70',
                searchMatchedCellKeys.has(segment.targetCellKey)
                  && 'z-10 border-info ring-1 ring-info/70',
              )}
              style={overviewSegmentStyle(segment, viewStart, zoom)}
            />
          ))}
          {(dragRef.current || currentRange) ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 z-20 border-x-2 border-warn bg-warn/10"
              style={overviewRangeStyle(
                dragRef.current
                  ? normalizeRange(
                    canvasXToDomain(dragRef.current.startX, canvasViewport()),
                    canvasXToDomain(dragRef.current.currentX, canvasViewport()),
                  )
                  : currentRange,
                viewStart,
                zoom,
              )}
            />
          ) : null}
        </div>
        <span id="trajectory-overview-instructions" className="sr-only">
          方向键移动活动记录，Home 和 End 跳到首尾，Enter 或空格选择。放大后按 Shift 加左右方向键平移。拖动可选择范围。
        </span>
        <div
          ref={tooltipRef}
          role="tooltip"
          hidden
          className="pointer-events-none absolute z-30 max-w-80 rounded-md border border-border/60 bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-sm"
        />
      </div>

      <div className="sr-only">
        <p id="trajectory-overview-active" data-testid="trajectory-overview-active" aria-live="polite">
          {activeText}
        </p>
      </div>

      {currentRange && (
        <div className="grid gap-2 border-t border-border/50 px-2 py-1.5 sm:grid-cols-2" aria-label="范围键盘控制">
          <RangeHandle
            inputRef={rangeStartHandleRef}
            label="范围起点"
            value={currentRange.start}
            onChange={value => updateRangeHandle('start', value)}
            onKeyDown={event => onRangeHandleKeyDown(event, 'start')}
          />
          <RangeHandle
            label="范围终点"
            value={currentRange.end}
            onChange={value => updateRangeHandle('end', value)}
            onKeyDown={event => onRangeHandleKeyDown(event, 'end')}
          />
        </div>
      )}

      {pendingRunId && (
        <p role="status" className="border-t border-info-border bg-info-bg px-2.5 py-1.5 text-xs text-info">
          正在聚焦运行 {pendingRunNumber || pendingRunId}，加载后再匹配详细记录
        </p>
      )}
    </section>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-6 rounded px-2 text-[11px] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-background text-foreground shadow-sm',
      )}
    >
      {children}
    </button>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded border border-border/60 text-muted-foreground outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RangeHandle({
  inputRef,
  label,
  value,
  onChange,
  onKeyDown,
}: {
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  value: number;
  onChange: (value: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-md border border-border/50 px-2.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <input
        ref={inputRef}
        type="range"
        aria-label={label}
        min={0}
        max={1_000}
        step={10}
        value={Math.round(value * 1_000)}
        onChange={event => onChange(Number(event.currentTarget.value) / 1_000)}
        onKeyDown={onKeyDown}
        className="min-h-6 min-w-0 flex-1 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="w-10 text-right text-xs tabular-nums text-foreground">{Math.round(value * 100)}%</span>
    </label>
  );
}

export function hitTestTrajectoryOverview(
  projection: TrajectoryOverviewProjection,
  x: number,
  y: number,
  viewport: CanvasViewport,
): CanvasHit {
  const logicalY = viewport.height > 0 ? y / viewport.height * CANVAS_HEIGHT : y;
  for (let index = projection.segments.length - 1; index >= 0; index -= 1) {
    const segment = projection.segments[index];
    const left = domainToCanvasX(segment.start, viewport);
    const right = domainToCanvasX(segment.end, viewport);
    const top = TRACK_TOP[segment.track];
    if (x >= left && x <= right && logicalY >= top && logicalY <= top + TRACK_HEIGHT) {
      return { kind: 'segment', segment };
    }
  }
  if (logicalY >= RUN_BAND_TOP && logicalY <= RUN_BAND_TOP + RUN_BAND_HEIGHT) {
    const domain = canvasXToDomain(x, viewport);
    const band = projection.runBands.find(item => domain >= item.start && domain <= item.end);
    if (band) return { kind: 'run', band };
  }
  return null;
}

function pointerPlotX(clientX: number, rect: DOMRect): number {
  return clamp(
    clientX - rect.left - TRACK_LABEL_WIDTH,
    0,
    Math.max(1, rect.width - TRACK_LABEL_WIDTH),
  );
}

function selectRenderedOverviewSegments(input: {
  segments: readonly OverviewSegment[];
  activeKey: string | null;
  selectedCellKey: string | null;
  searchMatchedCellKeys: ReadonlySet<string>;
}): OverviewSegment[] {
  if (input.segments.length <= MAX_RENDERED_SEGMENTS) return [...input.segments];
  const selected = new Map<string, OverviewSegment>();
  const add = (segment: OverviewSegment | undefined) => {
    if (segment && selected.size < MAX_RENDERED_SEGMENTS) selected.set(segment.key, segment);
  };

  add(input.segments.find(segment => segment.key === input.activeKey));
  add(input.segments.find(segment => segment.targetCellKey === input.selectedCellKey));
  for (const segment of evenlySampleSegments(
    input.segments.filter(item => input.searchMatchedCellKeys.has(item.targetCellKey)),
    MAX_SEARCH_SEGMENTS,
  )) add(segment);
  for (const segment of evenlySampleSegments(
    input.segments,
    MAX_RENDERED_SEGMENTS - selected.size,
  )) add(segment);
  if (selected.size < MAX_RENDERED_SEGMENTS) {
    for (const segment of input.segments) add(segment);
  }

  const order = new Map(input.segments.map((segment, index) => [segment.key, index]));
  return [...selected.values()].sort((left, right) => (
    (order.get(left.key) ?? 0) - (order.get(right.key) ?? 0)
  ));
}

function evenlySampleSegments(
  segments: readonly OverviewSegment[],
  maximum: number,
): OverviewSegment[] {
  const count = Math.min(Math.max(0, maximum), segments.length);
  if (count === 0) return [];
  if (count === segments.length) return [...segments];
  if (count === 1) return [segments.at(-1) as OverviewSegment];
  return Array.from({ length: count }, (_, index) => (
    segments[Math.round(index * (segments.length - 1) / (count - 1))]
  ));
}

function segmentAccessibleText(segment: OverviewSegment): string {
  const sequence = segment.startSequence === segment.endSequence
    ? `sequence ${segment.startSequence}`
    : `sequence ${segment.startSequence} 至 ${segment.endSequence}`;
  const time = segment.startedAt
    ? `，${formatExactTime(segment.startedAt)}${segment.endedAt && segment.endedAt !== segment.startedAt ? ` 至 ${formatExactTime(segment.endedAt)}` : ''}`
    : '';
  return `${TRACK_LABEL[segment.track]}，${segment.label}，${formatTrajectoryStatus(segment.status)}，${sequence}${time}`;
}

function overviewBandStyle(
  start: number,
  end: number,
  viewStart: number,
  zoom: number,
): React.CSSProperties {
  return {
    left: `${(start - viewStart) * zoom * 100}%`,
    width: `${Math.max(0.15, (end - start) * zoom * 100)}%`,
  };
}

function overviewSegmentStyle(
  segment: OverviewSegment,
  viewStart: number,
  zoom: number,
): React.CSSProperties {
  return {
    ...overviewBandStyle(segment.start, segment.end, viewStart, zoom),
    backgroundColor: segment.track === 'input'
      ? 'var(--info)'
      : segment.track === 'model'
        ? 'var(--primary)'
        : 'var(--success)',
    top: `${TRACK_TOP[segment.track] + 1}px`,
    height: `${TRACK_HEIGHT - 2}px`,
  };
}

function overviewRangeStyle(
  range: TrajectoryOverviewRange | null,
  viewStart: number,
  zoom: number,
): React.CSSProperties {
  if (!range) return { display: 'none' };
  return overviewBandStyle(range.start, range.end, viewStart, zoom);
}

function formatExactTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '时刻未知';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(timestamp);
}

function domainToCanvasX(value: number, viewport: CanvasViewport): number {
  return (value - viewport.viewStart) * viewport.zoom * viewport.width;
}

function canvasXToDomain(value: number, viewport: CanvasViewport): number {
  return clamp(viewport.viewStart + value / viewport.width / viewport.zoom, 0, 1);
}

function normalizeRange(first: number, second: number): TrajectoryOverviewRange {
  return {
    start: roundDomain(Math.min(first, second)),
    end: roundDomain(Math.max(first, second)),
  };
}

function roundDomain(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1_000_000) / 1_000_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
