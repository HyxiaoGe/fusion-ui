"use client";

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleAlert, Gauge, Sparkles } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  buildContextUsageView,
  type ContextUsageErrorKind,
  type ContextUsagePhase,
} from '@/lib/chat/contextUsage';
import { cn } from '@/lib/utils';
import type { ContextUsage } from '@/types/conversation';
import i18n from '@/lib/i18n';
import { useHasOpenChatDetailOverlay } from './ChatDetailOverlayContext';

interface ContextStatusProps {
  conversationId: string;
  usage: ContextUsage | null;
  phase?: ContextUsagePhase | null;
  pending?: boolean;
  updating?: boolean;
  latestActualUnavailable?: boolean;
  errorKind?: ContextUsageErrorKind | null;
  isStreaming?: boolean;
  isFirstConversationTurn?: boolean;
}

export const CONTEXT_STATUS_OPEN_STORAGE_KEY = 'fusion.context-status.open.v1';
export const LEGACY_CONTEXT_STATUS_OPEN_STORAGE_KEY = 'fusion.context-status.default-open.v1';
export const CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY = 'fusion.context-status.pending-first-turn.v1';

function readPendingFirstTurnIds(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writePendingFirstTurnIds(ids: Set<string>): void {
  try {
    if (ids.size === 0) {
      window.sessionStorage.removeItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // sessionStorage 不可用时仅失去跨路由/刷新恢复，不影响当前窗口开关。
  }
}

function markPendingFirstTurn(conversationId: string): void {
  const ids = readPendingFirstTurnIds();
  ids.add(conversationId);
  writePendingFirstTurnIds(ids);
}

function hasPendingFirstTurn(conversationId: string): boolean {
  return readPendingFirstTurnIds().has(conversationId);
}

function clearPendingFirstTurn(conversationId: string): void {
  const ids = readPendingFirstTurnIds();
  if (!ids.delete(conversationId)) return;
  writePendingFirstTurnIds(ids);
}

function readOpenState(): boolean | null {
  let currentValue: string | null = null;
  try {
    currentValue = window.localStorage.getItem(CONTEXT_STATUS_OPEN_STORAGE_KEY);
  } catch {
    // localStorage 不可用时继续尝试当前标签页存储。
  }
  if (currentValue !== null) return currentValue === 'true';

  let sessionValue: string | null = null;
  try {
    sessionValue = window.sessionStorage.getItem(CONTEXT_STATUS_OPEN_STORAGE_KEY);
  } catch {
    // sessionStorage 不可用时继续尝试旧版偏好。
  }
  if (sessionValue !== null) {
    const open = sessionValue === 'true';
    try {
      window.localStorage.setItem(CONTEXT_STATUS_OPEN_STORAGE_KEY, String(open));
      window.sessionStorage.removeItem(CONTEXT_STATUS_OPEN_STORAGE_KEY);
    } catch {
      // 迁移失败时仍使用已读出的标签页状态。
    }
    return open;
  }

  let legacyValue: string | null = null;
  try {
    legacyValue = window.localStorage.getItem(LEGACY_CONTEXT_STATUS_OPEN_STORAGE_KEY);
  } catch {
    // 存储不可用时维持默认关闭。
  }
  if (legacyValue !== null) {
    const open = legacyValue === 'true';
    try {
      window.localStorage.setItem(CONTEXT_STATUS_OPEN_STORAGE_KEY, String(open));
    } catch {
      // 迁移失败时仍使用已读出的旧版状态。
    }
    return open;
  }

  return null;
}

function persistOpenState(open: boolean): void {
  try {
    // 展开/关闭是全局用户状态：刷新、切换对话和后续浏览器会话都保持最后一次选择。
    window.localStorage.setItem(CONTEXT_STATUS_OPEN_STORAGE_KEY, String(open));
    window.sessionStorage.removeItem(CONTEXT_STATUS_OPEN_STORAGE_KEY);
  } catch {
    try {
      // localStorage 不可用时至少在当前标签页内保持。
      window.sessionStorage.setItem(CONTEXT_STATUS_OPEN_STORAGE_KEY, String(open));
    } catch {
      // 两种存储均不可用时仍保留当前页面内的 React 状态。
    }
  }
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat().format(value);
}

const EMPTY_VIEW = {
  phase: 'unavailable' as const,
  usedTokens: null,
  windowTokens: null,
  remainingPercent: null,
  optimized: false,
  removedTurns: 0,
  removedMessages: 0,
  removedToolTransactions: 0,
};

export default function ContextStatus({
  conversationId,
  usage,
  phase = null,
  pending = false,
  updating = false,
  latestActualUnavailable = false,
  errorKind = null,
  isStreaming = false,
  isFirstConversationTurn = false,
}: ContextStatusProps) {
  // Fusion 聊天界面当前固定使用中文，避免浏览器语言探测让单个组件混入英文。
  const t = i18n.getFixedT('zh-CN');
  const statusErrorKind = usage?.status === 'required_context_over_budget'
    ? 'not_sent'
    : usage?.status === 'estimator_unavailable'
      ? 'check_failed'
      : null;
  const effectiveErrorKind = errorKind
    ?? statusErrorKind
    ?? (phase === 'error' ? 'check_failed' : null);
  const isError = effectiveErrorKind !== null;
  const [open, setOpen] = useState(false);
  const hasOpenDetailOverlay = useHasOpenChatDetailOverlay();
  const visibleOpen = open && !hasOpenDetailOverlay;
  const trackedConversationIdRef = useRef(conversationId);
  const preferredOpenRef = useRef<boolean | null>(null);
  const autoOpenHandledRef = useRef(false);
  const userInteractedRef = useRef(false);
  const firstTurnStreamingRef = useRef(isStreaming && isFirstConversationTurn);
  firstTurnStreamingRef.current = isStreaming && isFirstConversationTurn;

  useLayoutEffect(() => {
    const conversationChanged = trackedConversationIdRef.current !== conversationId;
    trackedConversationIdRef.current = conversationId;
    if (conversationChanged) {
      autoOpenHandledRef.current = false;
      // 首轮流中的临时 ID 物化仍属于同一次对话，保留用户刚刚执行的开关操作。
      if (!firstTurnStreamingRef.current) userInteractedRef.current = false;
    }
    const storedOpen = readOpenState();
    preferredOpenRef.current = storedOpen;
    // 显式开启属于全局状态，切换到任何对话都要在浏览器绘制前恢复。
    setOpen(storedOpen === true);
  }, [conversationId]);

  useLayoutEffect(() => {
    if (
      isStreaming
      && isFirstConversationTurn
      && preferredOpenRef.current !== false
      && !userInteractedRef.current
    ) {
      markPendingFirstTurn(conversationId);
      // 全局开启只决定首轮结束后的目标状态；首轮生成期间先收起，避免发送消息时提前展开。
      setOpen(false);
    }
  }, [conversationId, isFirstConversationTurn, isStreaming]);

  useEffect(() => {
    if (isStreaming || autoOpenHandledRef.current || !hasPendingFirstTurn(conversationId)) return;

    if (!isFirstConversationTurn) {
      clearPendingFirstTurn(conversationId);
      return;
    }

    if (isError || latestActualUnavailable || usage?.actual_prompt_tokens == null) {
      if (isError || latestActualUnavailable || phase === 'final' || phase === 'error') {
        clearPendingFirstTurn(conversationId);
      }
      return;
    }

    autoOpenHandledRef.current = true;
    clearPendingFirstTurn(conversationId);
    // 未明确关闭时，首轮回答完成才恢复或执行自动展开。
    if (preferredOpenRef.current !== false && !userInteractedRef.current) {
      preferredOpenRef.current = true;
      setOpen(true);
      persistOpenState(true);
    }
  }, [conversationId, isError, isFirstConversationTurn, isStreaming, latestActualUnavailable, phase, usage]);

  const handleOpenChange = (value: boolean) => {
    userInteractedRef.current = true;
    preferredOpenRef.current = value;
    clearPendingFirstTurn(conversationId);
    setOpen(value);
    persistOpenState(value);
  };

  const rawView = usage ? buildContextUsageView(usage) : EMPTY_VIEW;
  const view = isError
    ? { ...rawView, remainingPercent: null, optimized: false }
    : rawView;
  const errorLabel = effectiveErrorKind === 'not_sent'
    ? t('contextStatus.notSent')
    : t('contextStatus.checkFailed');
  const triggerLabel = isError
    ? t('contextStatus.openWithError', { status: errorLabel })
    : pending
      ? t('contextStatus.openCalculating')
      : updating
        ? view.remainingPercent === null
          ? t('contextStatus.openUpdatingWithoutPercent')
          : t('contextStatus.openUpdating', { percent: view.remainingPercent })
        : view.usedTokens !== null && view.windowTokens === null
          ? t('contextStatus.openWindowUnknown')
          : view.remainingPercent === null
            ? t('contextStatus.open')
            : t('contextStatus.openWithRemaining', { percent: view.remainingPercent });
  const tokenSummary = view.usedTokens === null
    ? null
    : view.windowTokens === null
      ? `${formatTokens(view.usedTokens)} Token`
      : `${formatTokens(view.usedTokens)} / ${formatTokens(view.windowTokens)} Token`;
  const removedSummary = view.optimized && !isError
    ? t('contextStatus.removedSummary', {
        turns: view.removedTurns,
        messages: view.removedMessages,
        tools: view.removedToolTransactions,
        toolSuffix: view.removedToolTransactions > 0
          ? t('contextStatus.removedTools', { count: view.removedToolTransactions })
          : '',
      })
    : null;
  const usedPercent = view.remainingPercent === null ? null : 100 - view.remainingPercent;
  const mainValue = isError
    ? errorLabel
    : pending
      ? t('contextStatus.calculating')
      : view.usedTokens !== null && view.windowTokens === null
        ? t('contextStatus.windowUnknown')
        : view.remainingPercent === null
          ? t('contextStatus.unavailable')
          : `${view.remainingPercent}%`;
  const tokenValue = tokenSummary
    ?? (isError
      ? t('contextStatus.notAvailable')
      : pending
        ? t('contextStatus.calculating')
        : t('contextStatus.unavailable'));

  return (
    <Popover open={visibleOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="context-status-trigger"
          aria-label={triggerLabel}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border/60',
            'bg-background/90 px-2.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm transition-colors',
            'hover:border-border hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('contextStatus.shortLabel')}</span>
          {view.remainingPercent !== null ? (
            <span className="tabular-nums text-foreground">{view.remainingPercent}%</span>
          ) : null}
          {updating && !isError ? (
            <span
              data-testid="context-updating-indicator"
              aria-live="polite"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/70 motion-reduce:animate-none" aria-hidden="true" />
              {t('contextStatus.updating')}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      {visibleOpen ? (
        <PopoverContent
          role="dialog"
          aria-label={t('contextStatus.title')}
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="max-h-[min(70vh,30rem)] w-[calc(100vw-1.5rem)] max-w-[24rem] overflow-y-auto p-0"
        >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <h3 className="text-sm font-semibold">{t('contextStatus.title')}</h3>
          <div className="flex items-center gap-2">
            {isError ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
                <CircleAlert className="h-3 w-3" aria-hidden="true" />
                {errorLabel}
              </span>
            ) : updating ? (
              <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                {t('contextStatus.updating')}
              </span>
            ) : view.optimized ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {t('contextStatus.optimized')}
              </span>
            ) : null}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">
                {t('contextStatus.windowOpen')}
              </span>
              <Switch
                aria-label={t('contextStatus.windowOpen')}
                checked={open}
                onCheckedChange={handleOpenChange}
                className="h-5 w-9 [&_[data-slot=switch-thumb]]:h-4 [&_[data-slot=switch-thumb]]:w-4 [&_[data-slot=switch-thumb]][data-state=checked]:translate-x-4"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <section className="rounded-lg border border-border/60 bg-muted/35 p-3">
            <div className="flex items-end justify-between gap-4">
              <span className="text-xs text-muted-foreground">{t('contextStatus.remaining')}</span>
              <strong className={cn(
                'text-right font-semibold tabular-nums text-foreground',
                view.remainingPercent === null || isError ? 'text-sm' : 'text-2xl leading-none',
              )}>
                {mainValue}
              </strong>
            </div>

            {!isError && view.remainingPercent !== null && usedPercent !== null ? (
              <Progress
                value={usedPercent}
                aria-label={t('contextStatus.usedProgress')}
                aria-valuenow={usedPercent}
                aria-valuetext={t('contextStatus.usedWithRemaining', {
                  used: usedPercent,
                  remaining: view.remainingPercent,
                })}
                className="mt-3 h-1.5"
              />
            ) : null}
          </section>

          <dl className="rounded-lg border border-border/60 px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">
                {latestActualUnavailable || isError
                  ? t('contextStatus.latestActualTokens')
                  : t('contextStatus.actualTokens')}
              </dt>
              <dd className="text-right font-medium tabular-nums text-foreground">
                {tokenValue}
              </dd>
            </div>
          </dl>

          <section
            data-testid="context-conversation-section"
            className="min-w-0 space-y-1.5 rounded-lg border border-border/60 px-3 py-2.5"
          >
            <p className="text-xs text-muted-foreground">{t('contextStatus.conversation')}</p>
            <code
              data-testid="context-conversation-id"
              aria-label={`${t('contextStatus.conversation')}：${conversationId}`}
              title={conversationId}
              className="block w-full truncate whitespace-nowrap font-mono text-[11px] text-foreground"
            >
              {conversationId}
            </code>
          </section>

          {isError ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
              {effectiveErrorKind === 'not_sent'
                ? t('contextStatus.requiredOverBudget')
                : t('contextStatus.estimatorUnavailable')}
            </p>
          ) : pending || view.remainingPercent === null ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {pending
                ? t('contextStatus.awaitingEstimate')
                : view.usedTokens !== null && view.windowTokens === null
                  ? t('contextStatus.unknownWindow')
                  : t('contextStatus.finalUnavailable')}
            </p>
          ) : null}

          {!isError && latestActualUnavailable && view.usedTokens !== null ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {t('contextStatus.latestActualUnavailable')}
            </p>
          ) : null}

          {removedSummary ? (
            <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs leading-relaxed text-foreground">
              {removedSummary}
            </p>
          ) : null}
        </div>

        {!isError ? (
          <p className="border-t border-border/60 bg-muted/20 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
            {t('contextStatus.historyIntact')}
          </p>
        ) : null}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
