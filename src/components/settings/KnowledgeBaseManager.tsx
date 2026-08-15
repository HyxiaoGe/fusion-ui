'use client';

import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useKnowledgeBaseSettings } from '@/hooks/useKnowledgeBaseSettings';
import { cn } from '@/lib/utils';
import { ApiError } from '@/types/api';
import type { KnowledgeBase } from '@/types/knowledge';

const acceptedFileTypes = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

const maxFileSize = 50 * 1024 * 1024;

interface BaseFormState {
  name: string;
  description: string;
  business_type: string;
}

type ConfirmTarget =
  | { type: 'base'; id: string; name: string }
  | { type: 'document'; id: string; name: string }
  | { type: 'rebuild'; id: string; name: string }
  | { type: 'retry'; id: string; name: string }
  | null;

const emptyForm: BaseFormState = { name: '', description: '', business_type: '' };

function errorMessage(
  error: unknown,
  fallback: string,
  translate: (key: string) => string,
): string {
  if (error === 'KNOWLEDGE_TASK_FAILED') return translate('knowledgeBase.errors.taskFailed');
  if (error instanceof ApiError) {
    const mappedErrors: Record<string, string> = {
      KNOWLEDGE_BASE_DISABLED: 'knowledgeBase.errors.disabled',
      KNOWLEDGE_CONFIG_INVALID: 'knowledgeBase.errors.unavailable',
      KNOWLEDGE_STORAGE_BUSY: 'knowledgeBase.errors.storageBusy',
      KNOWLEDGE_STORAGE_UNAVAILABLE: 'knowledgeBase.errors.unavailable',
      KNOWLEDGE_EMBEDDING_UNAVAILABLE: 'knowledgeBase.errors.indexingUnavailable',
      KNOWLEDGE_VECTOR_UNAVAILABLE: 'knowledgeBase.errors.indexingUnavailable',
      KNOWLEDGE_DOCUMENT_DUPLICATE: 'knowledgeBase.errors.duplicateDocument',
      KNOWLEDGE_DOCUMENT_UNSUPPORTED: 'knowledgeBase.toast.unsupportedFile',
      KNOWLEDGE_DOCUMENT_TYPE_MISMATCH: 'knowledgeBase.toast.unsupportedFile',
      KNOWLEDGE_DOCUMENT_NOT_RETRYABLE: 'knowledgeBase.errors.notRetryable',
      NOT_FOUND: 'knowledgeBase.errors.notFound',
      FILE_TOO_LARGE: 'knowledgeBase.toast.fileTooLarge',
      INVALID_PARAM: 'knowledgeBase.errors.invalidRequest',
      CONFLICT: 'knowledgeBase.errors.conflict',
      FORBIDDEN: 'knowledgeBase.errors.forbidden',
      UNAUTHORIZED: 'knowledgeBase.errors.unauthorized',
    };
    const translationKey = mappedErrors[error.code];
    return translationKey ? translate(translationKey) : fallback;
  }
  return fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function documentFailureMessage(errorCode: string | null, translate: (key: string) => string) {
  if (!errorCode) return translate('knowledgeBase.errors.documentFailed');
  if (errorCode.includes('SCANNED')) return translate('knowledgeBase.errors.scannedDocument');
  if (errorCode.includes('ENCRYPTED')) return translate('knowledgeBase.errors.encryptedDocument');
  if (errorCode.includes('EMPTY')) return translate('knowledgeBase.errors.emptyDocument');
  if (errorCode.includes('ENCODING')) return translate('knowledgeBase.errors.encodingDocument');
  if (errorCode.includes('TOO_LARGE')) return translate('knowledgeBase.errors.documentTooLarge');
  if (errorCode.includes('TIMEOUT')) return translate('knowledgeBase.errors.processingTimeout');
  if (errorCode.includes('UNSUPPORTED') || errorCode.includes('TYPE_MISMATCH')) {
    return translate('knowledgeBase.toast.unsupportedFile');
  }
  if (errorCode.includes('EMBEDDING') || errorCode.includes('VECTOR')) {
    return translate('knowledgeBase.errors.indexingUnavailable');
  }
  return translate('knowledgeBase.errors.documentFailed');
}

function fileSuffix(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index >= 0 ? filename.slice(index).toLowerCase() : '';
}

export function prepareKnowledgeFile(file: File): File {
  const suffix = fileSuffix(file.name);
  const mimetype = acceptedFileTypes[suffix as keyof typeof acceptedFileTypes];
  if (!mimetype) throw new Error('UNSUPPORTED_FILE_TYPE');
  if (file.size > maxFileSize) throw new Error('FILE_TOO_LARGE');
  if (file.type === mimetype) return file;
  return new File([file], file.name, { type: mimetype, lastModified: file.lastModified });
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const variant =
    status === 'failed'
      ? 'destructive'
      : status === 'ready' || status === 'active'
        ? 'default'
        : 'secondary';
  const Icon =
    status === 'failed'
      ? AlertCircle
      : status === 'ready' || status === 'active'
        ? CheckCircle2
        : CircleDashed;
  return (
    <Badge variant={variant} className="gap-1">
      <Icon
        className={cn(
          'h-3 w-3',
          !['failed', 'ready', 'active', 'deleted'].includes(status) && 'animate-spin',
        )}
        aria-hidden="true"
      />
      {label}
    </Badge>
  );
}

function LoadingRows({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <div className="space-y-3 py-2" role="status" aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="animate-pulse rounded-lg border p-3">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="mt-3 h-3 w-5/6 rounded bg-muted" />
          <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
  previousLabel,
  nextLabel,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft />
        {previousLabel}
      </Button>
      <span className="text-xs text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        {nextLabel}
        <ChevronRight />
      </Button>
    </div>
  );
}

export default function KnowledgeBaseManager() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const state = useKnowledgeBaseSettings();
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<BaseFormState>(emptyForm);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const busy = state.mutation !== null;
  const featureDisabled =
    state.error instanceof ApiError && state.error.code === 'KNOWLEDGE_BASE_DISABLED';
  const actionsDisabled = busy || featureDisabled;

  const statusLabel = (status: string) =>
    t(`knowledgeBase.status.${status}`, { defaultValue: t('knowledgeBase.status.unknown') });

  const openCreate = () => {
    setForm(emptyForm);
    setFormMode('create');
  };

  const openEdit = (knowledgeBase: KnowledgeBase) => {
    setForm({
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      business_type: knowledgeBase.business_type,
    });
    setFormMode('edit');
  };

  const handleFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if ([name, form.description, form.business_type].some((value) => value.includes('\0'))) {
      toast({ message: t('knowledgeBase.toast.invalidText'), type: 'error' });
      return;
    }
    try {
      if (formMode === 'create') {
        await state.createBase({
          name,
          description: form.description.trim(),
          business_type: form.business_type.trim() || 'general',
        });
        toast({ message: t('knowledgeBase.toast.created'), type: 'success' });
      } else if (formMode === 'edit' && state.selectedBaseId) {
        await state.updateBase(state.selectedBaseId, {
          name,
          description: form.description.trim(),
          business_type: form.business_type.trim() || 'general',
        });
        toast({ message: t('knowledgeBase.toast.updated'), type: 'success' });
      }
      setMobileView('detail');
      setFormMode(null);
    } catch (requestError) {
      if (isAbortError(requestError)) return;
      toast({
        message: errorMessage(requestError, t('knowledgeBase.toast.operationFailed'), t),
        type: 'error',
      });
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    const knowledgeBaseId = state.selectedBaseId;
    if (selectedFiles.length === 0 || !knowledgeBaseId) return;

    for (const selected of selectedFiles) {
      let file: File;
      try {
        file = prepareKnowledgeFile(selected);
      } catch (validationError) {
        toast({
          message:
            validationError instanceof Error && validationError.message === 'FILE_TOO_LARGE'
              ? t('knowledgeBase.toast.fileTooLarge')
              : t('knowledgeBase.toast.unsupportedFile'),
          type: 'error',
        });
        continue;
      }
      try {
        await state.uploadDocument(knowledgeBaseId, file);
        toast({ message: t('knowledgeBase.toast.uploadQueued'), type: 'success' });
      } catch (requestError) {
        if (isAbortError(requestError)) return;
        toast({
          message: errorMessage(requestError, t('knowledgeBase.toast.uploadFailed'), t),
          type: 'error',
        });
      }
    }
  };

  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    try {
      if (confirmTarget.type === 'base') {
        await state.removeBase(confirmTarget.id);
        toast({ message: t('knowledgeBase.toast.deleteQueued'), type: 'success' });
      } else if (confirmTarget.type === 'rebuild' && state.selectedBaseId) {
        await state.rebuildDocument(state.selectedBaseId, confirmTarget.id);
        toast({ message: t('knowledgeBase.toast.taskQueued'), type: 'success' });
      } else if (confirmTarget.type === 'retry' && state.selectedBaseId) {
        await state.retryDocument(state.selectedBaseId, confirmTarget.id);
        toast({ message: t('knowledgeBase.toast.taskQueued'), type: 'success' });
      } else if (state.selectedBaseId) {
        await state.removeDocument(state.selectedBaseId, confirmTarget.id);
        toast({ message: t('knowledgeBase.toast.deleteQueued'), type: 'success' });
      }
    } catch (requestError) {
      if (isAbortError(requestError)) return;
      toast({
        message: errorMessage(requestError, t('knowledgeBase.toast.operationFailed'), t),
        type: 'error',
      });
    } finally {
      setConfirmTarget(null);
    }
  };

  return (
    <Card className="overflow-hidden border-muted shadow-sm">
      <CardHeader className="border-b bg-muted/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle role="heading" aria-level={2} className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {t('knowledgeBase.title')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">{t('knowledgeBase.description')}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void state.refresh()}>
              <RefreshCw className={cn(state.loadingBases && 'animate-spin')} />
              {t('knowledgeBase.refresh')}
            </Button>
            <Button type="button" size="sm" disabled={featureDisabled} onClick={openCreate}>
              <Plus />
              {t('knowledgeBase.create')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {Boolean(state.error || state.pollingWarning || state.pollingPaused) && (
          <div aria-live="polite" className="m-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {state.pollingPaused
                ? t('knowledgeBase.pollingPaused')
                : errorMessage(
                    state.error || state.pollingWarning,
                    t('knowledgeBase.toast.operationFailed'),
                    t,
                  )}
            </span>
          </div>
        )}

        <div className="grid min-h-[30rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside
            data-testid="knowledge-base-list"
            className={cn(
              'border-b p-4 lg:block lg:border-r lg:border-b-0',
              mobileView === 'detail' && 'hidden',
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium">{t('knowledgeBase.listTitle')}</h3>
              <span className="text-xs text-muted-foreground">{state.bases.total}</span>
            </div>
            {state.loadingBases && state.bases.items.length === 0 ? (
              <LoadingRows label={t('knowledgeBase.loading')} />
            ) : state.bases.items.length === 0 ? (
              <button
                type="button"
                className="w-full rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground hover:border-primary/60 hover:text-foreground"
                disabled={featureDisabled}
                onClick={openCreate}
              >
                <Plus className="mx-auto mb-2" />
                {t('knowledgeBase.emptyBases')}
              </button>
            ) : (
              <div className="space-y-2">
                {state.bases.items.map((knowledgeBase) => (
                  <button
                    type="button"
                    key={knowledgeBase.id}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                      state.selectedBaseId === knowledgeBase.id && 'border-primary bg-primary/5',
                    )}
                    onClick={() => {
                      state.setSelectedBaseId(knowledgeBase.id);
                      setMobileView('detail');
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-medium">{knowledgeBase.name}</span>
                      <StatusBadge
                        status={knowledgeBase.status}
                        label={statusLabel(knowledgeBase.status)}
                      />
                    </div>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {knowledgeBase.description || t('knowledgeBase.noDescription')}
                    </p>
                    <p className="mt-2 truncate text-xs text-muted-foreground">
                      {t('knowledgeBase.businessType')}: {knowledgeBase.business_type}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('knowledgeBase.stats.total')} {knowledgeBase.document_stats.total} ·{' '}
                      {t('knowledgeBase.stats.ready')} {knowledgeBase.document_stats.ready} ·{' '}
                      {t('knowledgeBase.stats.processing')}{' '}
                      {knowledgeBase.document_stats.processing} ·{' '}
                      {t('knowledgeBase.stats.failed')} {knowledgeBase.document_stats.failed}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('knowledgeBase.updatedAt')}{' '}
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(knowledgeBase.updated_at))}
                    </p>
                  </button>
                ))}
              </div>
            )}
            <Pagination
              page={state.bases.page}
              totalPages={state.bases.total_pages}
              onChange={state.setBasePage}
              previousLabel={t('knowledgeBase.previous')}
              nextLabel={t('knowledgeBase.next')}
            />
          </aside>

          <section
            data-testid="knowledge-base-detail"
            className={cn(
              'min-w-0 p-4 sm:p-6 lg:block',
              mobileView === 'list' && 'hidden',
            )}
          >
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mb-3 lg:hidden"
              onClick={() => setMobileView('list')}
            >
              <ChevronLeft />
              {t('knowledgeBase.backToBases')}
            </Button>
            {!state.selectedBase ? (
              <div className="flex min-h-80 flex-col items-center justify-center text-center text-muted-foreground">
                <BookOpen className="mb-3 h-10 w-10 opacity-50" />
                <p>{t('knowledgeBase.selectPrompt')}</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-semibold">{state.selectedBase.name}</h3>
                      <StatusBadge
                        status={state.selectedBase.status}
                        label={statusLabel(state.selectedBase.status)}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {state.selectedBase.description || t('knowledgeBase.noDescription')}
                    </p>
                    {state.selectedBase.business_type && (
                      <p className="text-xs text-muted-foreground">
                        {t('knowledgeBase.businessType')}: {state.selectedBase.business_type}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={actionsDisabled || state.selectedBase.status !== 'active'}
                      onClick={() => openEdit(state.selectedBase!)}
                    >
                      <Pencil />
                      {t('knowledgeBase.edit')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={actionsDisabled || state.selectedBase.status !== 'active'}
                      onClick={() =>
                        setConfirmTarget({
                          type: 'base',
                          id: state.selectedBase!.id,
                          name: state.selectedBase!.name,
                        })
                      }
                    >
                      <Trash2 />
                      {t('knowledgeBase.delete')}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(['total', 'ready', 'processing', 'failed'] as const).map((key) => (
                    <div key={key} className="rounded-lg border bg-muted/10 p-3">
                      <div className="text-xl font-semibold">
                        {state.selectedBase!.document_stats[key]}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(`knowledgeBase.stats.${key}`)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                    <div>
                      <h4 className="font-medium">{t('knowledgeBase.documents')}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t('knowledgeBase.supportedTypes')}
                      </p>
                    </div>
                    <div>
                      <input
                        ref={fileInputRef}
                        className="sr-only"
                        type="file"
                        multiple
                        accept={Object.keys(acceptedFileTypes).join(',')}
                        onChange={(event) => void handleUpload(event)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={actionsDisabled || state.selectedBase.status !== 'active'}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {state.mutation === 'upload-document' ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Upload />
                        )}
                        {t('knowledgeBase.upload')}
                      </Button>
                    </div>
                  </div>

                  {state.loadingDocuments && state.documents.items.length === 0 ? (
                    <div className="p-4">
                      <LoadingRows label={t('knowledgeBase.loading')} />
                    </div>
                  ) : state.documents.items.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      <FileText className="mx-auto mb-3 h-9 w-9 opacity-50" />
                      {t('knowledgeBase.emptyDocuments')}
                    </div>
                  ) : (
                    <div className="divide-y">
                      {state.documents.items.map((document) => (
                        <div key={document.id} className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="max-w-full truncate font-medium">
                                  {document.filename}
                                </span>
                                <StatusBadge
                                  status={document.status}
                                  label={statusLabel(document.status)}
                                />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {document.mimetype} · {formatBytes(document.size)} ·{' '}
                                {document.chunk_count} {t('knowledgeBase.chunks')} ·{' '}
                                {new Intl.DateTimeFormat(i18n.language, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                }).format(new Date(document.updated_at))}
                              </p>
                              {document.status === 'failed' && (
                                <p className="mt-2 text-sm text-destructive">
                                  {documentFailureMessage(document.error_code, t)}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {document.status === 'failed' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={actionsDisabled}
                                  onClick={() =>
                                    setConfirmTarget({
                                      type: 'retry',
                                      id: document.id,
                                      name: document.filename,
                                    })
                                  }
                                >
                                  <RotateCcw />
                                  {t('knowledgeBase.retry')}
                                </Button>
                              )}
                              {document.status === 'ready' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={actionsDisabled}
                                  onClick={() =>
                                    setConfirmTarget({
                                      type: 'rebuild',
                                      id: document.id,
                                      name: document.filename,
                                    })
                                  }
                                >
                                  <RefreshCw />
                                  {t('knowledgeBase.rebuild')}
                                </Button>
                              )}
                              {!['deleting', 'deleted'].includes(document.status) && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={actionsDisabled}
                                  aria-label={t('knowledgeBase.deleteDocument', {
                                    name: document.filename,
                                  })}
                                  onClick={() =>
                                    setConfirmTarget({
                                      type: 'document',
                                      id: document.id,
                                      name: document.filename,
                                    })
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-4 pb-4">
                    <Pagination
                      page={state.documents.page}
                      totalPages={state.documents.total_pages}
                      onChange={state.setDocumentPage}
                      previousLabel={t('knowledgeBase.previous')}
                      nextLabel={t('knowledgeBase.next')}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </CardContent>

      <Dialog open={formMode !== null} onOpenChange={(open) => !open && setFormMode(null)}>
        <DialogContent>
          <form onSubmit={(event) => void handleFormSubmit(event)} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {formMode === 'create' ? t('knowledgeBase.createTitle') : t('knowledgeBase.editTitle')}
              </DialogTitle>
              <DialogDescription>{t('knowledgeBase.formDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="knowledge-name">{t('knowledgeBase.name')}</Label>
              <Input
                id="knowledge-name"
                required
                maxLength={120}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge-description">{t('knowledgeBase.baseDescription')}</Label>
              <Textarea
                id="knowledge-description"
                maxLength={2000}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge-business-type">{t('knowledgeBase.businessType')}</Label>
              <Input
                id="knowledge-business-type"
                maxLength={60}
                pattern="[A-Za-z0-9_-]*"
                placeholder={t('knowledgeBase.businessTypePlaceholder')}
                value={form.business_type}
                onChange={(event) =>
                  setForm((current) => ({ ...current, business_type: event.target.value }))
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormMode(null)}>
                {t('knowledgeBase.cancel')}
              </Button>
              <Button type="submit" disabled={actionsDisabled || !form.name.trim()}>
                {busy && <Loader2 className="animate-spin" />}
                {t('knowledgeBase.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => void handleConfirmAction()}
        title={
          confirmTarget?.type === 'base'
            ? t('knowledgeBase.confirmDeleteBaseTitle')
            : confirmTarget?.type === 'rebuild'
              ? t('knowledgeBase.confirmRebuildTitle')
              : confirmTarget?.type === 'retry'
                ? t('knowledgeBase.confirmRetryTitle')
                : t('knowledgeBase.confirmDeleteDocumentTitle')
        }
        description={t(
          confirmTarget?.type === 'rebuild'
            ? 'knowledgeBase.confirmRebuildDescription'
            : confirmTarget?.type === 'retry'
              ? 'knowledgeBase.confirmRetryDescription'
              : 'knowledgeBase.confirmDeleteDescription',
          { name: confirmTarget?.name ?? '' },
        )}
        confirmLabel={
          confirmTarget?.type === 'rebuild'
            ? t('knowledgeBase.rebuild')
            : confirmTarget?.type === 'retry'
              ? t('knowledgeBase.retry')
            : t('knowledgeBase.delete')
        }
        cancelLabel={t('knowledgeBase.cancel')}
        variant={
          ['rebuild', 'retry'].includes(confirmTarget?.type ?? '')
            ? 'default'
            : 'destructive'
        }
      />
    </Card>
  );
}
