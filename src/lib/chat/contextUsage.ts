import type { ContextUsage } from '@/types/conversation';

export type ContextUsagePhase = 'estimated' | 'final' | 'error';
export type ContextUsageErrorKind = 'not_sent' | 'check_failed';

export interface ConversationContextStatus {
  usage: ContextUsage | null;
  phase: ContextUsagePhase | null;
  pending: boolean;
  updating: boolean;
  latestActualUnavailable: boolean;
  errorKind: ContextUsageErrorKind | null;
}

export interface ContextUsageView {
  phase: 'actual' | 'estimated' | 'unavailable';
  usedTokens: number | null;
  windowTokens: number | null;
  remainingPercent: number | null;
  optimized: boolean;
  removedTurns: number;
  removedMessages: number;
  removedToolTransactions: number;
}

interface ContextStateLike {
  stream?: {
    isStreaming?: boolean;
    conversationId?: string | null;
    contextUsageConversationId?: string | null;
    contextUsage?: unknown;
    contextUsageMeta?: {
      runId?: string;
      messageId?: string;
      sequence?: number;
      phase?: ContextUsagePhase;
      roundIndex?: number | null;
    } | null;
    contextUsageInFlightConversationId?: string | null;
    contextUsageInFlight?: unknown;
    contextUsageInFlightMeta?: {
      runId?: string;
      messageId?: string;
      sequence?: number;
      phase?: ContextUsagePhase;
      roundIndex?: number | null;
    } | null;
    currentRun?: {
      runId?: string;
      messageId?: string;
      serverMessageId?: string;
    } | null;
  };
  conversation?: {
    byId?: Record<string, {
      messages?: Array<{
        id?: string;
        role?: string;
        usage?: { context?: unknown } | null;
      }>;
    }>;
  };
}

function nullableTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function removalCount(value: unknown): number {
  return nullableTokenCount(value) ?? 0;
}

function positiveInteger(value: unknown): number | null {
  const parsed = nullableTokenCount(value);
  return parsed !== null && parsed >= 1 ? parsed : null;
}

export function normalizeContextUsage(value: unknown): ContextUsage | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const status = typeof source.status === 'string' ? source.status.trim() : '';
  if (!status) return null;

  const windowTokens = nullableTokenCount(source.window_tokens);
  return {
    status,
    window_tokens: windowTokens && windowTokens > 0 ? windowTokens : null,
    estimated_tokens_before: nullableTokenCount(source.estimated_tokens_before),
    estimated_tokens_after: nullableTokenCount(source.estimated_tokens_after),
    actual_prompt_tokens: nullableTokenCount(source.actual_prompt_tokens),
    removed_turns: removalCount(source.removed_turns),
    removed_messages: removalCount(source.removed_messages),
    removed_tool_transactions: removalCount(source.removed_tool_transactions),
    round_index: positiveInteger(source.round_index),
  };
}

export function buildContextUsageView(usage: ContextUsage): ContextUsageView {
  const usedTokens = usage.actual_prompt_tokens;
  const windowTokens = usage.window_tokens;
  const remainingPercent = usedTokens !== null && windowTokens !== null
    ? Math.max(0, Math.min(100, Math.floor((1 - usedTokens / windowTokens) * 100)))
    : null;

  return {
    phase: usedTokens !== null ? 'actual' : 'unavailable',
    usedTokens,
    windowTokens,
    remainingPercent,
    optimized:
      usage.status === 'trimmed'
      || usage.removed_turns > 0
      || usage.removed_messages > 0
      || usage.removed_tool_transactions > 0,
    removedTurns: usage.removed_turns,
    removedMessages: usage.removed_messages,
    removedToolTransactions: usage.removed_tool_transactions,
  };
}

function errorKindFromStatus(status: string): ContextUsageErrorKind | null {
  if (status === 'required_context_over_budget') return 'not_sent';
  if (status === 'estimator_unavailable') return 'check_failed';
  return null;
}

function toContextStatus(
  usage: ContextUsage | null,
  phase: ContextUsagePhase | null,
  pending: boolean,
  updating = false,
  latestActualUnavailable = false,
  explicitErrorKind: ContextUsageErrorKind | null = null,
): ConversationContextStatus {
  const errorKind = usage ? errorKindFromStatus(usage.status) : null;
  const effectiveErrorKind = explicitErrorKind
    ?? (phase === 'error' ? (errorKind ?? 'check_failed') : errorKind);
  return {
    usage,
    phase: effectiveErrorKind ? 'error' : phase,
    pending: effectiveErrorKind ? false : pending,
    updating: effectiveErrorKind ? false : updating,
    latestActualUnavailable,
    errorKind: effectiveErrorKind,
  };
}

function actualUsage(value: unknown): ContextUsage | null {
  const usage = normalizeContextUsage(value);
  return usage
    && usage.actual_prompt_tokens !== null
    && !errorKindFromStatus(usage.status)
    ? usage
    : null;
}

function latestConfirmedUsage(
  messages: NonNullable<NonNullable<ContextStateLike['conversation']>['byId']>[string]['messages'],
): ContextUsage | null {
  if (!messages) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    const usage = actualUsage(message.usage?.context);
    if (usage) return usage;
  }
  return null;
}

function belongsToAssistant(
  meta: { runId?: string; messageId?: string } | null | undefined,
  latestAssistantId: string,
  currentRun: NonNullable<ContextStateLike['stream']>['currentRun'],
): boolean {
  if (meta?.messageId === latestAssistantId) return true;
  if (!currentRun || meta?.runId !== currentRun.runId) return false;
  return currentRun.messageId === latestAssistantId
    || currentRun.serverMessageId === latestAssistantId;
}

export function selectConversationContextStatus(
  state: ContextStateLike,
  conversationId: string | null | undefined,
): ConversationContextStatus | null {
  if (!conversationId) return null;

  const messages = state.conversation?.byId?.[conversationId]?.messages ?? [];
  const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant');
  if (state.stream?.isStreaming && state.stream.conversationId === conversationId) {
    const confirmedMatches = state.stream.contextUsageConversationId == null
      || state.stream.contextUsageConversationId === conversationId;
    const inFlightMatches = state.stream.contextUsageInFlightConversationId == null
      || state.stream.contextUsageInFlightConversationId === conversationId;
    const confirmedUsage = confirmedMatches ? actualUsage(state.stream.contextUsage) : null;
    const recentConfirmedUsage = confirmedUsage ?? latestConfirmedUsage(messages);
    const inFlightUsage = inFlightMatches
      ? normalizeContextUsage(state.stream.contextUsageInFlight)
      : null;
    const inFlightMeta = inFlightMatches ? state.stream.contextUsageInFlightMeta : null;
    const phase = inFlightMeta?.phase
      ?? (confirmedUsage && state.stream.contextUsageMeta?.phase === 'final' ? 'final' : 'estimated');

    if (phase === 'error' || (inFlightUsage && errorKindFromStatus(inFlightUsage.status))) {
      const errorKind = inFlightUsage
        ? (errorKindFromStatus(inFlightUsage.status) ?? 'check_failed')
        : 'check_failed';
      return toContextStatus(
        recentConfirmedUsage,
        'error',
        false,
        false,
        recentConfirmedUsage !== null,
        errorKind,
      );
    }

    if (phase === 'final') {
      const finalUsage = actualUsage(inFlightUsage) ?? (inFlightMeta ? null : confirmedUsage);
      return toContextStatus(
        finalUsage ?? recentConfirmedUsage,
        'final',
        false,
        false,
        finalUsage === null,
      );
    }

    if (recentConfirmedUsage) {
      return toContextStatus(recentConfirmedUsage, 'estimated', false, true);
    }
    return toContextStatus(null, 'estimated', true);
  }

  const retainedConfirmedMatches = state.stream?.contextUsageConversationId === conversationId;
  const retainedInFlightMatches = state.stream?.contextUsageInFlightConversationId === conversationId;
  const currentRun = state.stream?.currentRun;
  const inFlightMeta = retainedInFlightMatches ? state.stream?.contextUsageInFlightMeta : null;
  const inFlightUsage = retainedInFlightMatches
    ? normalizeContextUsage(state.stream?.contextUsageInFlight)
    : null;
  const latestAssistantId = latestAssistant?.id;
  const inFlightBelongs = latestAssistantId
    ? belongsToAssistant(inFlightMeta, latestAssistantId, currentRun)
    : false;
  const confirmedUsage = retainedConfirmedMatches ? actualUsage(state.stream?.contextUsage) : null;
  const confirmedBelongs = latestAssistantId
    ? belongsToAssistant(state.stream?.contextUsageMeta, latestAssistantId, currentRun)
    : false;
  const retainedConfirmedUsage = confirmedBelongs ? confirmedUsage : null;
  const persistedUsage = normalizeContextUsage(latestAssistant?.usage?.context);
  const latestAvailableUsage = retainedConfirmedUsage ?? actualUsage(persistedUsage);

  if (inFlightBelongs && (inFlightMeta?.phase === 'error' || (inFlightUsage && errorKindFromStatus(inFlightUsage.status)))) {
    const errorKind = inFlightUsage
      ? (errorKindFromStatus(inFlightUsage.status) ?? 'check_failed')
      : 'check_failed';
    return toContextStatus(
      latestAvailableUsage,
      'error',
      false,
      false,
      latestAvailableUsage !== null,
      errorKind,
    );
  }
  if (inFlightBelongs && inFlightMeta?.phase === 'final') {
    const finalUsage = actualUsage(inFlightUsage);
    return toContextStatus(
      finalUsage ?? latestAvailableUsage,
      'final',
      false,
      false,
      finalUsage === null,
    );
  }

  if (persistedUsage) {
    if (errorKindFromStatus(persistedUsage.status)) {
      return toContextStatus(persistedUsage, 'error', false);
    }
    return toContextStatus(actualUsage(persistedUsage), null, false);
  }

  if (!latestAssistant?.id) return null;

  if (!retainedConfirmedMatches && !retainedInFlightMatches) return null;

  const finalInFlightUsage = inFlightBelongs ? actualUsage(inFlightUsage) : null;
  const retainedUsage = retainedConfirmedUsage ?? finalInFlightUsage;
  if (!retainedUsage) return null;

  return toContextStatus(retainedUsage, 'final', false);
}

export function selectConversationContextUsage(
  state: ContextStateLike,
  conversationId: string | null | undefined,
): ContextUsage | null {
  return selectConversationContextStatus(state, conversationId)?.usage ?? null;
}
