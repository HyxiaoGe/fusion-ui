"use client";

import { CircleAlert, Gauge, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  errorKind?: ContextUsageErrorKind | null;
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
  errorKind = null,
}: ContextStatusProps) {
  const { t } = useTranslation(undefined, { i18n });
  const statusErrorKind = usage?.status === 'required_context_over_budget'
    ? 'not_sent'
    : usage?.status === 'estimator_unavailable'
      ? 'check_failed'
      : null;
  const effectiveErrorKind = errorKind
    ?? statusErrorKind
    ?? (phase === 'error' ? 'check_failed' : null);
  const isError = effectiveErrorKind !== null;
  const rawView = usage ? buildContextUsageView(usage) : EMPTY_VIEW;
  const view = isError
    ? { ...rawView, remainingPercent: null, optimized: false, usedTokens: null }
    : rawView;
  const errorLabel = effectiveErrorKind === 'not_sent'
    ? t('contextStatus.notSent')
    : t('contextStatus.checkFailed');
  const triggerLabel = isError
    ? t('contextStatus.openWithError', { status: errorLabel })
    : pending
      ? t('contextStatus.openCalculating')
    : view.remainingPercent === null
      ? t('contextStatus.open')
      : t('contextStatus.openWithRemaining', { percent: view.remainingPercent });
  const tokenSummary = view.usedTokens !== null && view.windowTokens !== null
    ? `${formatTokens(view.usedTokens)} / ${formatTokens(view.windowTokens)} Token`
    : null;
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="context-status-trigger"
          aria-label={triggerLabel}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border/70',
            'bg-background px-2 text-xs text-muted-foreground transition-colors',
            'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t('contextStatus.shortLabel')}</span>
          {view.remainingPercent !== null ? (
            <span className="tabular-nums text-foreground">{view.remainingPercent}%</span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label={t('contextStatus.title')}
        side="top"
        align="end"
        className="w-[min(22rem,calc(100vw-2rem))] space-y-4 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{t('contextStatus.title')}</h3>
          {isError ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
              <CircleAlert className="h-3 w-3" aria-hidden="true" />
              {errorLabel}
            </span>
          ) : view.optimized ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {t('contextStatus.optimized')}
            </span>
          ) : null}
        </div>

        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          <dt className="text-muted-foreground">{t('contextStatus.conversation')}</dt>
          <dd className="break-all text-right font-mono text-[11px] text-foreground">{conversationId}</dd>

          <dt className="text-muted-foreground">{t('contextStatus.remaining')}</dt>
          <dd className="text-right font-medium tabular-nums text-foreground">
            {isError
              ? errorLabel
              : view.remainingPercent === null
                ? (pending ? t('contextStatus.calculating') : t('contextStatus.unavailable'))
              : `${view.remainingPercent}%`}
          </dd>

          <dt className="text-muted-foreground">
            {view.phase === 'actual'
              ? t('contextStatus.actualTokens')
              : t('contextStatus.estimatedTokens')}
          </dt>
          <dd className="text-right tabular-nums text-foreground">
            {isError
              ? t('contextStatus.notAvailable')
              : tokenSummary ?? t('contextStatus.calculating')}
          </dd>
        </dl>

        {isError ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {effectiveErrorKind === 'not_sent'
              ? t('contextStatus.requiredOverBudget')
              : t('contextStatus.estimatorUnavailable')}
          </p>
        ) : view.remainingPercent !== null ? (
          <Progress
            value={100 - view.remainingPercent}
            aria-label={t('contextStatus.usedProgress')}
            className="h-1.5"
          />
        ) : (
          <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            {pending
              ? t('contextStatus.awaitingEstimate')
              : view.windowTokens === null
              ? t('contextStatus.unknownWindow')
              : t('contextStatus.awaitingEstimate')}
          </p>
        )}

        {removedSummary ? (
          <p className="text-xs text-foreground">{removedSummary}</p>
        ) : null}
        {!isError ? (
          <p className="border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
            {t('contextStatus.historyIntact')}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
