import type { ContextUsage } from '@/types/conversation';

export type ContextUsagePhase = 'estimated' | 'final' | 'error';
export type ContextUsageErrorKind = 'not_sent' | 'check_failed';

export interface ConversationContextStatus {
  usage: ContextUsage | null;
  phase: ContextUsagePhase | null;
  pending: boolean;
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
  const usedTokens = usage.actual_prompt_tokens ?? usage.estimated_tokens_after;
  const windowTokens = usage.window_tokens;
  const remainingPercent = usedTokens !== null && windowTokens !== null
    ? Math.max(0, Math.min(100, Math.floor((1 - usedTokens / windowTokens) * 100)))
    : null;

  return {
    phase: usage.actual_prompt_tokens !== null
      ? 'actual'
      : usedTokens !== null
        ? 'estimated'
        : 'unavailable',
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
): ConversationContextStatus {
  const errorKind = usage ? errorKindFromStatus(usage.status) : null;
  const effectiveErrorKind = phase === 'error' ? (errorKind ?? 'check_failed') : errorKind;
  return {
    usage,
    phase: effectiveErrorKind ? 'error' : phase,
    pending: effectiveErrorKind ? false : pending,
    errorKind: effectiveErrorKind,
  };
}

export function selectConversationContextStatus(
  state: ContextStateLike,
  conversationId: string | null | undefined,
): ConversationContextStatus | null {
  if (!conversationId) return null;

  const messages = state.conversation?.byId?.[conversationId]?.messages ?? [];
  const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant');
  if (state.stream?.isStreaming && state.stream.conversationId === conversationId) {
    const liveUsage = normalizeContextUsage(state.stream.contextUsage);
    const phase = state.stream.contextUsageMeta?.phase ?? 'estimated';
    return toContextStatus(liveUsage, phase, liveUsage === null && phase !== 'error');
  }

  const persistedUsage = normalizeContextUsage(latestAssistant?.usage?.context);
  if (persistedUsage) {
    return toContextStatus(persistedUsage, null, false);
  }

  if (state.stream?.contextUsageConversationId !== conversationId) return null;
  const retainedUsage = normalizeContextUsage(state.stream.contextUsage);
  if (!retainedUsage || !latestAssistant?.id) return null;

  const metaMessageId = state.stream.contextUsageMeta?.messageId;
  const currentRun = state.stream.currentRun;
  const belongsToLatestAssistant =
    metaMessageId === latestAssistant.id
    || currentRun?.messageId === latestAssistant.id
    || currentRun?.serverMessageId === latestAssistant.id;
  if (!belongsToLatestAssistant) return null;

  return toContextStatus(
    retainedUsage,
    state.stream.contextUsageMeta?.phase ?? null,
    false,
  );
}

export function selectConversationContextUsage(
  state: ContextStateLike,
  conversationId: string | null | undefined,
): ContextUsage | null {
  return selectConversationContextStatus(state, conversationId)?.usage ?? null;
}
