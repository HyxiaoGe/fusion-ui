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
  initialMode?: TrajectoryOverviewMode;
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

interface CanvasPalette {
  background: string;
  foreground: string;
  border: string;
  muted: string;
  input: string;
  model: string;
  tools: string;
  selected: string;
  search: string;
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

const CANVAS_HEIGHT = 160;
const RUN_BAND_TOP = 8;
const RUN_BAND_HEIGHT = 26;
const TRACK_TOP: Record<TrajectoryOverviewTrack, number> = {
  input: 48,
  model: 82,
  tools: 116,
};
const TRACK_HEIGHT = 24;
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
  initialMode = 'sequence',
  onSelectSegment,
  onSelectRun,
  onRequestRunFocus,
  onRangeChange,
  className,
}: TrajectoryOverviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rangeStartHandleRef = useRef<HTMLInputElement>(null);
  const focusNewRangeRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const drawRef = useRef<() => void>(() => {});
  const dragRef = useRef<DragState | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);
  const [mode, setMode] = useState<TrajectoryOverviewMode>(initialMode);
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [internalRange, setInternalRange] = useState<TrajectoryOverviewRange | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const currentRange = controlledRange === undefined ? internalRange : controlledRange;
  const projection = useMemo(() => projectTrajectoryOverview({
    runs,
    focusedRunId,
    focusedRunEvents,
    cells,
    mode,
  }), [cells, focusedRunEvents, focusedRunId, mode, runs]);
  const visibleSegments = useMemo(() => {
    const viewEnd = viewStart + 1 / zoom;
    return projection.segments.filter(segment => segment.end >= viewStart && segment.start <= viewEnd);
  }, [projection.segments, viewStart, zoom]);
  const activeSegment = projection.segments.find(segment => segment.key === activeKey) ?? null;

  useEffect(() => {
    setActiveKey(current => {
      if (current && projection.segments.some(segment => segment.key === current)) return current;
      const selected = projection.segments.find(segment => segment.targetCellKey === selectedCellKey);
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
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      width: Math.max(1, rect?.width ?? 1),
      height: Math.max(1, rect?.height ?? CANVAS_HEIGHT),
      zoom,
      viewStart,
    };
  }, [viewStart, zoom]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const viewport = canvasViewport();
    const pixelRatio = window.devicePixelRatio || 1;
    const desiredWidth = Math.max(1, Math.round(viewport.width * pixelRatio));
    const desiredHeight = Math.max(1, Math.round(viewport.height * pixelRatio));
    if (canvas.width !== desiredWidth || canvas.height !== desiredHeight) {
      canvas.width = desiredWidth;
      canvas.height = desiredHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawOverviewCanvas(context, projection, viewport, resolveCanvasPalette(canvas), {
      activeKey,
      selectedCellKey,
      searchMatchedCellKeys,
      range: currentRange,
      drag: dragRef.current,
    });
  }, [
    activeKey,
    canvasViewport,
    currentRange,
    projection,
    searchMatchedCellKeys,
    selectedCellKey,
  ]);

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) return;
    let completedSynchronously = false;
    const frameId = window.requestAnimationFrame(() => {
      completedSynchronously = true;
      frameRef.current = null;
      drawRef.current();
    });
    if (!completedSynchronously) frameRef.current = frameId;
  }, []);

  drawRef.current = draw;

  useEffect(() => {
    scheduleDraw();
  }, [draw, scheduleDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [scheduleDraw]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const completePointerInteraction = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.currentX = event.clientX - rect.left;
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
      projection,
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
    projection,
    requestFocusForRange,
    requestRunFocus,
    scheduleDraw,
    setRange,
  ]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 1;
    dragRef.current = {
      pointerId,
      startX: event.clientX - rect.left,
      currentX: event.clientX - rect.left,
    };
    event.currentTarget.setPointerCapture?.(pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (dragRef.current) {
      dragRef.current.currentX = x;
      scheduleDraw();
      return;
    }
    const hit = hitTestTrajectoryOverview(projection, x, y, canvasViewport());
    const segment = hit?.kind === 'segment' ? hit.segment : null;
    if (hoveredKeyRef.current === segment?.key) return;
    hoveredKeyRef.current = segment?.key ?? null;
    if (tooltipRef.current) {
      tooltipRef.current.hidden = segment === null;
      tooltipRef.current.textContent = segment ? segmentAccessibleText(segment) : '';
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

  const onCanvasKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
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
    if (visibleSegments.length === 0) return;
    const currentIndex = visibleSegments.findIndex(segment => segment.key === activeKey);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = visibleSegments.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = Math.min(visibleSegments.length - 1, nextIndex + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = Math.max(0, nextIndex - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const selected = visibleSegments[currentIndex < 0 ? 0 : currentIndex];
      if (selected) onSelectSegment?.(selected);
      return;
    } else return;
    event.preventDefault();
    setActiveKey(visibleSegments[nextIndex].key);
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

  return (
    <section
      aria-label="轨迹记录总览"
      className={cn('space-y-3 rounded-lg border border-border/60 bg-background p-3', className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border/60 bg-muted/20 p-0.5" aria-label="投影模式">
          <ModeButton active={mode === 'sequence'} onClick={() => setMode('sequence')}>顺序</ModeButton>
          <ModeButton active={mode === 'actual'} onClick={() => setMode('actual')}>实际耗时</ModeButton>
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
        <span className="text-xs text-muted-foreground">
          {searchMatchedCellKeys.size > 0 ? `${searchMatchedCellKeys.size} 条搜索匹配` : '无搜索匹配'}
        </span>
        {currentRange ? (
          <button
            type="button"
            onClick={clearRange}
            className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-md border border-border/60 px-2.5 text-xs text-foreground outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            清除范围
          </button>
        ) : (
          <button
            type="button"
            onClick={createRange}
            className="ml-auto inline-flex min-h-9 items-center rounded-md border border-border/60 px-2.5 text-xs text-foreground outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          >
            创建范围
          </button>
        )}
      </div>

      <div className="relative overflow-hidden rounded-md border border-border/50 bg-muted/10">
        <canvas
          ref={canvasRef}
          role="application"
          tabIndex={0}
          aria-label={`轨迹记录总览，${mode === 'sequence' ? '顺序模式' : '实际耗时模式'}`}
          aria-describedby="trajectory-overview-instructions trajectory-overview-active"
          className="block h-40 w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
        />
        <span id="trajectory-overview-instructions" className="sr-only">
          方向键移动活动记录，Home 和 End 跳到首尾，Enter 或空格选择。放大后按 Shift 加左右方向键平移。拖动可选择范围。
        </span>
      </div>

      <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
        <p id="trajectory-overview-active" data-testid="trajectory-overview-active" aria-live="polite">
          {activeText}
        </p>
        <span className="shrink-0">Input / Model / Tools</span>
      </div>

      <div
        ref={tooltipRef}
        role="tooltip"
        hidden
        className="rounded-md border border-border/60 bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-sm"
      />

      {currentRange && (
        <div className="grid gap-2 sm:grid-cols-2" aria-label="范围键盘控制">
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
        <p role="status" className="rounded-md border border-info-border bg-info-bg px-2.5 py-2 text-xs text-info">
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
        'min-h-9 rounded px-3 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-muted-foreground outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
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
  for (let index = projection.segments.length - 1; index >= 0; index -= 1) {
    const segment = projection.segments[index];
    const left = domainToCanvasX(segment.start, viewport);
    const right = domainToCanvasX(segment.end, viewport);
    const top = TRACK_TOP[segment.track];
    if (x >= left && x <= right && y >= top && y <= top + TRACK_HEIGHT) {
      return { kind: 'segment', segment };
    }
  }
  if (y >= RUN_BAND_TOP && y <= RUN_BAND_TOP + RUN_BAND_HEIGHT) {
    const domain = canvasXToDomain(x, viewport);
    const band = projection.runBands.find(item => domain >= item.start && domain <= item.end);
    if (band) return { kind: 'run', band };
  }
  return null;
}

function drawOverviewCanvas(
  context: CanvasRenderingContext2D,
  projection: TrajectoryOverviewProjection,
  viewport: CanvasViewport,
  palette: CanvasPalette,
  state: {
    activeKey: string | null;
    selectedCellKey: string | null;
    searchMatchedCellKeys: ReadonlySet<string>;
    range: TrajectoryOverviewRange | null;
    drag: DragState | null;
  },
) {
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.fillStyle = palette.background;
  context.fillRect(0, 0, viewport.width, viewport.height);
  context.font = '11px system-ui, sans-serif';
  context.textBaseline = 'middle';

  for (const band of projection.runBands) {
    const left = domainToCanvasX(band.start, viewport);
    const right = domainToCanvasX(band.end, viewport);
    if (right < 0 || left > viewport.width) continue;
    context.fillStyle = band.selected ? palette.selected : palette.muted;
    context.fillRect(left, RUN_BAND_TOP, Math.max(1, right - left), RUN_BAND_HEIGHT);
    context.strokeStyle = palette.border;
    context.strokeRect(left, RUN_BAND_TOP, Math.max(1, right - left), RUN_BAND_HEIGHT);
    context.fillStyle = palette.foreground;
    const bandLabel = `Run · ${formatTrajectoryStatus(band.status)}${band.hydrated ? '' : ' · 待加载'}`;
    context.fillText(bandLabel, left + 6, RUN_BAND_TOP + RUN_BAND_HEIGHT / 2);
  }

  for (const track of ['input', 'model', 'tools'] as const) {
    const top = TRACK_TOP[track];
    context.fillStyle = palette.muted;
    context.fillRect(0, top, viewport.width, TRACK_HEIGHT);
    context.fillStyle = palette.foreground;
    context.fillText(TRACK_LABEL[track], 6, top + TRACK_HEIGHT / 2);
  }

  for (const segment of projection.segments) {
    const left = domainToCanvasX(segment.start, viewport);
    const right = domainToCanvasX(segment.end, viewport);
    if (right < 0 || left > viewport.width) continue;
    const width = Math.max(2, right - left);
    const top = TRACK_TOP[segment.track];
    context.fillStyle = palette[segment.track];
    context.fillRect(left, top, width, TRACK_HEIGHT);
    if (segment.key === state.activeKey || segment.targetCellKey === state.selectedCellKey) {
      context.strokeStyle = palette.selected;
      context.lineWidth = 2;
      context.strokeRect(left + 1, top + 1, Math.max(1, width - 2), TRACK_HEIGHT - 2);
    } else if (state.searchMatchedCellKeys.has(segment.targetCellKey)) {
      context.strokeStyle = palette.search;
      context.lineWidth = 2;
      context.strokeRect(left + 1, top + 1, Math.max(1, width - 2), TRACK_HEIGHT - 2);
    }
    if (width >= 48) {
      context.fillStyle = palette.foreground;
      context.fillText(segment.label, left + 5, top + TRACK_HEIGHT / 2);
    }
  }

  const visualRange = state.drag
    ? normalizeRange(
      canvasXToDomain(state.drag.startX, viewport),
      canvasXToDomain(state.drag.currentX, viewport),
    )
    : state.range;
  if (visualRange) {
    const left = domainToCanvasX(visualRange.start, viewport);
    const right = domainToCanvasX(visualRange.end, viewport);
    context.strokeStyle = palette.selected;
    context.lineWidth = 2;
    context.strokeRect(left, 1, Math.max(1, right - left), viewport.height - 2);
  }
}

function resolveCanvasPalette(canvas: HTMLCanvasElement): CanvasPalette {
  const style = getComputedStyle(canvas);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const foreground = token('--foreground', style.color || 'CanvasText');
  const primary = token('--primary', foreground);
  return {
    background: token('--background', style.backgroundColor || 'Canvas'),
    foreground,
    border: token('--border', 'GrayText'),
    muted: token('--muted', token('--secondary', 'Canvas')),
    input: token('--info', primary),
    model: primary,
    tools: token('--success', primary),
    selected: token('--warn', primary),
    search: token('--info', primary),
  };
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
