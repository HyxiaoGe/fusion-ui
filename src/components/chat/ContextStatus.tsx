"use client";

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
  const usedPercent = view.remainingPercent === null ? null : 100 - view.remainingPercent;

  return (
    <Popover>
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
        </button>
      </PopoverTrigger>
      <PopoverContent
        role="dialog"
        aria-label={t('contextStatus.title')}
        side="top"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="max-h-[min(70vh,30rem)] w-[calc(100vw-1.5rem)] max-w-[24rem] overflow-y-auto p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
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

        <div className="space-y-3 p-4">
          <section className="rounded-lg border border-border/60 bg-muted/35 p-3">
            <div className="flex items-end justify-between gap-4">
              <span className="text-xs text-muted-foreground">{t('contextStatus.remaining')}</span>
              <strong className={cn(
                'text-right font-semibold tabular-nums text-foreground',
                view.remainingPercent === null || isError ? 'text-sm' : 'text-2xl leading-none',
              )}>
                {isError
                  ? errorLabel
                  : view.remainingPercent === null
                    ? (pending ? t('contextStatus.calculating') : t('contextStatus.unavailable'))
                    : `${view.remainingPercent}%`}
              </strong>
            </div>

            {!isError && view.remainingPercent !== null && usedPercent !== null ? (
              <Progress
                value={usedPercent}
                aria-label={t('contextStatus.usedProgress')}
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
                {view.phase === 'actual'
                  ? t('contextStatus.actualTokens')
                  : t('contextStatus.estimatedTokens')}
              </dt>
              <dd className="text-right font-medium tabular-nums text-foreground">
                {isError
                  ? t('contextStatus.notAvailable')
                  : tokenSummary ?? t('contextStatus.calculating')}
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
          ) : view.remainingPercent === null ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {pending
                ? t('contextStatus.awaitingEstimate')
                : view.windowTokens === null
                  ? t('contextStatus.unknownWindow')
                  : t('contextStatus.awaitingEstimate')}
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
