'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Loader2, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { listKnowledgeDocumentChunks } from '@/lib/api/knowledgeBases';
import type { KnowledgeDocumentChunk } from '@/types/knowledge';
import type { KnowledgeAnswerEvidenceItem } from './answerEvidenceModel';

const SOURCE_CHUNK_PAGE_SIZE = 10;

type PreviewState =
  | { status: 'idle'; chunk: null }
  | { status: 'loading'; chunk: null }
  | { status: 'ready'; chunk: KnowledgeDocumentChunk }
  | { status: 'unavailable'; chunk: null };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export default function KnowledgeEvidenceSourcePreview({
  source,
  autoOpen = false,
  autoOpenTick = 0,
}: {
  source: KnowledgeAnswerEvidenceItem;
  autoOpen?: boolean;
  autoOpenTick?: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: 'idle', chunk: null });
  const controllerRef = useRef<AbortController | null>(null);
  const handledAutoOpenKeyRef = useRef<string | null>(null);
  const autoOpenKey = [
    source.knowledgeBaseId,
    source.documentId,
    source.indexVersion,
    source.chunkId,
    source.ordinal,
    autoOpenTick,
  ].join(':');

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading', chunk: null });
    try {
      const page = Math.floor(source.ordinal / SOURCE_CHUNK_PAGE_SIZE) + 1;
      const result = await listKnowledgeDocumentChunks(
        source.knowledgeBaseId,
        source.documentId,
        { page, pageSize: SOURCE_CHUNK_PAGE_SIZE },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const chunk = result.active_index_version === source.indexVersion
        ? result.items.find((item) => (
            item.chunk_id === source.chunkId && item.ordinal === source.ordinal
          ))
        : undefined;
      setState(chunk
        ? { status: 'ready', chunk }
        : { status: 'unavailable', chunk: null });
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return;
      setState({ status: 'unavailable', chunk: null });
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [source]);

  useEffect(() => () => {
    controllerRef.current?.abort();
    handledAutoOpenKeyRef.current = null;
  }, []);

  useEffect(() => {
    if (!autoOpen) {
      handledAutoOpenKeyRef.current = null;
      return;
    }
    if (handledAutoOpenKeyRef.current === autoOpenKey) return;
    handledAutoOpenKeyRef.current = autoOpenKey;
    setOpen(true);
    if (state.status !== 'ready') {
      void load();
    }
    // autoOpenTick 让用户重复点击同一引用时也能重新定位并按需加载。
  }, [autoOpen, autoOpenKey, load, state.status]);

  const toggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && (state.status === 'idle' || state.status === 'unavailable')) {
      void load();
    }
  };

  return (
    <div className="border-t border-border/30 px-3 py-2">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('knowledgeBase.answerEvidence.openSource', { name: source.filename })}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span>{t('knowledgeBase.answerEvidence.viewChunk')}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open ? (
        <div className="mt-2">
          {state.status === 'loading' ? (
            <div role="status" className="flex items-center text-xs text-muted-foreground">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t('knowledgeBase.answerEvidence.loadingSource')}
            </div>
          ) : state.status === 'ready' ? (
            <article
              data-testid={`knowledge-source-chunk-${source.chunkId}`}
              className="rounded-lg border border-primary/15 bg-primary/[0.03] px-3 py-2.5"
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="rounded-full border bg-background px-1.5 py-0.5">
                  {t('knowledgeBase.chunkPreview.ordinal', { number: state.chunk.ordinal + 1 })}
                </span>
                {state.chunk.section ? (
                  <span className="rounded-full border bg-background px-1.5 py-0.5">
                    {t('knowledgeBase.chunkPreview.section', { section: state.chunk.section })}
                  </span>
                ) : null}
                {state.chunk.page !== null ? (
                  <span className="rounded-full border bg-background px-1.5 py-0.5">
                    {t('knowledgeBase.chunkPreview.page', { page: state.chunk.page })}
                  </span>
                ) : null}
              </div>
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                {state.chunk.text}
              </p>
            </article>
          ) : state.status === 'unavailable' ? (
            <div role="alert" className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
              <span className="flex min-w-0 items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t('knowledgeBase.answerEvidence.sourceUnavailable')}
              </span>
              <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => void load()}>
                <RotateCw className="h-3 w-3" aria-hidden="true" />
                {t('knowledgeBase.answerEvidence.retry')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
