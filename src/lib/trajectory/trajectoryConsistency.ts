import type { TrajectorySnapshotCacheEntry } from '@/redux/slices/trajectorySlice';
import type { Message } from '@/types/conversation';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import type { TrajectoryCell, TrajectoryRunJoin } from './TrajectoryCellProjection';

const CURRENT_TRAJECTORY_SCHEMA_VERSION = 1;

export type StrictParityExclusion =
  | 'incomplete-trajectory'
  | 'truncated'
  | 'unsupported-schema';

export interface StrictParityCohort {
  eligible: boolean;
  exclusions: StrictParityExclusion[];
}

export interface EventProjectionParityResult {
  status: 'pass' | 'fail' | 'excluded';
  cohort: StrictParityCohort;
  expectedSequences: number[];
  projectedSequences: number[];
  missingSequences: number[];
  unexpectedSequences: number[];
  expectedDigests: CanonicalProjectionDigest[];
  projectedDigests: CanonicalProjectionDigest[];
  missingDigests: CanonicalProjectionDigest[];
  unexpectedDigests: CanonicalProjectionDigest[];
}

export interface CanonicalProjectionDigest {
  cellKind: Exclude<TrajectoryCell['type'], 'user' | 'message'>;
  runId: string;
  userMessageId: string | null;
  assistantMessageId: string | null;
  entityId: string;
  sequences: number[];
  normalizedFields: Record<string, unknown>;
}

export interface LiveDurableReconciliationResult {
  status: 'reconciled' | 'conflict';
  durableLastSequence: number | null;
  overlapSequences: number[];
  conflictSequences: number[];
  prefixGapSequences: number[];
  liveTailSequences: number[];
}

export type MessageJoinIssueCode =
  | 'duplicate-run'
  | 'strategy-bucket-mismatch'
  | 'strategy-required-id-missing'
  | 'strategy-forbidden-id'
  | 'user-message-missing'
  | 'user-role-mismatch'
  | 'assistant-message-missing'
  | 'assistant-role-mismatch'
  | 'legacy-user-not-adjacent';

export interface MessageJoinIssue {
  runId: string;
  code: MessageJoinIssueCode;
}

export interface MessageJoinInvariantResult {
  status: 'pass' | 'fail';
  issues: MessageJoinIssue[];
}

/** 只有完整、未截断且使用当前 schema 的快照进入严格事件一致性队列。 */
export function selectStrictParityCohort(
  snapshot: TrajectorySnapshotCacheEntry,
): StrictParityCohort {
  const exclusions: StrictParityExclusion[] = [];
  if (snapshot.completeness.status !== 'complete') exclusions.push('incomplete-trajectory');
  if (snapshot.truncated) exclusions.push('truncated');
  if (snapshot.events.some(event => event.schemaVersion !== CURRENT_TRAJECTORY_SCHEMA_VERSION)) {
    exclusions.push('unsupported-schema');
  }
  return { eligible: exclusions.length === 0, exclusions };
}

export function evaluateEventProjectionParity(input: {
  snapshot: TrajectorySnapshotCacheEntry;
  cells: TrajectoryCell[];
  join: TrajectoryRunJoin;
}): EventProjectionParityResult {
  const cohort = selectStrictParityCohort(input.snapshot);
  const runId = input.snapshot.run.run_id;
  const expectedLastSequence = input.snapshot.completeness.expected_last_sequence;
  const expectedSequences = cohort.eligible
    && expectedLastSequence !== null
    && Number.isInteger(expectedLastSequence)
    && expectedLastSequence >= 0
    ? Array.from({ length: expectedLastSequence + 1 }, (_, sequence) => sequence)
    : uniqueSorted(input.snapshot.events.map(event => event.sequence));
  const projectedSequences = uniqueSorted(input.cells
    .filter(cell => cell.runId === runId)
    .flatMap(cell => cell.sourceSequences));
  const expectedSet = new Set(expectedSequences);
  const projectedSet = new Set(projectedSequences);
  const missingSequences = expectedSequences.filter(sequence => !projectedSet.has(sequence));
  const unexpectedSequences = projectedSequences.filter(sequence => !expectedSet.has(sequence));
  const expectedDigests = buildExpectedProjectionDigests(input.snapshot.events, input.join);
  const projectedDigests = buildProjectedDigests(input.cells, runId);
  const { missingDigests, unexpectedDigests } = diffDigests(expectedDigests, projectedDigests);

  return {
    status: cohort.eligible
      ? (missingSequences.length === 0
        && unexpectedSequences.length === 0
        && missingDigests.length === 0
        && unexpectedDigests.length === 0
        ? 'pass'
        : 'fail')
      : 'excluded',
    cohort,
    expectedSequences,
    projectedSequences,
    missingSequences,
    unexpectedSequences,
    expectedDigests,
    projectedDigests,
    missingDigests,
    unexpectedDigests,
  };
}

export function evaluateLiveDurableReconciliation(input: {
  durableEvents: NormalizedTrajectoryEvent[];
  liveEvents: NormalizedTrajectoryEvent[];
}): LiveDurableReconciliationResult {
  const durableBySequence = new Map<number, NormalizedTrajectoryEvent>();
  for (const event of input.durableEvents) {
    if (!durableBySequence.has(event.sequence)) durableBySequence.set(event.sequence, event);
  }
  const durableLastSequence = durableBySequence.size
    ? Math.max(...durableBySequence.keys())
    : null;
  const overlapSequences = new Set<number>();
  const conflictSequences = new Set<number>();
  const prefixGapSequences = new Set<number>();
  const liveTailSequences = new Set<number>();

  for (const liveEvent of input.liveEvents) {
    const durableEvent = durableBySequence.get(liveEvent.sequence);
    if (durableEvent) {
      overlapSequences.add(liveEvent.sequence);
      if (!eventsEqual(durableEvent, liveEvent)) conflictSequences.add(liveEvent.sequence);
    } else if (durableLastSequence === null || liveEvent.sequence > durableLastSequence) {
      liveTailSequences.add(liveEvent.sequence);
    } else {
      prefixGapSequences.add(liveEvent.sequence);
    }
  }

  return {
    status: conflictSequences.size > 0 || prefixGapSequences.size > 0
      ? 'conflict'
      : 'reconciled',
    durableLastSequence,
    overlapSequences: uniqueSorted([...overlapSequences]),
    conflictSequences: uniqueSorted([...conflictSequences]),
    prefixGapSequences: uniqueSorted([...prefixGapSequences]),
    liveTailSequences: uniqueSorted([...liveTailSequences]),
  };
}

export function evaluateMessageJoinInvariants(input: {
  messages: Message[];
  joins: TrajectoryRunJoin[];
}): MessageJoinInvariantResult {
  const messagesById = new Map(input.messages.map((message, index) => [message.id, { message, index }]));
  const seenRunIds = new Set<string>();
  const issues: MessageJoinIssue[] = [];

  for (const join of input.joins) {
    if (seenRunIds.has(join.runId)) {
      issues.push({ runId: join.runId, code: 'duplicate-run' });
      continue;
    }
    seenRunIds.add(join.runId);

    const shapeIssue = joinShapeIssue(join);
    if (shapeIssue) {
      issues.push({ runId: join.runId, code: shapeIssue });
      continue;
    }

    const user = join.userMessageId ? messagesById.get(join.userMessageId) : undefined;
    const assistant = join.assistantMessageId
      ? messagesById.get(join.assistantMessageId)
      : undefined;
    if (join.userMessageId && !user) {
      issues.push({ runId: join.runId, code: 'user-message-missing' });
      continue;
    }
    if (user && user.message.role !== 'user') {
      issues.push({ runId: join.runId, code: 'user-role-mismatch' });
      continue;
    }
    if (join.assistantMessageId && !assistant) {
      issues.push({ runId: join.runId, code: 'assistant-message-missing' });
      continue;
    }
    if (assistant && assistant.message.role !== 'assistant') {
      issues.push({ runId: join.runId, code: 'assistant-role-mismatch' });
      continue;
    }
    if (join.strategy === 'legacy-adjacent-user'
      && (!user || !assistant || user.index !== assistant.index - 1)) {
      issues.push({ runId: join.runId, code: 'legacy-user-not-adjacent' });
    }
  }

  return { status: issues.length === 0 ? 'pass' : 'fail', issues };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function eventsEqual(
  left: NormalizedTrajectoryEvent,
  right: NormalizedTrajectoryEvent,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface ExpectedDigestGroup {
  cellKind: CanonicalProjectionDigest['cellKind'];
  entityId: string;
  events: NormalizedTrajectoryEvent[];
}

function buildExpectedProjectionDigests(
  events: NormalizedTrajectoryEvent[],
  join: TrajectoryRunJoin,
): CanonicalProjectionDigest[] {
  const groups = new Map<string, ExpectedDigestGroup>();
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    for (const identity of expectedCellIdentities(event)) {
      const key = `${identity.cellKind}:${identity.entityId}`;
      const group = groups.get(key) ?? { ...identity, events: [] };
      group.events.push(event);
      groups.set(key, group);
    }
  }

  return sortDigests([...groups.values()].map(group => ({
    cellKind: group.cellKind,
    runId: join.runId,
    userMessageId: join.userMessageId,
    assistantMessageId: join.assistantMessageId,
    entityId: group.entityId,
    sequences: uniqueSorted(group.events.map(event => event.sequence)),
    normalizedFields: expectedNormalizedFields(group),
  })));
}

function expectedCellIdentities(event: NormalizedTrajectoryEvent): Array<{
  cellKind: CanonicalProjectionDigest['cellKind'];
  entityId: string;
}> {
  if (event.eventType.startsWith('llm_round_')) {
    const llmRoundId = stringValue(event.payload.llm_round_id);
    return llmRoundId
      ? [{ cellKind: 'assistant_request', entityId: llmRoundId }]
      : [{ cellKind: 'run', entityId: event.runId }];
  }
  if (event.eventType === 'plan_snapshot' || event.eventType === 'plan_step_updated') {
    return [{
      cellKind: 'plan',
      entityId: stringValue(event.payload.plan_id) ?? `sequence-${event.sequence}`,
    }];
  }
  if (event.eventType === 'context_status_updated'
    || event.eventType === 'context_required'
    || event.eventType === 'context_result') {
    const contextId = stringValue(event.payload.request_id)
      ?? `${event.eventType}:${numberValue(event.payload.round_index) ?? event.sequence}`;
    const identities: ReturnType<typeof expectedCellIdentities> = [{
      cellKind: 'context',
      entityId: contextId,
    }];
    if (event.eventType === 'context_status_updated' && isCompaction(event.payload)) {
      identities.push({ cellKind: 'compacted', entityId: String(event.sequence) });
    }
    return identities;
  }
  if (event.eventType.startsWith('tool_call_') && event.toolCallId) {
    return [{ cellKind: 'tool', entityId: event.toolCallId }];
  }
  if (event.eventType === 'tool_attempt_started' || event.eventType === 'tool_attempt_completed') {
    return [{
      cellKind: 'subtool',
      entityId: stringValue(event.payload.tool_attempt_id) ?? `sequence-${event.sequence}`,
    }];
  }
  return [{ cellKind: 'run', entityId: event.runId }];
}

function expectedNormalizedFields(group: ExpectedDigestGroup): Record<string, unknown> {
  const events = [...group.events].sort((left, right) => left.sequence - right.sequence);
  const first = events[0];
  const latest = events.at(-1) as NormalizedTrajectoryEvent;
  if (group.cellKind === 'run') return { events: events.map(canonicalEvent) };
  if (group.cellKind === 'plan') {
    return {
      planId: group.entityId,
      revision: numberValue(latest.payload.revision),
      payload: latest.payload,
    };
  }
  if (group.cellKind === 'context') {
    return {
      contextId: group.entityId,
      eventType: latest.eventType,
      payload: latest.payload,
    };
  }
  if (group.cellKind === 'compacted') {
    return {
      roundIndex: numberValue(latest.payload.round_index),
      removedTurns: numberValue(latest.payload.removed_turns) ?? 0,
      removedMessages: numberValue(latest.payload.removed_messages) ?? 0,
      removedToolTransactions: numberValue(latest.payload.removed_tool_transactions) ?? 0,
    };
  }
  if (group.cellKind === 'tool') {
    return {
      toolCallId: group.entityId,
      stepId: first.stepId,
      toolName: latestStringValue(events, 'tool_name'),
      status: latestToolStatus(events),
      events: events.map(canonicalEvent),
    };
  }
  if (group.cellKind === 'assistant_request') {
    return {
      llmRoundId: group.entityId,
      roundIndex: latestNumberValue(events, 'round_index'),
      model: latestStringValue(events, 'model'),
      provider: latestStringValue(events, 'provider'),
      status: latestLlmRoundStatus(events),
      inputTokens: latestNumberValue(events, 'input_tokens'),
      outputTokens: latestNumberValue(events, 'output_tokens'),
      reasoningTokens: latestNumberValue(events, 'reasoning_tokens'),
      durationMs: latestNumberValue(events, 'duration_ms'),
      ttftMs: latestNumberValue(events, 'ttft_ms'),
      events: events.map(canonicalEvent),
    };
  }
  return {
    toolCallId: first.toolCallId,
    toolAttemptId: group.entityId,
    toolName: latestStringValue(events, 'tool_name'),
    attemptIndex: numberValue(first.payload.attempt_index),
    status: latestToolStatus(events),
    events: events.map(canonicalEvent),
  };
}

function buildProjectedDigests(
  cells: TrajectoryCell[],
  runId: string,
): CanonicalProjectionDigest[] {
  const digests = cells.flatMap((cell): CanonicalProjectionDigest[] => {
    if (cell.runId !== runId) return [];
    const base = {
      cellKind: cell.type,
      runId: cell.runId,
      userMessageId: cell.userMessageId,
      assistantMessageId: cell.assistantMessageId,
      sequences: uniqueSorted(cell.sourceSequences),
    };
    if (cell.type === 'run') {
      const sourceSequences = new Set(cell.sourceSequences);
      const events = [...cell.records, ...cell.liveTail]
        .filter(event => sourceSequences.has(event.sequence))
        .sort((left, right) => left.sequence - right.sequence);
      return [{
        ...base,
        entityId: cell.runId,
        normalizedFields: { events: events.map(canonicalEvent) },
      }];
    }
    if (cell.type === 'plan') {
      return [{
        ...base,
        entityId: cell.planId,
        normalizedFields: {
          planId: cell.planId,
          revision: cell.revision,
          payload: cell.payload,
        },
      }];
    }
    if (cell.type === 'context') {
      return [{
        ...base,
        entityId: cell.contextId,
        normalizedFields: {
          contextId: cell.contextId,
          eventType: cell.eventType,
          payload: cell.payload,
        },
      }];
    }
    if (cell.type === 'compacted') {
      return [{
        ...base,
        entityId: String(cell.sourceSequences[0]),
        normalizedFields: {
          roundIndex: cell.roundIndex,
          removedTurns: cell.removedTurns,
          removedMessages: cell.removedMessages,
          removedToolTransactions: cell.removedToolTransactions,
        },
      }];
    }
    if (cell.type === 'tool') {
      return [{
        ...base,
        entityId: cell.toolCallId,
        normalizedFields: {
          toolCallId: cell.toolCallId,
          stepId: cell.stepId,
          toolName: cell.toolName,
          status: cell.status,
          events: [...cell.events]
            .sort((left, right) => left.sequence - right.sequence)
            .map(canonicalEvent),
        },
      }];
    }
    if (cell.type === 'assistant_request') {
      return [{
        ...base,
        entityId: cell.llmRoundId,
        normalizedFields: {
          llmRoundId: cell.llmRoundId,
          roundIndex: cell.roundIndex,
          model: cell.model,
          provider: cell.provider,
          status: cell.status,
          inputTokens: cell.inputTokens,
          outputTokens: cell.outputTokens,
          reasoningTokens: cell.reasoningTokens,
          durationMs: cell.durationMs,
          ttftMs: cell.ttftMs,
          events: [...cell.events]
            .sort((left, right) => left.sequence - right.sequence)
            .map(canonicalEvent),
        },
      }];
    }
    return [{
      ...base,
      entityId: cell.toolAttemptId,
      normalizedFields: {
        toolCallId: cell.toolCallId,
        toolAttemptId: cell.toolAttemptId,
        toolName: cell.toolName,
        attemptIndex: cell.attemptIndex,
        status: cell.status,
        events: [...cell.events]
          .sort((left, right) => left.sequence - right.sequence)
          .map(canonicalEvent),
      },
    }];
  });
  return sortDigests(digests);
}

function canonicalEvent(event: NormalizedTrajectoryEvent): Record<string, unknown> {
  return {
    sequence: event.sequence,
    eventType: event.eventType,
    stepId: event.stepId,
    toolCallId: event.toolCallId,
    parentStepId: event.parentStepId,
    traceId: event.traceId,
    payload: event.payload,
  };
}

function diffDigests(
  expected: CanonicalProjectionDigest[],
  projected: CanonicalProjectionDigest[],
): Pick<EventProjectionParityResult, 'missingDigests' | 'unexpectedDigests'> {
  const projectedByKey = new Map<string, CanonicalProjectionDigest[]>();
  for (const digest of projected) {
    const key = stableStringify(digest);
    const matches = projectedByKey.get(key) ?? [];
    matches.push(digest);
    projectedByKey.set(key, matches);
  }
  const missingDigests: CanonicalProjectionDigest[] = [];
  for (const digest of expected) {
    const key = stableStringify(digest);
    const matches = projectedByKey.get(key);
    if (!matches?.length) missingDigests.push(digest);
    else matches.pop();
  }
  return {
    missingDigests,
    unexpectedDigests: [...projectedByKey.values()].flat(),
  };
}

function sortDigests(digests: CanonicalProjectionDigest[]): CanonicalProjectionDigest[] {
  const kindOrder: Record<CanonicalProjectionDigest['cellKind'], number> = {
    run: 0,
    plan: 1,
    context: 2,
    compacted: 3,
    assistant_request: 4,
    tool: 5,
    subtool: 6,
  };
  return digests.sort((left, right) => {
    const sequence = (left.sequences[0] ?? Number.MAX_SAFE_INTEGER)
      - (right.sequences[0] ?? Number.MAX_SAFE_INTEGER);
    if (sequence !== 0) return sequence;
    const kind = kindOrder[left.cellKind] - kindOrder[right.cellKind];
    return kind || left.entityId.localeCompare(right.entityId);
  });
}

function latestStringValue(events: NormalizedTrajectoryEvent[], field: string): string | null {
  let latest: string | null = null;
  for (const event of events) latest = stringValue(event.payload[field]) ?? latest;
  return latest;
}

function latestNumberValue(events: NormalizedTrajectoryEvent[], field: string): number | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const value = numberValue(events[index].payload[field]);
    if (value !== null) return value;
  }
  return null;
}

function latestLlmRoundStatus(events: NormalizedTrajectoryEvent[]): string {
  const latest = events.at(-1);
  if (!latest || latest.eventType === 'llm_round_started'
    || latest.eventType === 'llm_round_first_output_delta') return 'running';
  if (latest.eventType === 'llm_round_completed') {
    return stringValue(latest.payload.status) ?? 'success';
  }
  if (latest.eventType === 'llm_round_failed') {
    return stringValue(latest.payload.status) ?? 'failed';
  }
  if (latest.eventType === 'llm_round_cancelled') {
    return stringValue(latest.payload.status) ?? 'cancelled';
  }
  return 'running';
}

function latestToolStatus(events: NormalizedTrajectoryEvent[]): string {
  let status = 'running';
  for (const event of events) {
    status = event.eventType.endsWith('_started') || event.eventType.endsWith('_delta')
      ? 'running'
      : (stringValue(event.payload.status) ?? status);
  }
  return status;
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => (
      `${JSON.stringify(key)}:${stableStringify(record[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function joinShapeIssue(join: TrajectoryRunJoin): MessageJoinIssueCode | null {
  if (join.strategy === 'unassociated') {
    if (join.bucket !== 'unassociated') return 'strategy-bucket-mismatch';
    return join.userMessageId === null ? null : 'strategy-forbidden-id';
  }
  if (join.bucket !== 'conversation') return 'strategy-bucket-mismatch';

  if (join.strategy === 'explicit') {
    return join.userMessageId === null ? 'strategy-required-id-missing' : null;
  }
  if (join.strategy === 'assistant-only') {
    if (join.assistantMessageId === null) return 'strategy-required-id-missing';
    return join.userMessageId === null ? null : 'strategy-forbidden-id';
  }
  if (join.strategy === 'legacy-adjacent-user') {
    return join.userMessageId === null || join.assistantMessageId === null
      ? 'strategy-required-id-missing'
      : null;
  }
  return join.assistantMessageId === null ? 'strategy-required-id-missing' : null;
}
