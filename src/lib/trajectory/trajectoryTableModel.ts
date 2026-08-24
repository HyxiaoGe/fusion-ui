import { extractTextFromBlocks } from '@/types/conversation';
import type { TrajectoryCell } from './TrajectoryCellProjection';
import { getTrajectoryCellPresentation } from './trajectoryCellPresentation';

export interface TrajectoryTableRow {
  key: string;
  cell: TrajectoryCell;
  sourceIndex: number;
  turnNumber: number | null;
  attemptNumber: number | null;
  kindLabel: string;
  summary: string;
  statusLabel: string | null;
  trajectoryStatusLabel: string | null;
  durationMs: number | null;
  searchText: string;
  matched: boolean;
  attemptCount: number;
}

export interface TrajectoryTableModelInput {
  cells: readonly TrajectoryCell[];
  searchQuery?: string;
  focusedCellKeys?: ReadonlySet<string> | null;
}

interface MutableTableRow extends TrajectoryTableRow {
  directSearchMatch: boolean;
  directFocusMatch: boolean;
}

const KIND_LABELS: Record<TrajectoryCell['type'], string> = {
  user: '用户',
  message: '消息',
  run: '运行',
  plan: '计划',
  context: '上下文',
  tool: '工具',
  subtool: '尝试',
  compacted: '压缩',
};

const COLLAPSIBLE_ATTEMPT_STATUSES = new Set(['success', 'completed', 'complete']);

/** 将 cell 投影为不依赖 React/Redux/fetch 的稳定记录表行。 */
export function projectTrajectoryTableRows({
  cells,
  searchQuery = '',
  focusedCellKeys = null,
}: TrajectoryTableModelInput): TrajectoryTableRow[] {
  const normalizedQuery = normalizeSearch(searchQuery);
  const hasFocus = Boolean(focusedCellKeys?.size);
  const metadata = buildRowMetadata(cells);
  const attemptsByTool = collectAttemptsByTool(cells);
  const collapsedAttemptKeys = new Set<string>();
  const collapsedKeysByTool = new Map<string, string[]>();
  const cellsByKey = new Map(cells.map(cell => [cell.key, cell]));

  for (const [toolIdentity, attempts] of attemptsByTool) {
    if (attempts.length !== 1 || !COLLAPSIBLE_ATTEMPT_STATUSES.has(attempts[0].status)) continue;
    collapsedAttemptKeys.add(attempts[0].key);
    collapsedKeysByTool.set(toolIdentity, [attempts[0].key]);
  }

  const rows: MutableTableRow[] = [];
  const runRowsById = new Map<string, MutableTableRow>();
  const userRowsById = new Map<string, MutableTableRow>();
  const userRowsByTurn = new Map<number, MutableTableRow>();
  const toolRowsByIdentity = new Map<string, MutableTableRow>();

  for (let sourceIndex = 0; sourceIndex < cells.length; sourceIndex += 1) {
    const cell = cells[sourceIndex];
    if (collapsedAttemptKeys.has(cell.key)) continue;
    const presentation = getTrajectoryCellPresentation(cell);
    const kindLabel = KIND_LABELS[cell.type];
    const summary = tableSummary(cell, presentation.kindLabel, presentation.summary);
    const attemptCount = cell.type === 'tool'
      ? (attemptsByTool.get(toolIdentity(cell.runId, cell.toolCallId))?.length ?? 0)
      : 0;
    const collapsedSearchText = cell.type === 'tool'
      ? (collapsedKeysByTool.get(toolIdentity(cell.runId, cell.toolCallId)) ?? [])
        .map(key => {
          const attempt = cellsByKey.get(key);
          return attempt ? cellSearchParts(attempt).join(' ') : '';
        })
      : [];
    const searchText = normalizeSearch([
      cell.type,
      kindLabel,
      presentation.kindLabel,
      summary,
      presentation.statusLabel,
      presentation.trajectoryStatusLabel,
      ...cellSearchParts(cell),
      ...collapsedSearchText,
    ].filter(Boolean).join(' '));
    const collapsedFocusMatch = cell.type === 'tool'
      && (collapsedKeysByTool.get(toolIdentity(cell.runId, cell.toolCallId)) ?? [])
        .some(key => focusedCellKeys?.has(key));
    const directSearchMatch = normalizedQuery ? searchText.includes(normalizedQuery) : true;
    const directFocusMatch = hasFocus
      ? Boolean(focusedCellKeys?.has(cell.key) || collapsedFocusMatch)
      : true;
    const row: MutableTableRow = {
      key: cell.key,
      cell,
      sourceIndex,
      turnNumber: metadata[sourceIndex].turnNumber,
      attemptNumber: cell.type === 'run' || cell.type === 'subtool'
        ? (cell.attemptIndex === null ? null : cell.attemptIndex + 1)
        : null,
      kindLabel,
      summary,
      statusLabel: presentation.statusLabel,
      trajectoryStatusLabel: presentation.trajectoryStatusLabel ?? null,
      durationMs: presentation.durationMs,
      searchText,
      matched: Boolean(normalizedQuery) && directSearchMatch && directFocusMatch,
      attemptCount,
      directSearchMatch,
      directFocusMatch,
    };
    rows.push(row);
    if (cell.type === 'run') runRowsById.set(cell.runId, row);
    if (cell.type === 'user') {
      userRowsById.set(cell.userMessageId, row);
      if (row.turnNumber !== null) userRowsByTurn.set(row.turnNumber, row);
    }
    if (cell.type === 'tool') {
      toolRowsByIdentity.set(toolIdentity(cell.runId, cell.toolCallId), row);
    }
  }

  if (!normalizedQuery && !hasFocus) return stripPrivateFields(rows);
  if (!hasFocus) {
    return stripPrivateFields(rows.filter(row => row.directSearchMatch));
  }

  const selectedKeys = new Set<string>();
  const roots = rows.filter(row => row.directFocusMatch && row.directSearchMatch);
  for (const row of roots) {
    selectedKeys.add(row.key);
    const runRow = row.cell.runId ? runRowsById.get(row.cell.runId) : undefined;
    if (runRow) selectedKeys.add(runRow.key);
    const userMessageId = row.cell.userMessageId ?? runRow?.cell.userMessageId ?? null;
    const userRow = userMessageId
      ? userRowsById.get(userMessageId)
      : (row.turnNumber === null ? undefined : userRowsByTurn.get(row.turnNumber));
    if (userRow) selectedKeys.add(userRow.key);
    if (row.cell.type === 'subtool' && row.cell.toolCallId) {
      const toolRow = toolRowsByIdentity.get(toolIdentity(row.cell.runId, row.cell.toolCallId));
      if (toolRow) selectedKeys.add(toolRow.key);
    }
  }

  return stripPrivateFields(rows.filter(row => selectedKeys.has(row.key)));
}

function buildRowMetadata(cells: readonly TrajectoryCell[]): Array<{ turnNumber: number | null }> {
  let turnNumber = 0;
  let currentTurnNumber: number | null = null;
  const turnsByUserMessageId = new Map<string, number>();
  const turnsByRunId = new Map<string, number | null>();
  return cells.map(cell => {
    if (cell.type === 'user') {
      turnNumber += 1;
      currentTurnNumber = turnNumber;
      turnsByUserMessageId.set(cell.userMessageId, turnNumber);
      return { turnNumber };
    }
    if (cell.type === 'run') {
      const runTurn = cell.association === 'unassociated'
        ? null
        : (cell.userMessageId
          ? turnsByUserMessageId.get(cell.userMessageId) ?? currentTurnNumber
          : currentTurnNumber);
      turnsByRunId.set(cell.runId, runTurn);
      return { turnNumber: runTurn };
    }
    if (cell.runId !== null) {
      return { turnNumber: turnsByRunId.get(cell.runId) ?? null };
    }
    return { turnNumber: currentTurnNumber };
  });
}

function collectAttemptsByTool(
  cells: readonly TrajectoryCell[],
): Map<string, Array<Extract<TrajectoryCell, { type: 'subtool' }>>> {
  const tools = new Set(cells
    .filter((cell): cell is Extract<TrajectoryCell, { type: 'tool' }> => cell.type === 'tool')
    .map(cell => toolIdentity(cell.runId, cell.toolCallId)));
  const attempts = new Map<string, Array<Extract<TrajectoryCell, { type: 'subtool' }>>>();
  for (const cell of cells) {
    if (cell.type !== 'subtool' || cell.toolCallId === null) continue;
    const identity = toolIdentity(cell.runId, cell.toolCallId);
    if (!tools.has(identity)) continue;
    const grouped = attempts.get(identity) ?? [];
    grouped.push(cell);
    attempts.set(identity, grouped);
  }
  return attempts;
}

function toolIdentity(runId: string, toolCallId: string): string {
  return `${runId}\u0000${toolCallId}`;
}

function tableSummary(cell: TrajectoryCell, presentationKind: string, summary: string): string {
  if (cell.type === 'tool') return `${presentationKind} · ${summary}`;
  return summary;
}

function cellSearchParts(cell: TrajectoryCell): string[] {
  const parts = [cell.key];
  if (cell.type === 'user' || cell.type === 'message') {
    parts.push(extractTextFromBlocks(cell.message.content));
  }
  if (cell.type === 'run') {
    parts.push(cell.runStatus, cell.trajectoryBadge.status);
  }
  if (cell.type === 'tool' || cell.type === 'subtool') {
    parts.push(cell.toolName ?? '', cell.status);
  }
  if (cell.type === 'context') parts.push(cell.eventType);
  return parts;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function stripPrivateFields(rows: MutableTableRow[]): TrajectoryTableRow[] {
  return rows.map(row => ({
    key: row.key,
    cell: row.cell,
    sourceIndex: row.sourceIndex,
    turnNumber: row.turnNumber,
    attemptNumber: row.attemptNumber,
    kindLabel: row.kindLabel,
    summary: row.summary,
    statusLabel: row.statusLabel,
    trajectoryStatusLabel: row.trajectoryStatusLabel,
    durationMs: row.durationMs,
    searchText: row.searchText,
    matched: row.matched,
    attemptCount: row.attemptCount,
  }));
}
