import type { KnowledgeSelectionStatus } from '@/lib/chat/knowledgeBaseCatalogResource';
import type { TrajectoryReconciliationStatus, TrajectoryRunListStatus } from '@/redux/slices/trajectorySlice';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary } from '@/types/trajectory';

export type TrajectoryActionBlocker =
  | 'run-not-selected'
  | 'run-not-terminal'
  | 'run-list-not-ready'
  | 'trajectory-unverified'
  | 'trajectory-legacy'
  | 'trajectory-degraded'
  | 'trajectory-truncated'
  | 'run-turn-missing'
  | 'run-not-last-turn'
  | 'run-attempt-ambiguous'
  | 'run-not-latest-attempt'
  | 'active-stream'
  | 'retry-capability-unavailable'
  | 'model-unavailable'
  | 'knowledge-unavailable'
  | 'knowledge-attachment-conflict'
  | 'run-not-limit-reached'
  | 'assistant-message-missing'
  | 'knowledge-continuation-unsupported';

export interface TrajectoryRunActionTarget {
  previousRunId: string;
  retryMessageId: string;
  userMessageId: string;
  assistantMessageId: string | null;
}

export interface TrajectoryActionDecision {
  allowed: boolean;
  blockers: TrajectoryActionBlocker[];
}

export interface TrajectoryActionPolicyResult {
  terminal: boolean;
  target: TrajectoryRunActionTarget | null;
  retry: TrajectoryActionDecision;
  continue: TrajectoryActionDecision;
}

export interface TrajectoryActionPolicyInput {
  runs: readonly TrajectoryRunSummary[];
  messages: readonly Message[];
  selectedRunId: string | null;
  runListStatus: TrajectoryRunListStatus;
  selectedRunHydrated: boolean;
  selectedTrajectoryStatus: string | null;
  selectedRunTruncated: boolean;
  reconciliationStatus: TrajectoryReconciliationStatus | null;
  hasActiveStream: boolean;
  retryCapabilityAvailable: boolean;
  modelAvailable: boolean;
  knowledgeBaseStatus: KnowledgeSelectionStatus;
  knowledgeBaseIds: readonly string[];
}

const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'error',
  'failed',
  'interrupted',
  'incomplete',
  'limit_reached',
]);

function pushUnique(
  blockers: TrajectoryActionBlocker[],
  blocker: TrajectoryActionBlocker,
): void {
  if (!blockers.includes(blocker)) blockers.push(blocker);
}

function decision(blockers: TrajectoryActionBlocker[]): TrajectoryActionDecision {
  return { allowed: blockers.length === 0, blockers };
}

function latestUserMessageId(messages: readonly Message[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].id;
  }
  return null;
}

function messageById(
  messages: readonly Message[],
  messageId: string | null,
  role: Message['role'],
): Message | null {
  if (!messageId) return null;
  return messages.find(message => message.id === messageId && message.role === role) ?? null;
}

function trajectoryIntegrityBlocker(
  status: string | null,
  truncated: boolean,
): TrajectoryActionBlocker | null {
  if (truncated || status === 'truncated') return 'trajectory-truncated';
  if (status === 'legacy') return 'trajectory-legacy';
  if (status === 'degraded') return 'trajectory-degraded';
  return status === 'complete' ? null : 'trajectory-unverified';
}

/** 为所选 run 派生唯一、保守的 retry/continue 可操作性与请求目标。 */
export function resolveTrajectoryActionPolicy(
  input: TrajectoryActionPolicyInput,
): TrajectoryActionPolicyResult {
  const selectedRun = input.selectedRunId
    ? input.runs.find(run => run.run_id === input.selectedRunId) ?? null
    : null;
  const terminal = Boolean(selectedRun && TERMINAL_RUN_STATUSES.has(selectedRun.status));
  const sharedBlockers: TrajectoryActionBlocker[] = [];

  if (!selectedRun) pushUnique(sharedBlockers, 'run-not-selected');
  if (selectedRun && !terminal) pushUnique(sharedBlockers, 'run-not-terminal');
  if (input.runListStatus !== 'ready') pushUnique(sharedBlockers, 'run-list-not-ready');

  const integrityBlocker = trajectoryIntegrityBlocker(
    input.selectedTrajectoryStatus ?? selectedRun?.trajectory_status ?? null,
    input.selectedRunTruncated,
  );
  if (integrityBlocker) pushUnique(sharedBlockers, integrityBlocker);
  if (!input.selectedRunHydrated || input.reconciliationStatus !== 'ready') {
    pushUnique(sharedBlockers, 'trajectory-unverified');
  }

  const userMessage = messageById(
    input.messages,
    selectedRun?.turn_message_id ?? null,
    'user',
  );
  const assistantMessage = messageById(
    input.messages,
    selectedRun?.message_id ?? null,
    'assistant',
  );
  if (!selectedRun?.turn_message_id || !userMessage) {
    pushUnique(sharedBlockers, 'run-turn-missing');
  } else if (latestUserMessageId(input.messages) !== selectedRun.turn_message_id) {
    pushUnique(sharedBlockers, 'run-not-last-turn');
  }

  if (selectedRun) {
    const sameTurnAttempts = input.runs.filter(run => (
      run.turn_message_id !== null
      && run.turn_message_id === selectedRun.turn_message_id
    ));
    const knownAttemptIndexes = sameTurnAttempts
      .map(run => run.attempt_index)
      .filter((value): value is number => Number.isSafeInteger(value));
    const attemptIndexesAreUnambiguous = knownAttemptIndexes.length === sameTurnAttempts.length
      && new Set(knownAttemptIndexes).size === knownAttemptIndexes.length;
    if (!Number.isSafeInteger(selectedRun.attempt_index) || !attemptIndexesAreUnambiguous) {
      pushUnique(sharedBlockers, 'run-attempt-ambiguous');
    } else if (selectedRun.attempt_index !== Math.max(...knownAttemptIndexes)) {
      pushUnique(sharedBlockers, 'run-not-latest-attempt');
    }
  }

  if (input.hasActiveStream) pushUnique(sharedBlockers, 'active-stream');
  if (!input.retryCapabilityAvailable) {
    pushUnique(sharedBlockers, 'retry-capability-unavailable');
  }
  if (!input.modelAvailable) pushUnique(sharedBlockers, 'model-unavailable');
  if (input.knowledgeBaseStatus !== 'ready') {
    pushUnique(sharedBlockers, 'knowledge-unavailable');
  }

  const retryBlockers = [...sharedBlockers];
  const userHasAttachments = userMessage?.content.some(block => block.type === 'file') ?? false;
  if (input.knowledgeBaseIds.length > 0 && userHasAttachments) {
    pushUnique(retryBlockers, 'knowledge-attachment-conflict');
  }

  const continueBlockers = [...sharedBlockers];
  if (selectedRun?.status !== 'limit_reached') {
    pushUnique(continueBlockers, 'run-not-limit-reached');
  }
  if (!assistantMessage) pushUnique(continueBlockers, 'assistant-message-missing');
  if (assistantMessage?.content.some(block => block.type === 'knowledge_evidence')) {
    pushUnique(continueBlockers, 'knowledge-continuation-unsupported');
  }

  const retryMessageId = assistantMessage?.id ?? userMessage?.id ?? null;
  const target = selectedRun && userMessage && retryMessageId
    ? {
        previousRunId: selectedRun.run_id,
        retryMessageId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage?.id ?? null,
      }
    : null;
  if (!target) {
    pushUnique(retryBlockers, 'run-turn-missing');
    pushUnique(continueBlockers, 'run-turn-missing');
  }

  return {
    terminal,
    target,
    retry: decision(retryBlockers),
    continue: decision(continueBlockers),
  };
}
