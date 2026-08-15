'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, BookOpen, Check, Loader2, RotateCw, ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getChatCapabilities } from '@/lib/api/chat';
import { listKnowledgeBases } from '@/lib/api/knowledgeBases';
import type { KnowledgeBase } from '@/types/knowledge';

const KNOWLEDGE_BASE_PAGE_SIZE = 100;
const MAX_KNOWLEDGE_BASE_PAGES = 20;
const MAX_KNOWLEDGE_BASE_ITEMS = 1_000;

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';
export type KnowledgeSelectionStatus =
  | 'ready'
  | 'loading'
  | 'failed'
  | 'unavailable'
  | 'limit_exceeded';

interface KnowledgeBaseComposerControlProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
  scopeKey?: string | null;
  enabled?: boolean;
  onSelectionStatusChange?: (status: KnowledgeSelectionStatus) => void;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isAvailableForQuestionAnswering(base: KnowledgeBase): boolean {
  return base.status === 'active' && base.document_stats.ready > 0;
}

interface KnowledgeBaseLoadResult {
  items: KnowledgeBase[];
  maxSelectedKnowledgeBases: number;
}

async function loadAllAvailableKnowledgeBases(
  signal: AbortSignal,
): Promise<KnowledgeBaseLoadResult> {
  const capabilities = await getChatCapabilities(signal);
  if (
    !capabilities.knowledge_grounding_v1
    || !Number.isSafeInteger(capabilities.knowledge_grounding_max_bases)
    || capabilities.knowledge_grounding_max_bases < 1
  ) {
    throw new Error('当前服务端不支持严格知识库问答');
  }
  const items: KnowledgeBase[] = [];
  let page = 1;
  let hasNext = true;
  let scannedItemCount = 0;

  while (
    hasNext
    && page <= MAX_KNOWLEDGE_BASE_PAGES
    && scannedItemCount < MAX_KNOWLEDGE_BASE_ITEMS
  ) {
    const result = await listKnowledgeBases(
      { page, pageSize: KNOWLEDGE_BASE_PAGE_SIZE },
      signal,
    );
    const remainingItemBudget = MAX_KNOWLEDGE_BASE_ITEMS - scannedItemCount;
    const inspectedItems = result.items.slice(0, remainingItemBudget);
    scannedItemCount += inspectedItems.length;
    items.push(...inspectedItems.filter(isAvailableForQuestionAnswering));
    hasNext = result.has_next;
    page += 1;
  }

  return {
    items,
    maxSelectedKnowledgeBases: capabilities.knowledge_grounding_max_bases,
  };
}

export default function KnowledgeBaseComposerControl({
  selectedIds,
  onChange,
  disabled,
  scopeKey = 'composer',
  enabled = true,
  onSelectionStatusChange,
}: KnowledgeBaseComposerControlProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [maxSelectedKnowledgeBases, setMaxSelectedKnowledgeBases] = useState<number | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    requestGenerationRef.current += 1;
    const generation = requestGenerationRef.current;
    const controller = new AbortController();

    if (!enabled || scopeKey == null) {
      setBases([]);
      setMaxSelectedKnowledgeBases(null);
      setLoadState('idle');
      return () => controller.abort();
    }

    setBases([]);
    setMaxSelectedKnowledgeBases(null);
    setLoadState('loading');
    void loadAllAvailableKnowledgeBases(controller.signal)
      .then((result) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setBases(result.items);
        setMaxSelectedKnowledgeBases(result.maxSelectedKnowledgeBases);
        setLoadState('ready');
      })
      .catch((error) => {
        if (
          isAbortError(error) ||
          controller.signal.aborted ||
          generation !== requestGenerationRef.current
        ) {
          return;
        }
        setBases([]);
        setMaxSelectedKnowledgeBases(null);
        setLoadState('failed');
      });

    return () => controller.abort();
  }, [enabled, retryGeneration, scopeKey]);

  const baseById = useMemo(
    () => new Map(bases.map((base) => [base.id, base])),
    [bases],
  );
  const unavailableIds = useMemo(
    () => loadState === 'ready'
      ? selectedIds.filter((id) => !baseById.has(id))
      : [],
    [baseById, loadState, selectedIds],
  );
  const hasUnavailable = unavailableIds.length > 0;
  const selectionLimitExceeded = loadState === 'ready'
    && maxSelectedKnowledgeBases !== null
    && selectedIds.length > maxSelectedKnowledgeBases;
  const selectionStatus: KnowledgeSelectionStatus = selectedIds.length === 0
    ? 'ready'
    : loadState === 'failed'
      ? 'failed'
      : loadState !== 'ready'
        ? 'loading'
        : selectionLimitExceeded
          ? 'limit_exceeded'
          : hasUnavailable
            ? 'unavailable'
            : 'ready';

  useEffect(() => {
    onSelectionStatusChange?.(selectionStatus);
  }, [onSelectionStatusChange, selectionStatus]);

  const toggleKnowledgeBase = useCallback((knowledgeBaseId: string) => {
    if (selectedIds.includes(knowledgeBaseId)) {
      onChange(selectedIds.filter((id) => id !== knowledgeBaseId));
      return;
    }
    if (
      maxSelectedKnowledgeBases === null
      || selectedIds.length >= maxSelectedKnowledgeBases
    ) return;
    onChange([...selectedIds, knowledgeBaseId]);
  }, [maxSelectedKnowledgeBases, onChange, selectedIds]);

  if (!enabled) return null;

  return (
    <div className="border-b border-border/40 px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={selectedIds.length > 0 ? 'secondary' : 'ghost'}
              size="sm"
              disabled={disabled}
              aria-label={t('knowledgeBase.composer.trigger')}
              className="h-7 shrink-0 gap-1.5 px-2 text-xs"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              {t('knowledgeBase.composer.trigger')}
              {selectedIds.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
                  {selectedIds.length}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={8}
            className="w-[22rem] max-w-[calc(100vw-1rem)] p-0"
            aria-label={t('knowledgeBase.composer.title')}
          >
            <div className="border-b border-border/60 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t('knowledgeBase.composer.title')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('knowledgeBase.composer.description')}
                  </p>
                </div>
                {selectedIds.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => onChange([])}
                  >
                    {t('knowledgeBase.composer.clear')}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5">
              {loadState === 'loading' ? (
                <div role="status" className="flex min-h-24 items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  {t('knowledgeBase.composer.loading')}
                </div>
              ) : loadState === 'failed' ? (
                <div role="alert" className="flex min-h-24 flex-col items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground">
                  <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                  <span>{t('knowledgeBase.composer.failed')}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => setRetryGeneration((value) => value + 1)}
                  >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('knowledgeBase.composer.retry')}
                  </Button>
                </div>
              ) : bases.length === 0 ? (
                <div className="flex min-h-24 items-center justify-center px-3 text-center text-xs text-muted-foreground">
                  {t('knowledgeBase.composer.empty')}
                </div>
              ) : (
                <div className="space-y-1">
                  {bases.map((base) => {
                    const checked = selectedIds.includes(base.id);
                    const selectionLimitReached = !checked && (
                      maxSelectedKnowledgeBases === null
                      || selectedIds.length >= maxSelectedKnowledgeBases
                    );
                    return (
                      <label
                        key={base.id}
                        className={`flex min-w-0 items-center gap-3 rounded-md px-2.5 py-2 transition-colors ${
                          selectionLimitReached
                            ? 'cursor-not-allowed opacity-50'
                            : 'cursor-pointer hover:bg-muted/60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled || selectionLimitReached}
                          aria-label={base.name}
                          onChange={() => toggleKnowledgeBase(base.id)}
                          className="peer sr-only"
                        />
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background'
                        }`}>
                          {checked ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">{base.name}</span>
                          {base.description ? (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {base.description}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {maxSelectedKnowledgeBases !== null
            && selectedIds.length >= maxSelectedKnowledgeBases ? (
              <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
                {t('knowledgeBase.composer.limit', { count: maxSelectedKnowledgeBases })}
              </p>
            ) : null}
          </PopoverContent>
        </Popover>

        {selectedIds.map((id) => {
          const base = baseById.get(id);
          const unavailable = loadState === 'ready' && !base;
          const pendingValidation = loadState === 'idle' || loadState === 'loading';
          const validationFailed = loadState === 'failed';
          const label = base?.name
            ?? (pendingValidation
              ? t('knowledgeBase.composer.validating')
              : validationFailed
                ? t('knowledgeBase.composer.validationFailed')
                : t('knowledgeBase.composer.unavailable'));
          return (
            <span
              key={id}
              className={`inline-flex max-w-48 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                unavailable
                  ? 'border-destructive/30 bg-destructive/5 text-destructive'
                  : pendingValidation || validationFailed
                    ? 'border-warn/30 bg-warn/5 text-warn'
                  : 'border-primary/20 bg-primary/5 text-foreground'
              }`}
              title={label}
            >
              <span className="truncate">{label}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={t('knowledgeBase.composer.remove', { name: label })}
                onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== id))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          );
        })}

        {selectedIds.length > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck
              className={`h-3.5 w-3.5 ${selectionStatus === 'ready' ? 'text-success' : 'text-warn'}`}
              aria-hidden="true"
            />
            {t('knowledgeBase.composer.strict')}
          </span>
        ) : null}
      </div>

      {selectionStatus === 'loading' ? (
        <p role="status" className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {t('knowledgeBase.composer.validatingHint')}
        </p>
      ) : selectionStatus === 'failed' ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {t('knowledgeBase.composer.failedSelectionHint')}
        </p>
      ) : selectionLimitExceeded ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {t('knowledgeBase.composer.limitExceededHint', {
            count: maxSelectedKnowledgeBases,
          })}
        </p>
      ) : hasUnavailable ? (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {t('knowledgeBase.composer.unavailableHint')}
        </p>
      ) : null}
    </div>
  );
}

export { isAvailableForQuestionAnswering };
