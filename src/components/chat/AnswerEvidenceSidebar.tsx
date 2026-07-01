'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle, ExternalLink, Globe2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  AnswerEvidenceSidebarIssueItem,
  AnswerEvidenceSidebarModel,
  AnswerEvidenceSidebarUsedItem,
} from './answerEvidenceSidebarModel';

interface AnswerEvidenceSidebarProps {
  model: AnswerEvidenceSidebarModel | null;
  isOpen: boolean;
  onClose: () => void;
  highlightIndex?: number;
  highlightTick?: number;
}

export default function AnswerEvidenceSidebar({
  model,
  isOpen,
  onClose,
  highlightIndex,
  highlightTick,
}: AnswerEvidenceSidebarProps) {
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const usedItems = model?.usedItems ?? [];
  const candidateItems = model?.candidateItems ?? [];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();

    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (typeof highlightIndex !== 'number' || highlightIndex < 0) return;
    const itemIndex = usedItems.findIndex(
      item => item.kind === 'search' && item.sourceIndex === highlightIndex,
    );
    if (itemIndex < 0) return;
    const element = itemRefs.current[itemIndex];
    if (!element) return;
    const timer = setTimeout(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightIndex, highlightTick, isOpen, usedItems]);

  if (!isOpen || !model?.isRenderable) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="关闭回答依据背景"
        className="fixed inset-0 z-40 cursor-default bg-black/20 p-0 transition-opacity"
        onClick={onClose}
      />
      <aside
        data-testid="answer-evidence-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="回答依据"
        className="fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-[100vw] transform flex-col border-l border-border bg-background shadow-lg transition-transform duration-300 ease-in-out"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">回答依据</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {model.summary.usedCount > 0
                ? `已使用 ${model.summary.usedCount} 条`
                : model.summary.candidateCount > 0
                  ? `候选来源 ${model.summary.candidateCount} 条`
                  : `深读 ${model.summary.urlCount} 个网页`}
              {model.summary.usedCount > 0 && model.summary.candidateCount > 0
                ? ` · 候选 ${model.summary.candidateCount} 条`
                : ''}
              {(model.summary.usedCount > 0 || model.summary.candidateCount > 0) && model.summary.urlCount > 0
                ? ` · 深读 ${model.summary.urlCount} 个网页`
                : ''}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {model.summary.issueCount > 0 ? (
              <span className="rounded-full border border-warn/30 bg-warn/5 px-2 py-0.5 text-[11px] text-warn">
                {model.summary.issueCount} 个未使用
              </span>
            ) : null}
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="关闭回答依据"
              onClick={onClose}
              className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <SearchQuerySection queries={model.searchQueries} />

          {usedItems.length > 0 ? (
            <section>
              <h4 className="mb-2 text-xs font-medium text-foreground">
                已使用来源
              </h4>
              <div className="space-y-2">
                {usedItems.map((item, index) => (
                  <UsedSourceItem
                    key={item.id}
                    ref={(element) => { itemRefs.current[index] = element; }}
                    item={item}
                    highlighted={item.kind === 'search' && item.sourceIndex === highlightIndex}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {candidateItems.length > 0 ? (
            <section className={usedItems.length > 0 ? 'mt-5' : undefined}>
              <h4 className="mb-2 text-xs font-medium text-foreground">候选来源</h4>
              <div className="space-y-2">
                {candidateItems.map(item => (
                  <UsedSourceItem
                    key={item.id}
                    item={item}
                    highlighted={false}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {usedItems.length === 0 && candidateItems.length === 0 ? (
            <section className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
              没有可用回答依据
            </section>
          ) : null}

          {model.issueItems.length > 0 ? (
            <section className="mt-5">
              <h4 className="mb-2 text-xs font-medium text-foreground">未使用来源</h4>
              <div className="space-y-2">
                {model.issueItems.map(item => (
                  <IssueSourceItem key={item.id} item={item} />
                ))}
              </div>
            </section>
          ) : null}

        </div>
      </aside>
    </>
  );
}

function SearchQuerySection({ queries }: { queries: string[] }) {
  if (queries.length === 0) return null;

  return (
    <section className="mb-5">
      <h4 className="mb-2 text-xs font-medium text-foreground">搜索关键词</h4>
      <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2">
        <div className="space-y-1.5">
          {queries.map((query, index) => (
            <div key={query} className="flex min-w-0 items-start gap-2 text-xs">
              <span className="mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full border border-border/40 text-[10px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 break-words text-foreground" title={query}>
                {query}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const UsedSourceItem = React.forwardRef<HTMLDivElement, {
  item: AnswerEvidenceSidebarUsedItem;
  highlighted: boolean;
}>(({ item, highlighted }, ref) => {
  return (
    <div
      ref={ref}
      data-testid={item.kind === 'search' ? `answer-evidence-used-search-${item.sourceIndex}` : undefined}
      className={cn(
        'flex min-w-0 gap-3 rounded-md border border-border/40 border-l-2 bg-background/70 px-3 py-2 transition-colors',
        highlighted ? 'border-l-info bg-info-bg/60' : 'border-l-transparent hover:bg-muted/20',
      )}
    >
      <span className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
        item.kind === 'search' ? 'text-info' : 'text-teal',
      )}>
        <UsedSourceIcon item={item} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-full border border-border/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {item.kind === 'search' ? '搜索' : '读取'}
          </span>
          {item.deepRead ? (
            <span className="shrink-0 rounded-full border border-success/30 bg-success/5 px-1.5 py-0.5 text-[10px] text-success">
              已深读
            </span>
          ) : null}
          <span className="min-w-0 truncate text-[10px] text-muted-foreground">{item.domain}</span>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-foreground" title={item.title}>
          {item.title}
        </p>
      </div>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`打开来源：${item.title}`}
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
    </div>
  );
});
UsedSourceItem.displayName = 'UsedSourceItem';

function UsedSourceIcon({ item }: { item: AnswerEvidenceSidebarUsedItem }) {
  if (item.favicon) {
    return (
      <img
        src={item.favicon}
        alt=""
        className="h-4 w-4 rounded-sm object-contain"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  const Icon = item.kind === 'search' ? Search : Globe2;
  return <Icon className="h-4 w-4" aria-hidden="true" />;
}

function IssueSourceItem({ item }: { item: AnswerEvidenceSidebarIssueItem }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-md border border-border/40 bg-muted/10 px-3 py-2">
      <span className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
        item.status === 'failed' ? 'text-danger' : item.status === 'degraded' ? 'text-warn' : 'text-muted-foreground',
      )}>
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0 rounded-full border border-border/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {item.kind === 'search' ? '搜索' : '读取'}
          </span>
          <StatusBadge status={item.status} />
          {item.domain ? (
            <span className="min-w-0 truncate text-[10px] text-muted-foreground">{item.domain}</span>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm font-medium text-foreground" title={item.title}>
          {item.title}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
      </div>
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`打开来源：${item.title}`}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: AnswerEvidenceSidebarIssueItem['status'] }) {
  const text = status === 'failed' ? '未使用' : status === 'degraded' ? '部分可用' : '中断';
  return (
    <span className={cn(
      'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]',
      status === 'failed' ? 'border-danger/30 text-danger'
        : status === 'degraded' ? 'border-warn/30 text-warn'
          : 'border-border/40 text-muted-foreground',
    )}>
      {text}
    </span>
  );
}
