import type { TrajectorySnapshotCacheEntry } from '@/redux/slices/trajectorySlice';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary, TrajectorySpan } from '@/types/trajectory';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';

export type TrajectoryCompletenessSource =
  | 'message'
  | 'run-summary'
  | 'durable-snapshot'
  | 'live-tail'
  | 'message.agent_run';

export type TrajectoryJoinStrategy =
  | 'explicit'
  | 'legacy-adjacent-user'
  | 'assistant-only'
  | 'message-agent-run'
  | 'unassociated';

export interface TrajectoryCellBase {
  key: string;
  type: TrajectoryCell['type'];
  runId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  completenessSources: TrajectoryCompletenessSource[];
  sourceSequences: number[];
}

export interface UserCell extends TrajectoryCellBase {
  type: 'user';
  runId: null;
  userMessageId: string;
  assistantMessageId: null;
  message: Message;
}

export interface MessageCell extends TrajectoryCellBase {
  type: 'message';
  runId: null;
  userMessageId: null;
  assistantMessageId: string;
  message: Message;
}

export type TrajectoryBadgeStatus =
  | 'recording'
  | 'complete'
  | 'degraded'
  | 'truncated'
  | 'legacy'
  | 'summary-only'
  | 'unknown';

export interface TrajectoryBadge {
  status: TrajectoryBadgeStatus;
  source: Exclude<TrajectoryCompletenessSource, 'message' | 'live-tail'>;
  reason: string | null;
}

export interface RunCell extends TrajectoryCellBase {
  type: 'run';
  runId: string;
  summarySource: 'run-summary' | 'message.agent_run';
  attemptIndex: number | null;
  runStatus: string;
  totalSteps: number;
  totalToolCalls: number;
  startedAt: string | null;
  endedAt: string | null;
  isSelected: boolean;
  isHydrated: boolean;
  association: TrajectoryJoinStrategy;
  trajectoryBadge: TrajectoryBadge;
  records: NormalizedTrajectoryEvent[];
  spans: TrajectorySpan[];
  liveTail: NormalizedTrajectoryEvent[];
}

export interface PlanCell extends TrajectoryCellBase {
  type: 'plan';
  runId: string;
  planId: string;
  revision: number | null;
  payload: Record<string, unknown>;
}

export interface ContextCell extends TrajectoryCellBase {
  type: 'context';
  runId: string;
  contextId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface ToolCell extends TrajectoryCellBase {
  type: 'tool';
  runId: string;
  toolCallId: string;
  stepId: string | null;
  toolName: string | null;
  status: string;
  events: NormalizedTrajectoryEvent[];
}

export interface SubtoolCell extends TrajectoryCellBase {
  type: 'subtool';
  runId: string;
  toolCallId: string | null;
  toolAttemptId: string;
  toolName: string | null;
  attemptIndex: number | null;
  status: string;
  events: NormalizedTrajectoryEvent[];
}

export interface CompactedCell extends TrajectoryCellBase {
  type: 'compacted';
  runId: string;
  roundIndex: number | null;
  removedTurns: number;
  removedMessages: number;
  removedToolTransactions: number;
}

export type TrajectoryCell =
  | UserCell
  | MessageCell
  | RunCell
  | PlanCell
  | ContextCell
  | ToolCell
  | SubtoolCell
  | CompactedCell;

export interface TrajectoryRunJoin {
  runId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  strategy: TrajectoryJoinStrategy;
  bucket: 'conversation' | 'unassociated';
}

export interface TrajectoryCellProjectionInput {
  messages: Message[];
  runs: TrajectoryRunSummary[];
  runSummariesById: Record<string, TrajectoryRunSummary>;
  snapshotsByRunId: Record<string, TrajectorySnapshotCacheEntry | undefined>;
  liveEventsByRunId: Record<string, NormalizedTrajectoryEvent[] | undefined>;
  selectedRunId: string | null;
  runsTruncated: boolean;
}

export interface TrajectoryCellProjection {
  cells: TrajectoryCell[];
  unassociatedCells: TrajectoryCell[];
  joins: TrajectoryRunJoin[];
}

interface ProjectedRun {
  runId: string;
  messageId: string | null;
  turnMessageId: string | null;
  attemptIndex: number | null;
  status: string;
  trajectoryStatus: string | null;
  totalSteps: number;
  totalToolCalls: number;
  startedAt: string | null;
  endedAt: string | null;
  summarySource: RunCell['summarySource'];
}

interface DetailContext {
  run: ProjectedRun;
  join: TrajectoryRunJoin;
  snapshot: TrajectorySnapshotCacheEntry;
  durableEvents: NormalizedTrajectoryEvent[];
  liveTail: NormalizedTrajectoryEvent[];
}

/** 将消息、运行摘要、快照和实时尾部确定性地投影为虚拟账本单元。 */
export function projectTrajectoryCells(
  input: TrajectoryCellProjectionInput,
): TrajectoryCellProjection {
  const runs = collectProjectedRuns(input);
  const messageIndexes = new Map(input.messages.map((item, index) => [item.id, index]));
  const messagesById = new Map(input.messages.map(item => [item.id, item]));
  const joinsByRunId = new Map<string, TrajectoryRunJoin>();

  for (const run of runs) {
    joinsByRunId.set(run.runId, joinRun(run, input.messages, messagesById, messageIndexes));
  }

  const sortedRuns = [...runs].sort((left, right) => compareRuns(
    left,
    right,
    joinsByRunId,
    messageIndexes,
  ));
  const runsByUserMessageId = groupRuns(sortedRuns, joinsByRunId, 'userMessageId');
  const runsByAssistantMessageId = groupRuns(sortedRuns, joinsByRunId, 'assistantMessageId', true);
  const cells: TrajectoryCell[] = [];

  for (const item of input.messages) {
    if (item.role === 'user') {
      cells.push(userCell(item));
      appendRunCells(cells, runsByUserMessageId.get(item.id) ?? [], joinsByRunId, input);
      continue;
    }

    appendRunCells(cells, runsByAssistantMessageId.get(item.id) ?? [], joinsByRunId, input);
    cells.push(assistantCell(item));
  }

  const unassociatedCells: TrajectoryCell[] = [];
  const unassociatedRuns = sortedRuns.filter(run => (
    joinsByRunId.get(run.runId)?.bucket === 'unassociated'
  ));
  appendRunCells(unassociatedCells, unassociatedRuns, joinsByRunId, input);

  return {
    cells,
    unassociatedCells,
    joins: sortedRuns.map(run => joinsByRunId.get(run.runId) as TrajectoryRunJoin),
  };
}

function collectProjectedRuns(input: TrajectoryCellProjectionInput): ProjectedRun[] {
  const byRunId = new Map<string, ProjectedRun>();

  for (const summary of input.runs) byRunId.set(summary.run_id, fromRunSummary(summary));
  for (const summary of Object.values(input.runSummariesById)) {
    byRunId.set(summary.run_id, fromRunSummary(summary));
  }
  for (const snapshot of Object.values(input.snapshotsByRunId)) {
    if (snapshot) byRunId.set(snapshot.run.run_id, fromRunSummary(snapshot.run));
  }

  for (const item of input.messages) {
    if (item.role !== 'assistant' || !item.agent_run) continue;
    const fallback = item.agent_run;
    if (byRunId.has(fallback.runId)) continue;
    byRunId.set(fallback.runId, {
      runId: fallback.runId,
      messageId: item.id,
      turnMessageId: null,
      attemptIndex: null,
      status: fallback.status,
      trajectoryStatus: null,
      totalSteps: fallback.totalSteps,
      totalToolCalls: fallback.totalToolCalls,
      startedAt: null,
      endedAt: null,
      summarySource: 'message.agent_run',
    });
  }

  return [...byRunId.values()];
}

function fromRunSummary(summary: TrajectoryRunSummary): ProjectedRun {
  return {
    runId: summary.run_id,
    messageId: summary.message_id,
    turnMessageId: summary.turn_message_id,
    attemptIndex: summary.attempt_index,
    status: summary.status,
    trajectoryStatus: summary.trajectory_status,
    totalSteps: summary.total_steps,
    totalToolCalls: summary.total_tool_calls,
    startedAt: summary.started_at,
    endedAt: summary.ended_at,
    summarySource: 'run-summary',
  };
}

function joinRun(
  run: ProjectedRun,
  messages: Message[],
  messagesById: Map<string, Message>,
  messageIndexes: Map<string, number>,
): TrajectoryRunJoin {
  const explicitUser = run.turnMessageId
    ? messagesById.get(run.turnMessageId)
    : undefined;
  const assistant = run.messageId
    ? messagesById.get(run.messageId)
    : undefined;
  const userMessageId = explicitUser?.role === 'user' ? explicitUser.id : null;
  const assistantMessageId = assistant?.role === 'assistant' ? assistant.id : null;

  if (run.summarySource === 'message.agent_run' && assistantMessageId) {
    const adjacentUser = previousAdjacentUser(messages, messageIndexes, assistantMessageId);
    return {
      runId: run.runId,
      userMessageId: adjacentUser,
      assistantMessageId,
      strategy: 'message-agent-run',
      bucket: 'conversation',
    };
  }

  if (userMessageId || assistantMessageId) {
    if (userMessageId) {
      return {
        runId: run.runId,
        userMessageId,
        assistantMessageId,
        strategy: 'explicit',
        bucket: 'conversation',
      };
    }
    const legacyUser = run.turnMessageId === null && assistantMessageId
      ? previousAdjacentUser(messages, messageIndexes, assistantMessageId)
      : null;
    if (run.turnMessageId === null && assistantMessageId && !legacyUser) {
      return {
        runId: run.runId,
        userMessageId: null,
        assistantMessageId,
        strategy: 'unassociated',
        bucket: 'unassociated',
      };
    }
    return {
      runId: run.runId,
      userMessageId: legacyUser,
      assistantMessageId,
      strategy: legacyUser ? 'legacy-adjacent-user' : 'assistant-only',
      bucket: 'conversation',
    };
  }

  return {
    runId: run.runId,
    userMessageId: null,
    assistantMessageId: null,
    strategy: 'unassociated',
    bucket: 'unassociated',
  };
}

function previousAdjacentUser(
  messages: Message[],
  messageIndexes: Map<string, number>,
  assistantMessageId: string,
): string | null {
  const assistantIndex = messageIndexes.get(assistantMessageId);
  if (assistantIndex === undefined || assistantIndex === 0) return null;
  const previous = messages[assistantIndex - 1];
  return previous.role === 'user' ? previous.id : null;
}

function compareRuns(
  left: ProjectedRun,
  right: ProjectedRun,
  joinsByRunId: Map<string, TrajectoryRunJoin>,
  messageIndexes: Map<string, number>,
): number {
  const leftJoin = joinsByRunId.get(left.runId);
  const rightJoin = joinsByRunId.get(right.runId);
  const leftIndex = joinedMessageIndex(leftJoin, messageIndexes);
  const rightIndex = joinedMessageIndex(rightJoin, messageIndexes);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;

  const leftAttempt = left.attemptIndex ?? Number.MAX_SAFE_INTEGER;
  const rightAttempt = right.attemptIndex ?? Number.MAX_SAFE_INTEGER;
  if (leftAttempt !== rightAttempt) return leftAttempt - rightAttempt;
  const startedAt = (left.startedAt ?? '').localeCompare(right.startedAt ?? '');
  return startedAt || left.runId.localeCompare(right.runId);
}

function joinedMessageIndex(
  join: TrajectoryRunJoin | undefined,
  messageIndexes: Map<string, number>,
): number {
  if (!join || join.bucket === 'unassociated') return Number.MAX_SAFE_INTEGER;
  const messageId = join.userMessageId ?? join.assistantMessageId;
  return messageId ? (messageIndexes.get(messageId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
}

function groupRuns(
  runs: ProjectedRun[],
  joinsByRunId: Map<string, TrajectoryRunJoin>,
  field: 'userMessageId' | 'assistantMessageId',
  assistantOnly = false,
): Map<string, ProjectedRun[]> {
  const grouped = new Map<string, ProjectedRun[]>();
  for (const run of runs) {
    const join = joinsByRunId.get(run.runId);
    if (!join || join.bucket !== 'conversation') continue;
    if (assistantOnly && join.userMessageId !== null) continue;
    const messageId = join[field];
    if (!messageId) continue;
    const group = grouped.get(messageId) ?? [];
    group.push(run);
    grouped.set(messageId, group);
  }
  return grouped;
}

function userCell(item: Message): UserCell {
  return {
    key: `message:user:${item.id}`,
    type: 'user',
    runId: null,
    userMessageId: item.id,
    assistantMessageId: null,
    completenessSources: ['message'],
    sourceSequences: [],
    message: item,
  };
}

function assistantCell(item: Message): MessageCell {
  return {
    key: `message:assistant:${item.id}`,
    type: 'message',
    runId: null,
    userMessageId: null,
    assistantMessageId: item.id,
    completenessSources: ['message'],
    sourceSequences: [],
    message: item,
  };
}

function appendRunCells(
  target: TrajectoryCell[],
  runs: ProjectedRun[],
  joinsByRunId: Map<string, TrajectoryRunJoin>,
  input: TrajectoryCellProjectionInput,
): void {
  for (const run of runs) {
    const join = joinsByRunId.get(run.runId);
    if (!join) continue;
    const snapshot = input.snapshotsByRunId[run.runId];
    const isSelected = input.selectedRunId === run.runId;
    const detail = isSelected && snapshot
      ? createDetailContext(run, join, snapshot, input.liveEventsByRunId[run.runId] ?? [])
      : null;
    const runCell = createRunCell(run, join, snapshot, isSelected, detail);
    target.push(runCell);
    if (detail) target.push(...projectDetailCells(detail, runCell));
  }
}

function createDetailContext(
  run: ProjectedRun,
  join: TrajectoryRunJoin,
  snapshot: TrajectorySnapshotCacheEntry,
  liveEvents: NormalizedTrajectoryEvent[],
): DetailContext {
  const durableEvents = uniqueSortedEvents(snapshot.events);
  const durableLastSequence = snapshot.durableLastSequence
    ?? durableEvents.at(-1)?.sequence
    ?? -1;
  const liveTail = uniqueSortedEvents(liveEvents.filter(item => item.sequence > durableLastSequence));
  return { run, join, snapshot, durableEvents, liveTail };
}

function uniqueSortedEvents(events: NormalizedTrajectoryEvent[]): NormalizedTrajectoryEvent[] {
  const bySequence = new Map<number, NormalizedTrajectoryEvent>();
  for (const item of events) {
    if (!bySequence.has(item.sequence)) bySequence.set(item.sequence, item);
  }
  return [...bySequence.values()].sort((left, right) => left.sequence - right.sequence);
}

function createRunCell(
  run: ProjectedRun,
  join: TrajectoryRunJoin,
  snapshot: TrajectorySnapshotCacheEntry | undefined,
  isSelected: boolean,
  detail: DetailContext | null,
): RunCell {
  const completenessSources: TrajectoryCompletenessSource[] = [run.summarySource];
  if (snapshot) completenessSources.push('durable-snapshot');
  if (detail?.liveTail.length) completenessSources.push('live-tail');

  const genericSequences = detail
    ? [...detail.durableEvents, ...detail.liveTail]
      .filter(item => !isSpecializedProjectableEvent(item))
      .map(item => item.sequence)
    : [];

  return {
    key: `run:${run.runId}`,
    type: 'run',
    runId: run.runId,
    userMessageId: join.userMessageId,
    assistantMessageId: join.assistantMessageId,
    completenessSources,
    sourceSequences: genericSequences,
    summarySource: run.summarySource,
    attemptIndex: run.attemptIndex,
    runStatus: run.status,
    totalSteps: run.totalSteps,
    totalToolCalls: run.totalToolCalls,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    isSelected,
    isHydrated: snapshot !== undefined,
    association: join.strategy,
    trajectoryBadge: deriveTrajectoryBadge(run, snapshot),
    records: detail?.durableEvents ?? [],
    spans: detail?.snapshot.spans ?? [],
    liveTail: detail?.liveTail ?? [],
  };
}

function deriveTrajectoryBadge(
  run: ProjectedRun,
  snapshot: TrajectorySnapshotCacheEntry | undefined,
): TrajectoryBadge {
  if (run.summarySource === 'message.agent_run') {
    return {
      status: 'summary-only',
      source: 'message.agent_run',
      reason: 'durable-trajectory-unavailable',
    };
  }

  if (snapshot) {
    if (snapshot.truncated) {
      return {
        status: 'truncated',
        source: 'durable-snapshot',
        reason: snapshot.completeness.degraded_reason,
      };
    }
    if (snapshot.events.some(item => item.schemaVersion !== 1)) {
      const version = snapshot.events.find(item => item.schemaVersion !== 1)?.schemaVersion;
      return {
        status: 'legacy',
        source: 'durable-snapshot',
        reason: `schema-version-${version}`,
      };
    }
    if (snapshot.completeness.status === 'degraded' || run.trajectoryStatus === 'degraded') {
      return {
        status: 'degraded',
        source: 'durable-snapshot',
        reason: snapshot.completeness.degraded_reason,
      };
    }
    if (snapshot.completeness.status === 'complete') {
      return { status: 'complete', source: 'durable-snapshot', reason: null };
    }
  }

  return {
    status: normalizeTrajectoryBadgeStatus(run.trajectoryStatus),
    source: 'run-summary',
    reason: null,
  };
}

function normalizeTrajectoryBadgeStatus(value: string | null): TrajectoryBadgeStatus {
  if (value === 'recording' || value === 'complete' || value === 'degraded') return value;
  return 'unknown';
}

function projectDetailCells(detail: DetailContext, runCell: RunCell): TrajectoryCell[] {
  const cells: TrajectoryCell[] = [];
  const plans = new Map<string, PlanCell>();
  const tools = new Map<string, ToolCell>();
  const subtools = new Map<string, SubtoolCell>();
  const events = [
    ...detail.durableEvents.map(item => ({ item, source: 'durable-snapshot' as const })),
    ...detail.liveTail.map(item => ({ item, source: 'live-tail' as const })),
  ].sort((left, right) => left.item.sequence - right.item.sequence);

  for (const { item, source } of events) {
    if (item.eventType === 'plan_snapshot' || item.eventType === 'plan_step_updated') {
      const planId = stringValue(item.payload.plan_id) ?? `sequence-${item.sequence}`;
      const existing = plans.get(planId);
      if (existing) {
        updateEventBackedCell(existing, item, source);
        existing.revision = numberValue(item.payload.revision);
        existing.payload = item.payload;
      } else {
        const cell: PlanCell = {
          ...detailBase(runCell, source, item.sequence),
          key: `run:${detail.run.runId}:plan:${planId}`,
          type: 'plan',
          runId: detail.run.runId,
          planId,
          revision: numberValue(item.payload.revision),
          payload: item.payload,
        };
        plans.set(planId, cell);
        cells.push(cell);
      }
      continue;
    }

    if (item.eventType === 'context_status_updated'
      || item.eventType === 'context_required'
      || item.eventType === 'context_result') {
      const contextId = stringValue(item.payload.request_id)
        ?? `${item.eventType}:${numberValue(item.payload.round_index) ?? item.sequence}`;
      cells.push({
        ...detailBase(runCell, source, item.sequence),
        key: `run:${detail.run.runId}:context:${contextId}:${item.sequence}`,
        type: 'context',
        runId: detail.run.runId,
        contextId,
        eventType: item.eventType,
        payload: item.payload,
      });
      if (item.eventType === 'context_status_updated' && isCompaction(item.payload)) {
        cells.push({
          ...detailBase(runCell, source, item.sequence),
          key: `run:${detail.run.runId}:compacted:${item.sequence}`,
          type: 'compacted',
          runId: detail.run.runId,
          roundIndex: numberValue(item.payload.round_index),
          removedTurns: numberValue(item.payload.removed_turns) ?? 0,
          removedMessages: numberValue(item.payload.removed_messages) ?? 0,
          removedToolTransactions: numberValue(item.payload.removed_tool_transactions) ?? 0,
        });
      }
      continue;
    }

    if (item.eventType.startsWith('tool_call_') && item.toolCallId) {
      const existing = tools.get(item.toolCallId);
      if (existing) {
        updateEventBackedCell(existing, item, source);
        existing.events.push(item);
        existing.toolName = stringValue(item.payload.tool_name) ?? existing.toolName;
        existing.status = toolStatus(item, existing.status);
      } else {
        const cell: ToolCell = {
          ...detailBase(runCell, source, item.sequence),
          key: `run:${detail.run.runId}:tool:${item.toolCallId}`,
          type: 'tool',
          runId: detail.run.runId,
          toolCallId: item.toolCallId,
          stepId: item.stepId,
          toolName: stringValue(item.payload.tool_name),
          status: toolStatus(item, 'running'),
          events: [item],
        };
        tools.set(item.toolCallId, cell);
        cells.push(cell);
      }
      continue;
    }

    if (item.eventType === 'tool_attempt_started' || item.eventType === 'tool_attempt_completed') {
      const attemptId = stringValue(item.payload.tool_attempt_id) ?? `sequence-${item.sequence}`;
      const existing = subtools.get(attemptId);
      if (existing) {
        updateEventBackedCell(existing, item, source);
        existing.events.push(item);
        existing.toolName = stringValue(item.payload.tool_name) ?? existing.toolName;
        existing.status = toolStatus(item, existing.status);
      } else {
        const cell: SubtoolCell = {
          ...detailBase(runCell, source, item.sequence),
          key: `run:${detail.run.runId}:subtool:${attemptId}`,
          type: 'subtool',
          runId: detail.run.runId,
          toolCallId: item.toolCallId,
          toolAttemptId: attemptId,
          toolName: stringValue(item.payload.tool_name),
          attemptIndex: numberValue(item.payload.attempt_index),
          status: toolStatus(item, 'running'),
          events: [item],
        };
        subtools.set(attemptId, cell);
        cells.push(cell);
      }
    }
  }

  return cells;
}

function detailBase(
  runCell: RunCell,
  source: 'durable-snapshot' | 'live-tail',
  sequence: number,
): Omit<TrajectoryCellBase, 'key' | 'type' | 'runId'> {
  return {
    userMessageId: runCell.userMessageId,
    assistantMessageId: runCell.assistantMessageId,
    completenessSources: [source],
    sourceSequences: [sequence],
  };
}

function updateEventBackedCell(
  cell: TrajectoryCellBase,
  item: NormalizedTrajectoryEvent,
  source: 'durable-snapshot' | 'live-tail',
): void {
  cell.sourceSequences.push(item.sequence);
  if (!cell.completenessSources.includes(source)) cell.completenessSources.push(source);
}

function toolStatus(item: NormalizedTrajectoryEvent, fallback: string): string {
  if (item.eventType.endsWith('_started') || item.eventType.endsWith('_delta')) return 'running';
  return stringValue(item.payload.status) ?? fallback;
}

function isCompaction(payload: Record<string, unknown>): boolean {
  return (numberValue(payload.removed_turns) ?? 0) > 0
    || (numberValue(payload.removed_messages) ?? 0) > 0
    || (numberValue(payload.removed_tool_transactions) ?? 0) > 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isSpecializedProjectableEvent(item: NormalizedTrajectoryEvent): boolean {
  if (item.eventType === 'plan_snapshot' || item.eventType === 'plan_step_updated') return true;
  if (item.eventType === 'context_status_updated'
    || item.eventType === 'context_required'
    || item.eventType === 'context_result') return true;
  if (item.eventType === 'tool_attempt_started' || item.eventType === 'tool_attempt_completed') {
    return true;
  }
  return item.eventType.startsWith('tool_call_') && item.toolCallId !== null;
}
