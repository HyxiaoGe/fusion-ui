'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Search, Globe2, X } from 'lucide-react';
import type { AgentRunState } from '@/types/agentRun';
import { cn } from '@/lib/utils';
import type { ToolCallGroupDetail } from '@/lib/agent/toolCallGroups';
import {
  buildExecutionProcessModel,
  type ExecutionProcessModel,
  type ExecutionProcessSource,
  groupDetailStatusText,
  groupSectionTitle,
  statusText,
} from './executionProcessModel';

interface ExecutionProcessProps {
  run: AgentRunState;
  searchSources?: ExecutionProcessSource[];
  searchQueries?: string[];
  onOpenSources?: () => void;
}

export function ExecutionProcess({ run, searchSources, searchQueries, onOpenSources }: ExecutionProcessProps) {
  const [open, setOpen] = useState(false);
  const model = useMemo(
    () => buildExecutionProcessModel(run, { searchSources, searchQueries }),
    [run, searchSources, searchQueries],
  );
  if (!model.isRenderable) return null;

  return (
    <>
      <section className="mb-2 rounded-md border border-border/30 bg-transparent px-2.5 py-2 text-xs text-muted-foreground">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <FileSearch className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
            {model.summary}
          </span>
          <button
            type="button"
            aria-label="查看执行过程"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-full border border-border/40 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-border/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            查看过程
          </button>
        </div>
      </section>
      <ExecutionProcessSidebar
        run={run}
        searchSources={searchSources}
        searchQueries={searchQueries}
        onOpenSources={onOpenSources}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function ExecutionProcessSidebar({
  run,
  searchSources,
  searchQueries,
  onOpenSources,
  isOpen,
  onClose,
}: {
  run: AgentRunState;
  searchSources?: ExecutionProcessSource[];
  searchQueries?: string[];
  onOpenSources?: () => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const model = useMemo(
    () => buildExecutionProcessModel(run, { searchSources, searchQueries }),
    [run, searchSources, searchQueries],
  );
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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

  if (!isOpen || !model.isRenderable) return null;

  const handleOpenSources = () => {
    onClose();
    onOpenSources?.();
  };

  return (
    <>
      <button
        type="button"
        aria-label="关闭执行过程背景"
        className="fixed inset-0 z-40 cursor-default bg-black/20 p-0 transition-opacity"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="执行过程"
        className="fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-[100vw] transform flex-col border-l border-border bg-background shadow-lg transition-transform duration-300 ease-in-out"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">执行过程</h3>
            <p className="mt-1 text-xs text-muted-foreground">{model.summary}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="关闭执行过程"
              onClick={onClose}
              className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {model.groups.length > 0 ? (
            <div className="space-y-5">
              {model.groups.map(group => (
                <section key={group.id}>
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                    {group.kind === 'url_read'
                      ? <Globe2 className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
                      : <Search className="h-3.5 w-3.5 text-info" aria-hidden="true" />}
                    {groupSectionTitle(group)}
                  </h4>
                  <div className="space-y-2">
                    {group.kind === 'web_search' ? (
                      <SearchSourceProcessSummary
                        model={model}
                        onOpenSources={onOpenSources ? handleOpenSources : undefined}
                      />
                    ) : (
                      group.details.map(detail => (
                        <ProcessDetailItem key={detail.id} detail={detail} />
                      ))
                    )}
                  </div>
                </section>
              ))}
              <SkippedReadNotice count={model.skippedReadCount} />
            </div>
          ) : (
            <DigestOnlyList
              model={model}
              onOpenSources={onOpenSources ? handleOpenSources : undefined}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function ProcessDetailItem({ detail }: { detail: ToolCallGroupDetail }) {
  const isIssue = detail.status !== 'success' && detail.status !== 'running';
  return (
    <div className="flex min-w-0 gap-3 rounded-md border border-border/40 bg-background/70 px-3 py-2">
      <span className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
        isIssue ? 'text-warn' : 'text-success',
      )}>
        {isIssue ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground" title={detail.fullValue}>
            {detail.primary}
          </span>
          <span className="shrink-0 rounded-full border border-border/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {statusText(detail.status)}
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground" title={groupDetailStatusText(detail)}>
          {groupDetailStatusText(detail)}
        </p>
      </div>
    </div>
  );
}

function DigestOnlyList({
  model,
  onOpenSources,
}: {
  model: ExecutionProcessModel;
  onOpenSources?: () => void;
}) {
  if (model.searchCount === 0 && model.readCount === 0 && model.skippedReadCount === 0) {
    return (
      <section className="rounded-md border border-border/40 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
        没有可展示的执行过程
      </section>
    );
  }

  return (
    <div className="space-y-5">
      {model.searchCount > 0 ? (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Search className="h-3.5 w-3.5 text-info" aria-hidden="true" />
            搜索资料
          </h4>
          <AggregateProcessItem
            title={buildSearchAggregateTitle(model)}
            detail={buildSearchAggregateDetail(model)}
          />
          <SearchQueryList queries={model.searchQueries} />
          {model.searchSources.length > 0 ? (
            <EvidenceShortcutButton onOpenSources={onOpenSources} />
          ) : null}
        </section>
      ) : null}
      {model.readCount > 0 ? (
        <section>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Globe2 className="h-3.5 w-3.5 text-teal" aria-hidden="true" />
            网页读取
          </h4>
          <AggregateProcessItem
            title={`成功读取 ${model.readCount} 个网页`}
            detail="已读取网页内容，供后续回答核验。"
          />
        </section>
      ) : null}
      <SkippedReadNotice count={model.skippedReadCount} />
    </div>
  );
}

function SearchSourceProcessSummary({
  model,
  onOpenSources,
}: {
  model: ExecutionProcessModel;
  onOpenSources?: () => void;
}) {
  return (
    <>
      <AggregateProcessItem
        title={buildSearchAggregateTitle(model)}
        detail={buildSearchAggregateDetail(model)}
      />
      <SearchQueryList queries={model.searchQueries} />
      {model.searchSources.length > 0 ? (
        <EvidenceShortcutButton onOpenSources={onOpenSources} />
      ) : null}
    </>
  );
}

function SearchQueryList({ queries }: { queries: string[] }) {
  if (queries.length === 0) return null;

  return (
    <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2">
      <p className="mb-1.5 text-xs font-medium text-foreground">搜索关键词</p>
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
  );
}

function EvidenceShortcutButton({ onOpenSources }: { onOpenSources?: () => void }) {
  if (!onOpenSources) return null;
  return (
    <button
      type="button"
      onClick={onOpenSources}
      className="inline-flex items-center rounded-full border border-border/40 bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-border/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      查看依据
    </button>
  );
}

function AggregateProcessItem({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-w-0 gap-3 rounded-md border border-border/40 bg-background/70 px-3 py-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-success">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {title}
          </span>
          <span className="shrink-0 rounded-full border border-border/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            完成
          </span>
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground" title={detail}>
          {detail}
        </p>
      </div>
    </div>
  );
}

function SkippedReadNotice({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="px-1 text-xs text-muted-foreground">
      已自动跳过 {count} 个不可读网页
    </p>
  );
}

function buildSearchAggregateTitle(model: ExecutionProcessModel): string {
  if (model.searchCandidateCount > 0) {
    return `搜索 ${model.searchCount} 次，共保留 ${model.searchCandidateCount} 条候选结果`;
  }
  return `搜索 ${model.searchCount} 次`;
}

function buildSearchAggregateDetail(model: ExecutionProcessModel): string {
  if (model.searchCandidateCount > 0) {
    return '候选结果已进入回答依据筛选。';
  }
  return '已完成资料搜索。';
}
