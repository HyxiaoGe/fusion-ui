import type { TrajectoryRunSummary } from '@/types/trajectory';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import type { TrajectoryCell } from './TrajectoryCellProjection';

export type TrajectoryOverviewMode = 'sequence' | 'actual';
export type TrajectoryOverviewTrack = 'input' | 'model' | 'tools';

export interface RunBand {
  runId: string;
  start: number;
  end: number;
  hydrated: boolean;
  selected: boolean;
  status: string;
}

export interface OverviewSegment {
  key: string;
  runId: string;
  track: TrajectoryOverviewTrack;
  start: number;
  end: number;
  targetCellKey: string;
  label: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  startSequence: number;
  endSequence: number;
}

export interface TrajectoryOverviewProjection {
  mode: TrajectoryOverviewMode;
  runBands: RunBand[];
  segments: OverviewSegment[];
}

export interface TrajectoryOverviewModelInput {
  runs: readonly TrajectoryRunSummary[];
  focusedRunId: string | null;
  focusedRunEvents: readonly NormalizedTrajectoryEvent[];
  cells: readonly TrajectoryCell[];
  mode: TrajectoryOverviewMode;
}

type GroupKind = 'run' | 'step' | 'plan' | 'context' | 'compaction' | 'model' | 'tool' | 'attempt' | 'retrieval' | 'event';

interface EventGroup {
  key: string;
  kind: GroupKind;
  stableId: string;
  track: TrajectoryOverviewTrack;
  events: NormalizedTrajectoryEvent[];
}

interface CellIndexes {
  runKey: string;
  tools: Map<string, string>;
  attempts: Map<string, string>;
  plans: Map<string, string>;
  compactions: Map<number, string>;
  sequences: Map<number, string>;
}

const MIN_GLOBAL_WIDTH = 0.002;
const TRACK_ORDER: Record<TrajectoryOverviewTrack, number> = { input: 0, model: 1, tools: 2 };

/** 将会话 Run summary 与当前聚焦 Run 的记录投影为 Canvas 可直接消费的确定性几何。 */
export function projectTrajectoryOverview(
  input: TrajectoryOverviewModelInput,
): TrajectoryOverviewProjection {
  const runs = chronologicalRuns(input.runs);
  const cellsByRunId = new Map<string, Extract<TrajectoryCell, { type: 'run' }>>();
  for (const cell of input.cells) {
    if (cell.type === 'run') cellsByRunId.set(cell.runId, cell);
  }

  const runBands = buildRunBands(runs, input.mode, input.focusedRunId, cellsByRunId);
  const focusedBand = runBands.find(item => item.runId === input.focusedRunId);
  if (!focusedBand?.hydrated) return { mode: input.mode, runBands, segments: [] };

  const events = input.focusedRunEvents
    .filter(item => item.runId === input.focusedRunId)
    .slice()
    .sort((left, right) => left.sequence - right.sequence);
  if (events.length === 0) return { mode: input.mode, runBands, segments: [] };

  const focusedRun = runs.find(item => item.run_id === input.focusedRunId);
  if (!focusedRun) return { mode: input.mode, runBands, segments: [] };
  const indexes = indexCells(input.cells, focusedRun.run_id);
  const sequenceStart = events[0].sequence;
  const sequenceEnd = events.at(-1)?.sequence ?? sequenceStart;
  const actualDomain = actualRunDomain(focusedRun, events);
  const groups = groupEvents(events);
  const segments = groups.map(group => {
    const startSequence = group.events[0].sequence;
    const endSequence = group.events.at(-1)?.sequence ?? startSequence;
    const times = validEventTimes(group.events);
    const interval = input.mode === 'actual'
      ? actualSegmentInterval(
        group,
        actualDomain,
        focusedBand,
        sequenceStart,
        sequenceEnd,
      )
      : sequenceInterval(startSequence, endSequence, sequenceStart, sequenceEnd, focusedBand);
    return {
      key: `overview:${focusedRun.run_id}:${group.track}:${group.key}`,
      runId: focusedRun.run_id,
      track: group.track,
      start: interval.start,
      end: interval.end,
      targetCellKey: targetCellKey(group, indexes),
      label: groupLabel(group),
      status: groupStatus(group),
      startedAt: times.length > 0 ? times[0].timestamp : null,
      endedAt: times.length > 0 ? times.at(-1)?.timestamp ?? null : null,
      startSequence,
      endSequence,
    } satisfies OverviewSegment;
  });

  segments.sort((left, right) => (
    left.startSequence - right.startSequence
    || TRACK_ORDER[left.track] - TRACK_ORDER[right.track]
    || left.key.localeCompare(right.key)
  ));
  return { mode: input.mode, runBands, segments };
}

function chronologicalRuns(runs: readonly TrajectoryRunSummary[]): TrajectoryRunSummary[] {
  return runs.map((run, index) => ({ run, index })).sort((left, right) => {
    const leftTime = timestampValue(left.run.started_at);
    const rightTime = timestampValue(right.run.started_at);
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) return leftTime - rightTime;
    const attemptDifference = (left.run.attempt_index ?? 0) - (right.run.attempt_index ?? 0);
    return attemptDifference || left.index - right.index;
  }).map(item => item.run);
}

function buildRunBands(
  runs: readonly TrajectoryRunSummary[],
  mode: TrajectoryOverviewMode,
  focusedRunId: string | null,
  cellsByRunId: Map<string, Extract<TrajectoryCell, { type: 'run' }>>,
): RunBand[] {
  if (runs.length === 0) return [];
  const weights = mode === 'sequence'
    ? runs.map(() => 1)
    : actualRunWeights(runs);
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  return runs.map((run, index) => {
    const start = cursor;
    cursor = index === runs.length - 1 ? 1 : cursor + weights[index] / total;
    return {
      runId: run.run_id,
      start,
      end: cursor,
      hydrated: cellsByRunId.get(run.run_id)?.isHydrated ?? false,
      selected: run.run_id === focusedRunId,
      status: run.status,
    };
  });
}

function actualRunWeights(runs: readonly TrajectoryRunSummary[]): number[] {
  const durations = runs.map(runDuration);
  const positive = durations.filter(value => value > 0);
  const fallback = positive.length > 0
    ? Math.max(1, positive.reduce((sum, value) => sum + value, 0) / positive.length * 0.01)
    : 1;
  return durations.map(value => value > 0 ? value : fallback);
}

function runDuration(run: TrajectoryRunSummary): number {
  if (run.duration_ms !== null && Number.isFinite(run.duration_ms) && run.duration_ms > 0) {
    return run.duration_ms;
  }
  const start = timestampValue(run.started_at);
  const end = timestampValue(run.ended_at);
  return start !== null && end !== null && end > start ? end - start : 0;
}

function groupEvents(events: readonly NormalizedTrajectoryEvent[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const item of events) {
    const identity = eventIdentity(item);
    const groupKey = `${identity.track}:${identity.kind}:${identity.stableId}`;
    const existing = groups.get(groupKey);
    if (existing) existing.events.push(item);
    else groups.set(groupKey, { key: groupKey, ...identity, events: [item] });
  }
  return [...groups.values()];
}

function eventIdentity(item: NormalizedTrajectoryEvent): Omit<EventGroup, 'key' | 'events'> {
  const llmRoundId = stringValue(item.payload.llm_round_id);
  if (llmRoundId) return { kind: 'model', stableId: llmRoundId, track: 'model' };

  const attemptId = stringValue(item.payload.tool_attempt_id);
  if (attemptId) return { kind: 'attempt', stableId: attemptId, track: 'tools' };
  if (item.toolCallId) return { kind: 'tool', stableId: item.toolCallId, track: 'tools' };
  const retrievalId = stringValue(item.payload.retrieval_id);
  if (retrievalId) return { kind: 'retrieval', stableId: retrievalId, track: 'tools' };

  if (item.eventType.startsWith('run_')) {
    return { kind: 'run', stableId: item.runId, track: 'input' };
  }
  if (item.eventType.startsWith('step_')) {
    return { kind: 'step', stableId: item.stepId ?? `sequence-${item.sequence}`, track: 'input' };
  }
  if (item.eventType.startsWith('plan_')) {
    return {
      kind: 'plan',
      stableId: stringValue(item.payload.plan_id) ?? `sequence-${item.sequence}`,
      track: 'input',
    };
  }
  if (item.eventType === 'context_status_updated' && isCompactionEvent(item)) {
    return { kind: 'compaction', stableId: `sequence-${item.sequence}`, track: 'input' };
  }
  if (item.eventType.startsWith('context_')) {
    const stableId = stringValue(item.payload.request_id)
      ?? numberValue(item.payload.round_index)?.toString()
      ?? `sequence-${item.sequence}`;
    return { kind: 'context', stableId, track: 'input' };
  }
  return {
    kind: 'event',
    stableId: `${item.eventType}:${item.sequence}`,
    track: 'input',
  };
}

function indexCells(cells: readonly TrajectoryCell[], runId: string): CellIndexes {
  const indexes: CellIndexes = {
    runKey: `run:${runId}`,
    tools: new Map(),
    attempts: new Map(),
    plans: new Map(),
    compactions: new Map(),
    sequences: new Map(),
  };
  for (const cell of cells) {
    if (cell.runId !== runId) continue;
    if (cell.type === 'run') indexes.runKey = cell.key;
    else if (cell.type === 'tool') indexes.tools.set(cell.toolCallId, cell.key);
    else if (cell.type === 'subtool') indexes.attempts.set(cell.toolAttemptId, cell.key);
    else if (cell.type === 'plan') indexes.plans.set(cell.planId, cell.key);
    else if (cell.type === 'compacted') {
      for (const sequence of cell.sourceSequences) indexes.compactions.set(sequence, cell.key);
    }
    if (cell.type !== 'run') {
      for (const sequence of cell.sourceSequences) {
        if (!indexes.sequences.has(sequence)) indexes.sequences.set(sequence, cell.key);
      }
    }
  }
  return indexes;
}

function targetCellKey(group: EventGroup, indexes: CellIndexes): string {
  if (group.kind === 'tool') return indexes.tools.get(group.stableId) ?? indexes.runKey;
  if (group.kind === 'attempt') return indexes.attempts.get(group.stableId) ?? indexes.runKey;
  if (group.kind === 'plan') return indexes.plans.get(group.stableId) ?? indexes.runKey;
  if (group.kind === 'compaction') {
    return indexes.compactions.get(group.events[0].sequence) ?? indexes.runKey;
  }
  for (const item of group.events) {
    const target = indexes.sequences.get(item.sequence);
    if (target) return target;
  }
  return indexes.runKey;
}

function sequenceInterval(
  startSequence: number,
  endSequence: number,
  domainStart: number,
  domainEnd: number,
  band: RunBand,
): { start: number; end: number } {
  const sequenceCount = Math.max(1, domainEnd - domainStart + 1);
  const startRatio = (startSequence - domainStart) / sequenceCount;
  const endRatio = (endSequence - domainStart + 1) / sequenceCount;
  return boundedInterval(
    band.start + startRatio * (band.end - band.start),
    band.start + endRatio * (band.end - band.start),
    band,
  );
}

function actualSegmentInterval(
  group: EventGroup,
  domain: { start: number; end: number } | null,
  band: RunBand,
  sequenceStart: number,
  sequenceEnd: number,
): { start: number; end: number } {
  const times = validEventTimes(group.events);
  if (times.length === 0 || domain === null) {
    return sequenceInterval(
      group.events[0].sequence,
      group.events.at(-1)?.sequence ?? group.events[0].sequence,
      sequenceStart,
      sequenceEnd,
      band,
    );
  }
  const duration = domain.end - domain.start;
  const startRatio = clamp((times[0].value - domain.start) / duration, 0, 1);
  const endRatio = clamp(((times.at(-1)?.value ?? times[0].value) - domain.start) / duration, 0, 1);
  return boundedInterval(
    band.start + startRatio * (band.end - band.start),
    band.start + endRatio * (band.end - band.start),
    band,
  );
}

function actualRunDomain(
  run: TrajectoryRunSummary,
  events: readonly NormalizedTrajectoryEvent[],
): { start: number; end: number } | null {
  const eventTimes = validEventTimes(events);
  const firstEvent = eventTimes[0]?.value ?? null;
  const lastEvent = eventTimes.at(-1)?.value ?? null;
  const summaryStart = timestampValue(run.started_at);
  const start = summaryStart ?? firstEvent;
  if (start === null) return null;
  const summaryEnd = timestampValue(run.ended_at);
  if (summaryEnd !== null && summaryEnd > start) return { start, end: summaryEnd };
  if (run.duration_ms !== null && Number.isFinite(run.duration_ms) && run.duration_ms > 0) {
    return { start, end: start + run.duration_ms };
  }
  if (lastEvent !== null && lastEvent > start) return { start, end: lastEvent };
  return null;
}

function boundedInterval(start: number, end: number, band: RunBand): { start: number; end: number } {
  const width = band.end - band.start;
  const minimum = Math.min(width, MIN_GLOBAL_WIDTH);
  let safeStart = clamp(Number.isFinite(start) ? start : band.start, band.start, band.end);
  let safeEnd = clamp(Number.isFinite(end) ? end : safeStart, safeStart, band.end);
  if (safeEnd - safeStart < minimum) {
    safeEnd = Math.min(band.end, safeStart + minimum);
    safeStart = Math.max(band.start, safeEnd - minimum);
  }
  return { start: safeStart, end: safeEnd };
}

function validEventTimes(events: readonly NormalizedTrajectoryEvent[]): Array<{
  timestamp: string;
  value: number;
}> {
  return events.map(item => ({ timestamp: item.timestamp, value: timestampValue(item.timestamp) }))
    .filter((item): item is { timestamp: string; value: number } => item.value !== null)
    .sort((left, right) => left.value - right.value);
}

function groupLabel(group: EventGroup): string {
  const latestPayloadValue = (field: string): string | null => {
    for (let index = group.events.length - 1; index >= 0; index -= 1) {
      const value = stringValue(group.events[index].payload[field]);
      if (value) return value;
    }
    return null;
  };
  if (group.kind === 'model') return latestPayloadValue('model') ?? `模型轮次 ${group.stableId}`;
  if (group.kind === 'tool' || group.kind === 'attempt') {
    return latestPayloadValue('tool_name') ?? `工具 ${group.stableId}`;
  }
  if (group.kind === 'retrieval') {
    return latestPayloadValue('query_summary') ?? `资料获取 ${group.stableId}`;
  }
  const labels: Record<GroupKind, string> = {
    run: '运行',
    step: '步骤',
    plan: '计划',
    context: '上下文',
    compaction: '上下文压缩',
    model: '模型',
    tool: '工具',
    attempt: '工具尝试',
    retrieval: '资料获取',
    event: '控制记录',
  };
  return labels[group.kind];
}

function isCompactionEvent(item: NormalizedTrajectoryEvent): boolean {
  return (numberValue(item.payload.removed_turns) ?? 0) > 0
    || (numberValue(item.payload.removed_messages) ?? 0) > 0
    || (numberValue(item.payload.removed_tool_transactions) ?? 0) > 0;
}

function groupStatus(group: EventGroup): string {
  const latest = group.events.at(-1);
  const explicit = latest ? stringValue(latest.payload.status) : null;
  if (explicit) return explicit;
  const eventType = latest?.eventType ?? '';
  if (eventType.endsWith('_failed')) return 'failed';
  if (eventType.endsWith('_cancelled') || eventType === 'run_interrupted') return 'cancelled';
  if (eventType.endsWith('_completed')) return 'completed';
  if (eventType.endsWith('_started') || eventType.endsWith('_delta')) return 'running';
  if (eventType === 'run_limit_reached') return 'limit_reached';
  return 'recorded';
}

function timestampValue(value: string | null): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
