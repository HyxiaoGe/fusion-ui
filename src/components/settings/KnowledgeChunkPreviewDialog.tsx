'use client';

import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useKnowledgeDocumentChunks } from '@/hooks/useKnowledgeDocumentChunks';
import { ApiError } from '@/types/api';
import type { KnowledgeDocument } from '@/types/knowledge';

interface KnowledgeChunkPreviewDialogProps {
  open: boolean;
  knowledgeBaseId: string | null;
  document: KnowledgeDocument | null;
  onOpenChange: (open: boolean) => void;
}

const chunkAccentStyles = [
  {
    border: 'border-blue-200/80 dark:border-blue-900/70',
    header: 'bg-blue-50/80 dark:bg-blue-950/25',
    badge: 'bg-blue-600 text-white shadow-blue-600/20',
    rail: 'bg-blue-500',
  },
  {
    border: 'border-emerald-200/80 dark:border-emerald-900/70',
    header: 'bg-emerald-50/80 dark:bg-emerald-950/25',
    badge: 'bg-emerald-600 text-white shadow-emerald-600/20',
    rail: 'bg-emerald-500',
  },
  {
    border: 'border-amber-200/80 dark:border-amber-900/70',
    header: 'bg-amber-50/80 dark:bg-amber-950/25',
    badge: 'bg-amber-500 text-amber-950 shadow-amber-500/20',
    rail: 'bg-amber-500',
  },
  {
    border: 'border-violet-200/80 dark:border-violet-900/70',
    header: 'bg-violet-50/80 dark:bg-violet-950/25',
    badge: 'bg-violet-600 text-white shadow-violet-600/20',
    rail: 'bg-violet-500',
  },
] as const;

function previewErrorMessage(error: unknown, translate: (key: string) => string): string {
  if (!(error instanceof ApiError)) {
    return translate('knowledgeBase.chunkPreview.errors.unavailable');
  }
  const mappedErrors: Record<string, string> = {
    NOT_FOUND: 'knowledgeBase.chunkPreview.errors.notFound',
    KNOWLEDGE_DOCUMENT_NOT_FOUND: 'knowledgeBase.chunkPreview.errors.notFound',
    CONFLICT: 'knowledgeBase.chunkPreview.errors.notReady',
    KNOWLEDGE_DOCUMENT_NOT_READY: 'knowledgeBase.chunkPreview.errors.notReady',
    FORBIDDEN: 'knowledgeBase.chunkPreview.errors.forbidden',
    UNAUTHORIZED: 'knowledgeBase.chunkPreview.errors.unauthorized',
  };
  return translate(
    mappedErrors[error.code] ?? 'knowledgeBase.chunkPreview.errors.unavailable',
  );
}

export default function KnowledgeChunkPreviewDialog({
  open,
  knowledgeBaseId,
  document,
  onOpenChange,
}: KnowledgeChunkPreviewDialogProps) {
  const { t } = useTranslation();
  const state = useKnowledgeDocumentChunks({
    open,
    knowledgeBaseId,
    documentId: document?.id ?? null,
  });
  const data = state.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[84vh] flex-col overflow-hidden sm:max-w-4xl"
        closeLabel={t('knowledgeBase.chunkPreview.close')}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>
            {t('knowledgeBase.chunkPreview.title', { name: document?.filename ?? '' })}
          </DialogTitle>
          <DialogDescription>
            {t('knowledgeBase.chunkPreview.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {state.loading && !data ? (
            <div
              role="status"
              aria-label={t('knowledgeBase.chunkPreview.loading')}
              className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"
            >
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              {t('knowledgeBase.chunkPreview.loading')}
            </div>
          ) : (
            <div className="space-y-5">
              {data && (
                <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-muted/30 px-4 py-3 shadow-sm">
                  <p className="text-sm font-medium">
                    {t('knowledgeBase.chunkPreview.total', { count: data.total })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('knowledgeBase.chunkPreview.config', {
                      version: data.chunker_version,
                      size: data.chunk_size,
                      overlap: data.chunk_overlap,
                    })}
                  </p>
                </div>
              )}

              {Boolean(state.error) && (
                <div
                  role="alert"
                  className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
                >
                  <div className="flex min-w-0 items-start gap-2 text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{previewErrorMessage(state.error, t)}</span>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={state.retry}>
                    {t('knowledgeBase.chunkPreview.retry')}
                  </Button>
                </div>
              )}

              {state.loading && data && (
                <div
                  role="status"
                  aria-label={t('knowledgeBase.chunkPreview.loading')}
                  className="flex items-center text-xs text-muted-foreground"
                >
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  {t('knowledgeBase.chunkPreview.loading')}
                </div>
              )}

              {data && data.items.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {t('knowledgeBase.chunkPreview.empty')}
                </div>
              ) : (
                data?.items.map((chunk) => {
                  const accentIndex = Math.abs(chunk.ordinal) % chunkAccentStyles.length;
                  const accent = chunkAccentStyles[accentIndex];
                  const ordinalLabel = t('knowledgeBase.chunkPreview.ordinal', {
                    number: chunk.ordinal + 1,
                  });

                  return (
                    <article
                      key={chunk.chunk_id}
                      aria-label={ordinalLabel}
                      data-chunk-accent={accentIndex}
                      className={`relative overflow-hidden rounded-xl border bg-background shadow-sm transition-shadow hover:shadow-md ${accent.border}`}
                    >
                      <div
                        className={`absolute inset-y-0 left-0 w-1 ${accent.rail}`}
                        aria-hidden="true"
                      />
                      <header
                        className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 ${accent.header}`}
                      >
                        <span
                          className={`inline-flex min-w-16 items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm ${accent.badge}`}
                        >
                          {ordinalLabel}
                        </span>
                        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                          {chunk.section && (
                            <span className="rounded-full border bg-background/80 px-2.5 py-1">
                              {t('knowledgeBase.chunkPreview.section', {
                                section: chunk.section,
                              })}
                            </span>
                          )}
                          {chunk.page !== null && (
                            <span className="rounded-full border bg-background/80 px-2.5 py-1">
                              {t('knowledgeBase.chunkPreview.page', { page: chunk.page })}
                            </span>
                          )}
                          <span className="rounded-full border bg-background/80 px-2.5 py-1 tabular-nums">
                            {t('knowledgeBase.chunkPreview.range', {
                              start: chunk.char_start,
                              end: chunk.char_end,
                            })}
                          </span>
                        </div>
                      </header>
                      <p className="whitespace-pre-wrap break-words px-5 py-4 text-sm leading-7 text-foreground">
                        {chunk.text}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </div>

        {data && data.total_pages > 1 && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-4">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!data.has_prev || state.loading}
              onClick={() => state.setPage(data.page - 1)}
            >
              <ChevronLeft />
              {t('knowledgeBase.chunkPreview.previous')}
            </Button>
            <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground">
              {data.page} / {data.total_pages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!data.has_next || state.loading}
              onClick={() => state.setPage(data.page + 1)}
            >
              {t('knowledgeBase.chunkPreview.next')}
              <ChevronRight />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
