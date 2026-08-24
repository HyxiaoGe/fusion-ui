import type { TrajectorySpan } from '@/types/trajectory';

import type { TrajectoryCell } from './TrajectoryCellProjection';
import type { TrajectoryOverviewProjection } from './trajectoryOverviewModel';
import {
  projectTrajectoryTableRows,
  type TrajectoryTableRow,
} from './trajectoryTableModel';

export interface TrajectoryNetworkRange {
  start: number;
  end: number;
}

export interface TrajectoryNetworkViewInput {
  cells: readonly TrajectoryCell[];
  overview: TrajectoryOverviewProjection;
  searchQuery: string;
  range: TrajectoryNetworkRange | null;
}

export interface TrajectoryNetworkViewProjection {
  rows: TrajectoryTableRow[];
  rangeFocusedCellKeys: ReadonlySet<string> | null;
  searchMatchedCellKeys: ReadonlySet<string>;
  hasPendingRangeMatch: boolean;
}

/** 用同一份 Table 行投影同时驱动记录过滤与 Overview 搜索高亮。 */
export function projectTrajectoryNetworkView({
  cells,
  overview,
  searchQuery,
  range,
}: TrajectoryNetworkViewInput): TrajectoryNetworkViewProjection {
  const rangeFocusedCellKeys = range
    ? focusedCellKeysForRange(overview, cells, range)
    : null;
  const rows = projectTrajectoryTableRows({
    cells,
    searchQuery,
    focusedCellKeys: rangeFocusedCellKeys,
  });
  const searchMatchedCellKeys = new Set<string>();
  for (const row of rows) {
    if (!row.matched) continue;
    searchMatchedCellKeys.add(row.key);
    for (const alias of row.aliasedCellKeys) searchMatchedCellKeys.add(alias);
  }
  const hasPendingRangeMatch = Boolean(range && overview.runBands.some(band => (
    !band.hydrated && intervalsOverlap(band, range)
  )));
  return {
    rows,
    rangeFocusedCellKeys,
    searchMatchedCellKeys,
    hasPendingRangeMatch,
  };
}

function focusedCellKeysForRange(
  overview: TrajectoryOverviewProjection,
  cells: readonly TrajectoryCell[],
  range: TrajectoryNetworkRange,
): ReadonlySet<string> {
  const availableKeys = new Set(cells.map(cell => cell.key));
  const focusedRunId = overview.runBands.find(band => band.selected)?.runId ?? null;
  const keys = new Set<string>();
  for (const segment of overview.segments) {
    if (intervalsOverlap(segment, range) && availableKeys.has(segment.targetCellKey)) {
      keys.add(segment.targetCellKey);
    }
  }
  for (const band of overview.runBands) {
    if (!intervalsOverlap(band, range)) continue;
    if (band.runId === focusedRunId && band.hydrated) continue;
    const runKey = `run:${band.runId}`;
    if (availableKeys.has(runKey)) keys.add(runKey);
  }
  return keys;
}

function intervalsOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
): boolean {
  return left.end >= right.start && left.start <= right.end;
}

export interface ResolveTrajectorySelectedCellInput {
  cells: readonly TrajectoryCell[];
  localSelectedCellKey: string | null;
  selectedMessageId: string | null;
  selectedRunId: string | null;
  selectedSpan: TrajectorySpan | null;
}

/** 局部 cell 选择失效时，按 Redux span → Run → message 确定性回退。 */
export function resolveTrajectorySelectedCell({
  cells,
  localSelectedCellKey,
  selectedMessageId,
  selectedRunId,
  selectedSpan,
}: ResolveTrajectorySelectedCellInput): TrajectoryCell | null {
  if (localSelectedCellKey) {
    const localCell = cells.find(cell => cell.key === localSelectedCellKey) ?? null;
    if (localCell && cellBelongsToSelection(localCell, selectedMessageId, selectedRunId)) {
      return localCell;
    }
  }
  const spanCell = cellForSpan(cells, selectedSpan, selectedRunId);
  if (spanCell) return spanCell;
  if (selectedRunId) {
    const selectedRunCell = cells.find(cell => (
      cell.type === 'run' && cell.runId === selectedRunId
    ));
    if (selectedRunCell) return selectedRunCell;
  }
  if (!selectedMessageId) return null;
  return cells.find(cell => (
    (cell.type === 'user' && cell.userMessageId === selectedMessageId)
    || (cell.type === 'message' && cell.assistantMessageId === selectedMessageId)
  )) ?? null;
}

function cellBelongsToSelection(
  cell: TrajectoryCell,
  selectedMessageId: string | null,
  selectedRunId: string | null,
): boolean {
  if (selectedRunId) return cell.runId === selectedRunId;
  if (!selectedMessageId) return false;
  return (cell.type === 'user' && cell.userMessageId === selectedMessageId)
    || (cell.type === 'message' && cell.assistantMessageId === selectedMessageId);
}

function cellForSpan(
  cells: readonly TrajectoryCell[],
  span: TrajectorySpan | null,
  runId: string | null,
): TrajectoryCell | null {
  if (!span || !runId) return null;
  const sequences = new Set(span.record_sequences);
  return cells.find(cell => (
    cell.type !== 'run'
    && cell.runId === runId
    && cell.sourceSequences.some(sequence => sequences.has(sequence))
  )) ?? null;
}
