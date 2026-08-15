'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  getKnowledgeTask,
  listKnowledgeBases,
  listKnowledgeDocuments,
  rebuildKnowledgeDocument,
  retryKnowledgeDocument,
  updateKnowledgeBase,
  uploadKnowledgeDocument,
} from '@/lib/api/knowledgeBases';
import { useAppSelector } from '@/redux/hooks';
import { selectAuthSessionKey } from '@/redux/selectors';
import type {
  KnowledgeBase,
  KnowledgeBaseCreatePayload,
  KnowledgeBasePage,
  KnowledgeBaseUpdatePayload,
  KnowledgeDocumentPage,
  KnowledgeTask,
} from '@/types/knowledge';

const PAGE_SIZE = 20;
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_INTERVAL_MS = 30_000;
export const KNOWLEDGE_POLL_MAX_CONSECUTIVE_FAILURES = 5;

const processingDocumentStatuses = new Set([
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'writing',
  'deleting',
]);
const successfulTaskStatuses = new Set(['completed', 'succeeded']);
const failedTaskStatuses = new Set(['failed', 'cancelled', 'canceled']);

export function knowledgePollingDelay(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_INTERVAL_MS;
  return Math.min(POLL_INTERVAL_MS * 2 ** consecutiveFailures, POLL_MAX_INTERVAL_MS);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

const emptyBasePage = (page = 1): KnowledgeBasePage => ({
  items: [],
  page,
  page_size: PAGE_SIZE,
  total: 0,
  total_pages: 0,
  has_next: false,
  has_prev: false,
});

function withoutDeletedKnowledgeBases(page: KnowledgeBasePage): KnowledgeBasePage {
  const items = page.items.filter((item) => item.status !== 'deleted');
  return items.length === page.items.length ? page : { ...page, items };
}

const emptyDocumentPage = (page = 1): KnowledgeDocumentPage => ({
  items: [],
  page,
  page_size: PAGE_SIZE,
  total: 0,
  total_pages: 0,
  has_next: false,
  has_prev: false,
});

interface RequestBoundary {
  sessionKey: string | null;
  generation: number;
}

export type KnowledgeMutation =
  | 'create-base'
  | 'update-base'
  | 'delete-base'
  | 'upload-document'
  | 'delete-document'
  | 'retry-document'
  | 'rebuild-document'
  | null;

export interface KnowledgeBaseSettingsState {
  bases: KnowledgeBasePage;
  documents: KnowledgeDocumentPage;
  selectedBase: KnowledgeBase | null;
  selectedBaseId: string | null;
  loadingBases: boolean;
  loadingDocuments: boolean;
  mutation: KnowledgeMutation;
  error: unknown;
  pollingWarning: unknown;
  pollingPaused: boolean;
  trackedTasks: KnowledgeTask[];
  setSelectedBaseId: (knowledgeBaseId: string) => void;
  setBasePage: (page: number) => void;
  setDocumentPage: (page: number) => void;
  refresh: () => Promise<void>;
  clearError: () => void;
  createBase: (payload: KnowledgeBaseCreatePayload) => Promise<KnowledgeBase>;
  updateBase: (
    knowledgeBaseId: string,
    payload: KnowledgeBaseUpdatePayload,
  ) => Promise<KnowledgeBase>;
  removeBase: (knowledgeBaseId: string) => Promise<KnowledgeTask>;
  uploadDocument: (knowledgeBaseId: string, file: File) => Promise<void>;
  removeDocument: (knowledgeBaseId: string, documentId: string) => Promise<void>;
  retryDocument: (knowledgeBaseId: string, documentId: string) => Promise<void>;
  rebuildDocument: (knowledgeBaseId: string, documentId: string) => Promise<void>;
}

export function useKnowledgeBaseSettings(): KnowledgeBaseSettingsState {
  const authSessionKey = useAppSelector(selectAuthSessionKey);
  const renderBoundaryRef = useRef<RequestBoundary>({ sessionKey: null, generation: 0 });
  if (renderBoundaryRef.current.sessionKey !== authSessionKey) {
    renderBoundaryRef.current = {
      sessionKey: authSessionKey,
      generation: renderBoundaryRef.current.generation + 1,
    };
  }

  const [bases, setBases] = useState<KnowledgeBasePage>(() => emptyBasePage());
  const [documents, setDocuments] = useState<KnowledgeDocumentPage>(() => emptyDocumentPage());
  const [dataSessionKey, setDataSessionKey] = useState<string | null>(null);
  const [selectedBaseId, setSelectedBaseIdState] = useState<string | null>(null);
  const [basePage, setBasePageState] = useState(1);
  const [documentPage, setDocumentPageState] = useState(1);
  const [loadingBases, setLoadingBases] = useState(false);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [mutation, setMutation] = useState<KnowledgeMutation>(null);
  const [error, setError] = useState<unknown>(null);
  const [pollingWarning, setPollingWarning] = useState<unknown>(null);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [taskFailureMessage, setTaskFailureMessage] = useState<string | null>(null);
  const [trackedTasks, setTrackedTasks] = useState<Record<string, KnowledgeTask>>({});
  const trackedTasksRef = useRef<Record<string, KnowledgeTask>>({});
  trackedTasksRef.current = trackedTasks;
  const selectedBaseIdRef = useRef<string | null>(null);
  selectedBaseIdRef.current = selectedBaseId;
  const baseRequestRef = useRef<AbortController | null>(null);
  const documentRequestRef = useRef<AbortController | null>(null);
  const taskRequestRef = useRef<AbortController | null>(null);
  const mutationRequestRef = useRef<AbortController | null>(null);
  const pollFailuresRef = useRef(0);

  const beginRequest = useCallback((slot: MutableRefObject<AbortController | null>) => {
    slot.current?.abort();
    const controller = new AbortController();
    slot.current = controller;
    return controller;
  }, []);
  const endRequest = useCallback(
    (slot: MutableRefObject<AbortController | null>, controller: AbortController) => {
      if (slot.current === controller) slot.current = null;
    },
    [],
  );
  const abortAllRequests = useCallback(() => {
    for (const slot of [
      baseRequestRef,
      documentRequestRef,
      taskRequestRef,
      mutationRequestRef,
    ]) {
      slot.current?.abort();
      slot.current = null;
    }
  }, []);
  const abortPollingRequests = useCallback(() => {
    for (const slot of [baseRequestRef, documentRequestRef, taskRequestRef]) {
      slot.current?.abort();
      slot.current = null;
    }
  }, []);

  const captureBoundary = useCallback(
    (): RequestBoundary => ({ ...renderBoundaryRef.current }),
    [],
  );
  const isCurrent = useCallback(
    (boundary: RequestBoundary): boolean =>
      boundary.sessionKey === renderBoundaryRef.current.sessionKey &&
      boundary.generation === renderBoundaryRef.current.generation,
    [],
  );

  const trackTask = useCallback((task: KnowledgeTask) => {
    setTrackedTasks((current) => ({ ...current, [task.id]: task }));
    setTaskFailureMessage(null);
    setPollingPaused(false);
    pollFailuresRef.current = 0;
  }, []);

  const fetchBases = useCallback(
    async (page: number, quiet: boolean, preferredBaseId?: string | null) => {
      const boundary = captureBoundary();
      if (!boundary.sessionKey) return true;
      const controller = beginRequest(baseRequestRef);
      if (!quiet) setLoadingBases(true);
      try {
        const result = withoutDeletedKnowledgeBases(
          await listKnowledgeBases({ page, pageSize: PAGE_SIZE }, controller.signal),
        );
        if (!isCurrent(boundary)) return true;
        setBases(result);
        setBasePageState(result.page || page);
        setSelectedBaseIdState((current) => {
          const preferred = preferredBaseId ?? selectedBaseIdRef.current ?? current;
          const nextSelection =
            preferred && result.items.some((item) => item.id === preferred)
              ? preferred
              : (result.items[0]?.id ?? null);
          selectedBaseIdRef.current = nextSelection;
          return nextSelection;
        });
        return true;
      } catch (requestError) {
        if (isAbortError(requestError) || !isCurrent(boundary)) return true;
        if (quiet) setPollingWarning(requestError);
        else setError(requestError);
        return false;
      } finally {
        const ownsSlot = baseRequestRef.current === controller;
        endRequest(baseRequestRef, controller);
        if (!quiet && ownsSlot && isCurrent(boundary)) setLoadingBases(false);
      }
    },
    [beginRequest, captureBoundary, endRequest, isCurrent],
  );

  const fetchDocuments = useCallback(
    async (knowledgeBaseId: string, page: number, quiet: boolean) => {
      const boundary = captureBoundary();
      if (!boundary.sessionKey) return true;
      const controller = beginRequest(documentRequestRef);
      if (!quiet) setLoadingDocuments(true);
      try {
        const result = await listKnowledgeDocuments(
          knowledgeBaseId,
          { page, pageSize: PAGE_SIZE },
          controller.signal,
        );
        if (!isCurrent(boundary) || selectedBaseIdRef.current !== knowledgeBaseId) return true;
        setDocuments(result);
        setDocumentPageState(result.page || page);
        return true;
      } catch (requestError) {
        if (isAbortError(requestError) || !isCurrent(boundary)) return true;
        if (quiet) setPollingWarning(requestError);
        else setError(requestError);
        return false;
      } finally {
        const ownsSlot = documentRequestRef.current === controller;
        endRequest(documentRequestRef, controller);
        if (!quiet && ownsSlot && isCurrent(boundary)) setLoadingDocuments(false);
      }
    },
    [beginRequest, captureBoundary, endRequest, isCurrent],
  );

  const refreshTrackedTasks = useCallback(async () => {
    const boundary = captureBoundary();
    const taskIds = Object.keys(trackedTasksRef.current);
    if (!boundary.sessionKey || taskIds.length === 0) return true;
    const controller = beginRequest(taskRequestRef);
    const results = await Promise.allSettled(
      taskIds.map((taskId) => getKnowledgeTask(taskId, controller.signal)),
    );
    if (!isCurrent(boundary) || controller.signal.aborted) {
      endRequest(taskRequestRef, controller);
      return true;
    }
    let firstError: unknown = null;
    let taskFailed = false;
    const taskUpdates = new Map<string, KnowledgeTask | null>();
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        firstError ??= result.reason;
        return;
      }
      const status = result.value.status.toLowerCase();
      if (failedTaskStatuses.has(status)) {
        taskFailed = true;
        taskUpdates.set(taskIds[index], null);
      } else if (successfulTaskStatuses.has(status)) {
        taskUpdates.set(taskIds[index], null);
      } else {
        taskUpdates.set(taskIds[index], result.value);
      }
    });
    setTrackedTasks((current) => {
      const next = { ...current };
      taskUpdates.forEach((task, taskId) => {
        if (task) next[taskId] = task;
        else delete next[taskId];
      });
      return next;
    });
    if (taskFailed) setTaskFailureMessage('KNOWLEDGE_TASK_FAILED');
    endRequest(taskRequestRef, controller);
    if (firstError && !isAbortError(firstError)) setPollingWarning(firstError);
    return firstError === null || isAbortError(firstError);
  }, [beginRequest, captureBoundary, endRequest, isCurrent]);

  useEffect(() => () => abortAllRequests(), [abortAllRequests]);

  useEffect(() => {
    abortAllRequests();
    setDataSessionKey(authSessionKey);
    setBases(emptyBasePage());
    setDocuments(emptyDocumentPage());
    setSelectedBaseIdState(null);
    setBasePageState(1);
    setDocumentPageState(1);
    setTrackedTasks({});
    setError(null);
    setPollingWarning(null);
    setPollingPaused(false);
    setTaskFailureMessage(null);
    pollFailuresRef.current = 0;
    setMutation(null);
    setLoadingDocuments(false);
    if (!authSessionKey) {
      setLoadingBases(false);
      return;
    }
    void fetchBases(1, false);
  }, [abortAllRequests, authSessionKey, fetchBases]);

  useEffect(() => {
    documentRequestRef.current?.abort();
    setDocuments(emptyDocumentPage());
    setDocumentPageState(1);
    if (selectedBaseId) void fetchDocuments(selectedBaseId, 1, false);
  }, [fetchDocuments, selectedBaseId]);

  const shouldPoll = useMemo(
    () =>
      bases.items.some((item) => item.status === 'deleting') ||
      documents.items.some((item) => processingDocumentStatuses.has(item.status)) ||
      Object.keys(trackedTasks).length > 0,
    [bases.items, documents.items, trackedTasks],
  );

  useEffect(() => {
    if (!authSessionKey || !shouldPoll || pollingPaused) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let running = false;

    const poll = async () => {
      if (stopped || running || document.hidden) return;
      running = true;
      const results = await Promise.all([
        fetchBases(basePage, true),
        selectedBaseId
          ? fetchDocuments(selectedBaseId, documentPage, true)
          : Promise.resolve(true),
        refreshTrackedTasks(),
      ]);
      running = false;
      if (stopped) return;
      if (results.every(Boolean)) {
        pollFailuresRef.current = 0;
        setPollingWarning(null);
      } else {
        pollFailuresRef.current += 1;
        if (pollFailuresRef.current >= KNOWLEDGE_POLL_MAX_CONSECUTIVE_FAILURES) {
          setPollingPaused(true);
          return;
        }
      }
      timer = setTimeout(poll, knowledgePollingDelay(pollFailuresRef.current));
    };

    const handleVisibilityChange = () => {
      if (stopped) return;
      if (document.hidden) {
        abortPollingRequests();
        if (timer) clearTimeout(timer);
        timer = null;
        return;
      }
      if (timer) clearTimeout(timer);
      void poll();
    };

    timer = setTimeout(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    authSessionKey,
    abortPollingRequests,
    basePage,
    documentPage,
    fetchBases,
    fetchDocuments,
    refreshTrackedTasks,
    pollingPaused,
    selectedBaseId,
    shouldPoll,
  ]);

  const runMutation = useCallback(
    async <T,>(
      kind: Exclude<KnowledgeMutation, null>,
      operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> => {
      const boundary = captureBoundary();
      if (!boundary.sessionKey) throw new DOMException('当前没有可用登录会话', 'AbortError');
      const controller = beginRequest(mutationRequestRef);
      setMutation(kind);
      setError(null);
      try {
        const result = await operation(controller.signal);
        if (!isCurrent(boundary)) throw new DOMException('账号已经切换', 'AbortError');
        return result;
      } catch (requestError) {
        if (isCurrent(boundary) && !isAbortError(requestError)) setError(requestError);
        throw requestError;
      } finally {
        const ownsSlot = mutationRequestRef.current === controller;
        endRequest(mutationRequestRef, controller);
        if (ownsSlot && isCurrent(boundary)) setMutation(null);
      }
    },
    [beginRequest, captureBoundary, endRequest, isCurrent],
  );

  const createBase = useCallback(
    async (payload: KnowledgeBaseCreatePayload) => {
      const created = await runMutation('create-base', (signal) =>
        createKnowledgeBase(payload, signal),
      );
      setBasePageState(1);
      await fetchBases(1, true, created.id);
      return created;
    },
    [fetchBases, runMutation],
  );

  const updateBase = useCallback(
    async (knowledgeBaseId: string, payload: KnowledgeBaseUpdatePayload) => {
      const updated = await runMutation('update-base', (signal) =>
        updateKnowledgeBase(knowledgeBaseId, payload, signal),
      );
      setBases((current) => ({
        ...current,
        items: current.items.map((item) => (item.id === updated.id ? updated : item)),
      }));
      return updated;
    },
    [runMutation],
  );

  const removeBase = useCallback(
    async (knowledgeBaseId: string) => {
      const task = await runMutation('delete-base', (signal) =>
        deleteKnowledgeBase(knowledgeBaseId, signal),
      );
      trackTask(task);
      setBases((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === knowledgeBaseId ? { ...item, status: 'deleting' } : item,
        ),
      }));
      return task;
    },
    [runMutation, trackTask],
  );

  const uploadDocument = useCallback(
    async (knowledgeBaseId: string, file: File) => {
      const result = await runMutation('upload-document', (signal) =>
        uploadKnowledgeDocument(knowledgeBaseId, file, signal),
      );
      trackTask(result.task);
      if (selectedBaseIdRef.current === knowledgeBaseId) {
        setDocuments((current) => ({
          ...current,
          items: [
            result.document,
            ...current.items.filter((item) => item.id !== result.document.id),
          ],
          total:
            current.total +
            (current.items.some((item) => item.id === result.document.id) ? 0 : 1),
        }));
      }
      await fetchBases(basePage, true);
    },
    [basePage, fetchBases, runMutation, trackTask],
  );

  const removeDocument = useCallback(
    async (knowledgeBaseId: string, documentId: string) => {
      const task = await runMutation('delete-document', (signal) =>
        deleteKnowledgeDocument(knowledgeBaseId, documentId, signal),
      );
      trackTask(task);
      if (selectedBaseIdRef.current === knowledgeBaseId) {
        setDocuments((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === documentId ? { ...item, status: 'deleting' } : item,
          ),
        }));
      }
    },
    [runMutation, trackTask],
  );

  const queueDocumentAction = useCallback(
    async (
      kind: 'retry-document' | 'rebuild-document',
      knowledgeBaseId: string,
      documentId: string,
    ) => {
      const task = await runMutation(kind, (signal) =>
        kind === 'retry-document'
          ? retryKnowledgeDocument(knowledgeBaseId, documentId, signal)
          : rebuildKnowledgeDocument(knowledgeBaseId, documentId, signal),
      );
      trackTask(task);
      if (selectedBaseIdRef.current === knowledgeBaseId) {
        await fetchDocuments(knowledgeBaseId, documentPage, true);
      }
    },
    [documentPage, fetchDocuments, runMutation, trackTask],
  );

  const setSelectedBaseId = useCallback((knowledgeBaseId: string) => {
    documentRequestRef.current?.abort();
    selectedBaseIdRef.current = knowledgeBaseId;
    setSelectedBaseIdState(knowledgeBaseId);
  }, []);
  const setBasePage = useCallback((page: number) => {
    setBasePageState(page);
    void fetchBases(page, false);
  }, [fetchBases]);
  const setDocumentPage = useCallback(
    (page: number) => {
      if (!selectedBaseId) return;
      setDocumentPageState(page);
      void fetchDocuments(selectedBaseId, page, false);
    },
    [fetchDocuments, selectedBaseId],
  );
  const refresh = useCallback(async () => {
    setError(null);
    setPollingPaused(false);
    setTaskFailureMessage(null);
    setPollingWarning(null);
    pollFailuresRef.current = 0;
    await Promise.all([
      fetchBases(basePage, false),
      selectedBaseId ? fetchDocuments(selectedBaseId, documentPage, false) : Promise.resolve(),
    ]);
  }, [basePage, documentPage, fetchBases, fetchDocuments, selectedBaseId]);

  const sessionMatches = dataSessionKey === authSessionKey;
  const visibleBases = sessionMatches ? bases : emptyBasePage();
  const visibleDocuments = sessionMatches ? documents : emptyDocumentPage();
  const visibleSelectedBaseId = sessionMatches ? selectedBaseId : null;

  return {
    bases: visibleBases,
    documents: visibleDocuments,
    selectedBase:
      visibleBases.items.find((item) => item.id === visibleSelectedBaseId) ?? null,
    selectedBaseId: visibleSelectedBaseId,
    loadingBases: sessionMatches && loadingBases,
    loadingDocuments: sessionMatches && loadingDocuments,
    mutation,
    error,
    pollingWarning: taskFailureMessage ?? pollingWarning,
    pollingPaused,
    trackedTasks: Object.values(trackedTasks),
    setSelectedBaseId,
    setBasePage,
    setDocumentPage,
    refresh,
    clearError: () => setError(null),
    createBase,
    updateBase,
    removeBase,
    uploadDocument,
    removeDocument,
    retryDocument: (knowledgeBaseId, documentId) =>
      queueDocumentAction('retry-document', knowledgeBaseId, documentId),
    rebuildDocument: (knowledgeBaseId, documentId) =>
      queueDocumentAction('rebuild-document', knowledgeBaseId, documentId),
  };
}
