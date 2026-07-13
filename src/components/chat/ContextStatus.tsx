"use client";

import { useEffect, useState } from 'react';
import { CircleAlert, Gauge, Sparkles } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  buildContextUsageView,
  type ContextUsageErrorKind,
  type ContextUsagePhase,
} from '@/lib/chat/contextUsage';
import { cn } from '@/lib/utils';
import type { ContextUsage } from '@/types/conversation';
import i18n from '@/lib/i18n';

interface ContextStatusProps {
  conversationId: string;
  usage: ContextUsage | null;
  phase?: ContextUsagePhase | null;
  pending?: boolean;
  updating?: boolean;
  latestActualUnavailable?: boolean;
  errorKind?: ContextUsageErrorKind | null;
}

export const CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY = 'fusion.context-status.default-open.v1';

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
  const [defaultOpen, setDefaultOpen] = useState(false);

  useEffect(() => {
    try {
      const preferred = window.localStorage.getItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY) === 'true';
      setDefaultOpen(preferred);
      if (preferred) setOpen(true);
    } catch {
      // localStorage 不可用时维持默认关闭，不影响上下文状态本身。
    }
  }, []);

  const persistDefaultOpen = (value: boolean) => {
    setDefaultOpen(value);
    try {
      window.localStorage.setItem(CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY, String(value));
    } catch {
      // 隐私模式或存储被禁用时只保留本次页面状态。
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) persistDefaultOpen(false);
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
    <Popover open={open} onOpenChange={handleOpenChange}>
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
      <PopoverContent
        role="dialog"
        aria-label={t('contextStatus.title')}
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
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
            <button
              type="button"
              aria-label={t('contextStatus.defaultOpen')}
              aria-pressed={defaultOpen}
              onClick={() => persistDefaultOpen(!defaultOpen)}
              className={cn(
                'rounded-md border px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                defaultOpen
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t('contextStatus.defaultOpen')}
            </button>
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
    </Popover>
  );
}
