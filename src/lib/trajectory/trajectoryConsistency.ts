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
}

export interface LiveDurableReconciliationResult {
  status: 'reconciled' | 'conflict';
  durableLastSequence: number | null;
  overlapSequences: number[];
  conflictSequences: number[];
  liveTailSequences: number[];
}

export type MessageJoinIssueCode =
  | 'duplicate-run'
  | 'user-message-missing'
  | 'user-role-mismatch'
  | 'assistant-message-missing'
  | 'assistant-role-mismatch'
  | 'conversation-run-unassociated'
  | 'unassociated-run-has-message'
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

  return {
    status: cohort.eligible
      ? (missingSequences.length === 0 && unexpectedSequences.length === 0 ? 'pass' : 'fail')
      : 'excluded',
    cohort,
    expectedSequences,
    projectedSequences,
    missingSequences,
    unexpectedSequences,
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
  const liveTailSequences = new Set<number>();

  for (const liveEvent of input.liveEvents) {
    const durableEvent = durableBySequence.get(liveEvent.sequence);
    if (durableEvent) {
      overlapSequences.add(liveEvent.sequence);
      if (!eventsEqual(durableEvent, liveEvent)) conflictSequences.add(liveEvent.sequence);
    } else if (durableLastSequence === null || liveEvent.sequence > durableLastSequence) {
      liveTailSequences.add(liveEvent.sequence);
    }
  }

  return {
    status: conflictSequences.size > 0 ? 'conflict' : 'reconciled',
    durableLastSequence,
    overlapSequences: uniqueSorted([...overlapSequences]),
    conflictSequences: uniqueSorted([...conflictSequences]),
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

    if (join.bucket === 'unassociated') {
      if (join.userMessageId !== null) {
        issues.push({ runId: join.runId, code: 'unassociated-run-has-message' });
        continue;
      }
      if (join.assistantMessageId) {
        const assistant = messagesById.get(join.assistantMessageId);
        if (!assistant) {
          issues.push({ runId: join.runId, code: 'assistant-message-missing' });
        } else if (assistant.message.role !== 'assistant') {
          issues.push({ runId: join.runId, code: 'assistant-role-mismatch' });
        }
      }
      continue;
    }
    if (join.userMessageId === null && join.assistantMessageId === null) {
      issues.push({ runId: join.runId, code: 'conversation-run-unassociated' });
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
    if (user?.message.role !== 'user') {
      issues.push({ runId: join.runId, code: 'user-role-mismatch' });
      continue;
    }
    if (join.assistantMessageId && !assistant) {
      issues.push({ runId: join.runId, code: 'assistant-message-missing' });
      continue;
    }
    if (assistant?.message.role !== 'assistant') {
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
