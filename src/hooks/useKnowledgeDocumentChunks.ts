'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { listKnowledgeDocumentChunks } from '@/lib/api/knowledgeBases';
import { useAppSelector } from '@/redux/hooks';
import { selectAuthSessionKey } from '@/redux/selectors';
import type { KnowledgeDocumentChunkPage } from '@/types/knowledge';

const CHUNK_PAGE_SIZE = 10;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

interface UseKnowledgeDocumentChunksOptions {
  open: boolean;
  knowledgeBaseId: string | null;
  documentId: string | null;
}

interface ChunkPreviewState {
  scopeKey: string | null;
  data: KnowledgeDocumentChunkPage | null;
  page: number;
  loading: boolean;
  error: unknown;
}

interface RequestBoundary {
  scopeKey: string | null;
  generation: number;
}

export interface KnowledgeDocumentChunksState {
  data: KnowledgeDocumentChunkPage | null;
  page: number;
  loading: boolean;
  error: unknown;
  setPage: (page: number) => void;
  retry: () => void;
}

const emptyState = (scopeKey: string | null = null): ChunkPreviewState => ({
  scopeKey,
  data: null,
  page: 1,
  loading: false,
  error: null,
});

export function useKnowledgeDocumentChunks({
  open,
  knowledgeBaseId,
  documentId,
}: UseKnowledgeDocumentChunksOptions): KnowledgeDocumentChunksState {
  const authSessionKey = useAppSelector(selectAuthSessionKey);
  const scopeKey =
    open && authSessionKey && knowledgeBaseId && documentId
      ? JSON.stringify([authSessionKey, knowledgeBaseId, documentId])
      : null;
  const boundaryRef = useRef<RequestBoundary>({ scopeKey: null, generation: 0 });
  if (boundaryRef.current.scopeKey !== scopeKey) {
    boundaryRef.current = {
      scopeKey,
      generation: boundaryRef.current.generation + 1,
    };
  }

  const [state, setState] = useState<ChunkPreviewState>(() => emptyState());
  const requestRef = useRef<AbortController | null>(null);
  const failedPageRef = useRef<number | null>(null);
  const requestedPageRef = useRef<number | null>(null);

  const loadPage = useCallback(
    async (targetPage: number) => {
      const boundary = { ...boundaryRef.current };
      if (!scopeKey || !authSessionKey || !knowledgeBaseId || !documentId || targetPage < 1) {
        return;
      }

      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      requestedPageRef.current = targetPage;
      setState((current) => ({
        scopeKey,
        data: current.scopeKey === scopeKey ? current.data : null,
        page: current.scopeKey === scopeKey ? current.page : 1,
        loading: true,
        error: null,
      }));

      try {
        const result = await listKnowledgeDocumentChunks(
          knowledgeBaseId,
          documentId,
          { page: targetPage, pageSize: CHUNK_PAGE_SIZE },
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          boundary.scopeKey !== boundaryRef.current.scopeKey ||
          boundary.generation !== boundaryRef.current.generation
        ) {
          return;
        }
        failedPageRef.current = null;
        setState({
          scopeKey,
          data: result,
          page: result.page || targetPage,
          loading: false,
          error: null,
        });
      } catch (requestError) {
        if (
          isAbortError(requestError) ||
          controller.signal.aborted ||
          boundary.scopeKey !== boundaryRef.current.scopeKey ||
          boundary.generation !== boundaryRef.current.generation
        ) {
          return;
        }
        failedPageRef.current = targetPage;
        setState((current) => ({
          scopeKey,
          data: current.scopeKey === scopeKey ? current.data : null,
          page: current.scopeKey === scopeKey ? current.page : 1,
          loading: false,
          error: requestError,
        }));
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          requestedPageRef.current = null;
        }
      }
    },
    [authSessionKey, documentId, knowledgeBaseId, scopeKey],
  );

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    failedPageRef.current = null;
    requestedPageRef.current = null;
    if (!scopeKey) {
      setState(emptyState());
      return;
    }
    setState({ ...emptyState(scopeKey), loading: true });
    void loadPage(1);
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [loadPage, scopeKey]);

  const visibleState = state.scopeKey === scopeKey ? state : emptyState(scopeKey);

  return {
    data: visibleState.data,
    page: visibleState.page,
    loading: visibleState.loading,
    error: visibleState.error,
    setPage: (page: number) => {
      if (
        page === visibleState.page &&
        !visibleState.error &&
        requestedPageRef.current === null
      ) {
        return;
      }
      void loadPage(page);
    },
    retry: () => void loadPage(failedPageRef.current ?? visibleState.page),
  };
}
