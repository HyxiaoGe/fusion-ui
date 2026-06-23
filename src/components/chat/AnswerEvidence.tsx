'use client';

import { ExternalLink, FileSearch, Globe2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnswerEvidenceItem, AnswerEvidenceModel } from './answerEvidenceModel';

interface AnswerEvidenceProps {
  evidence: AnswerEvidenceModel | null;
  onSourceClick: (index: number) => void;
  onOpenSources: () => void;
}

export default function AnswerEvidence({
  evidence,
  onSourceClick,
  onOpenSources,
}: AnswerEvidenceProps) {
  if (!evidence || evidence.totalCount === 0) {
    return null;
  }

  const showHiddenSearch = evidence.hiddenSearchCount > 0;
  const showOpenAll = evidence.hasSearchSources && showHiddenSearch;
  const showHiddenUrls = evidence.hiddenUrlCount > 0;

  return (
    <section className="mb-2 rounded-md border border-border/30 bg-transparent px-2.5 py-2 text-xs text-muted-foreground">
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
        <FileSearch className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
          {evidence.summary}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {showHiddenSearch ? (
            <EvidenceMetaChip>未预览 {evidence.hiddenSearchCount} 条搜索</EvidenceMetaChip>
          ) : null}
          {showHiddenUrls ? (
            <EvidenceMetaChip>未预览 {evidence.hiddenUrlCount} 个网页</EvidenceMetaChip>
          ) : null}
          {showOpenAll ? (
            <button
              type="button"
              aria-label="查看全部搜索来源"
              onClick={onOpenSources}
              className="shrink-0 rounded-full border border-border/40 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:border-border/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              查看全部
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {evidence.previewItems.map(item => (
          <EvidenceItem
            key={item.id}
            item={item}
            onSourceClick={onSourceClick}
          />
        ))}
      </div>
    </section>
  );
}

function EvidenceMetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-border/30 bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  );
}

function EvidenceItem({
  item,
  onSourceClick,
}: {
  item: AnswerEvidenceItem;
  onSourceClick: (index: number) => void;
}) {
  const content = <EvidenceItemContent item={item} />;

  if (item.kind === 'search_source') {
    return (
      <button
        type="button"
        aria-label={`查看来源：${item.title}`}
        onClick={() => {
          onSourceClick(item.sourceIndex);
        }}
        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border/40 bg-background/70 px-2 py-1 text-left transition-colors hover:border-border/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {content}
      </button>
    );
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`打开网页：${item.title}`}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border/40 bg-background/70 px-2 py-1 text-left no-underline transition-colors hover:border-border/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {content}
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </a>
  );
}

function EvidenceItemContent({ item }: { item: AnswerEvidenceItem }) {
  return (
    <>
      <EvidenceItemIcon item={item} />
      <span className="flex min-w-0 flex-col">
        <span className="min-w-0 truncate text-[10px] leading-3 text-muted-foreground">
          {item.domain}
        </span>
        <span
          title={item.title}
          className="min-w-0 max-w-[14rem] truncate text-xs font-medium text-foreground"
        >
          {item.title}
        </span>
      </span>
    </>
  );
}

function EvidenceItemIcon({ item }: { item: AnswerEvidenceItem }) {
  if (item.favicon) {
    return (
      <img
        src={item.favicon}
        alt=""
        className="h-4 w-4 shrink-0 rounded-sm object-contain"
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  const Icon = item.kind === 'search_source' ? Search : Globe2;

  return (
    <span className={cn(
      'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm',
      item.kind === 'search_source' ? 'text-info' : 'text-teal',
    )}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  );
}
