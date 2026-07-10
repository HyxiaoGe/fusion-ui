import { useCallback, useEffect, useRef } from 'react';
import { createSelector } from '@reduxjs/toolkit';
import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  acknowledgeConversationListRefresh,
  appendConversationList,
  setConversationList,
  setListError,
  setLoadingList,
  setLoadingMore,
  updateConversationsMetadata,
  setSearchLoading,
  setSearchResults,
  setSearchError,
  clearSearch,
} from '@/redux/slices/conversationSlice';
import type { ConversationListRequestMetadata } from '@/redux/slices/conversationSlice';
import {
  getConversations,
  getConversationsMetadata,
  searchConversations as searchConversationsApi,
} from '@/lib/api/chat';
import { parseTimestamp } from '@/lib/utils/parseTimestamp';
import type { Conversation, Pagination } from '@/types/conversation';
import type { RootState } from '@/redux/store';

export type ConversationListItem = Omit<Conversation, 'messages'>;
export const CONVERSATION_PAGE_SIZE = 20;
const METADATA_BATCH_SIZE = 100;
const METADATA_MAX_ATTEMPTS = 3;
const METADATA_RETRY_BASE_MS = 250;

interface ConversationListRequestContext {
  authSessionKey: string;
  epoch: number;
}

function selectAuthSessionKey(state: RootState): string | null {
  if (!state.auth.isAuthenticated) return null;
  return state.auth.user?.id ?? state.auth.token ?? null;
}

function captureRequestContext(state: RootState): ConversationListRequestContext | null {
  const authSessionKey = selectAuthSessionKey(state);
  if (!authSessionKey) return null;
  return {
    authSessionKey,
    epoch: state.conversation.conversationListEpoch,
  };
}

function isRequestContextCurrent(
  state: RootState,
  context: ConversationListRequestContext
): boolean {
  return (
    selectAuthSessionKey(state) === context.authSessionKey &&
    state.conversation.conversationListEpoch === context.epoch
  );
}

function captureMetadataSnapshot(
  state: RootState,
  ids?: string[]
): ConversationListRequestMetadata {
  const targetIds = ids ?? Object.keys(state.conversation.byId);
  return targetIds.reduce<ConversationListRequestMetadata>((snapshot, id) => {
    const conversation = state.conversation.byId[id];
    if (!conversation) return snapshot;
    snapshot[id] = {
      title: conversation.title,
      model_id: conversation.model_id,
      updatedAt: conversation.updatedAt,
    };
    return snapshot;
  }, {});
}

export interface ConversationListView {
  conversations: ConversationListItem[];
  isLoadingList: boolean;
  isLoadingMore: boolean;
  listIds: string[];
  pagination: Pagination | null;
  searchResults: ConversationListItem[] | null;
  isSearching: boolean;
  searchError: string | null;
}

function mapServerItem(item: any): Conversation {
  return {
    id: item.id,
    title: item.title || '新对话',
    model_id: item.model_id || 'unknown',
    messages: [],
    createdAt: parseTimestamp(item.created_at),
    updatedAt: parseTimestamp(item.updated_at),
  };
}

function toListItem(conversation: Conversation | undefined): ConversationListItem | null {
  if (!conversation) return null;

  return {
    id: conversation.id,
    title: conversation.title,
    model_id: conversation.model_id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
  };
}

function isSameListItem(a: ConversationListItem, b: ConversationListItem): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.model_id === b.model_id &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt
  );
}

function isSameListItems(a: ConversationListItem[], b: ConversationListItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  return a.every((item, index) => isSameListItem(item, b[index]));
}

const selectConversationListItems = createSelector(
  [
    (state: RootState) => state.conversation.byId,
    (state: RootState) => state.conversation.listIds,
  ],
  (byId, listIds) => listIds
    .map((id) => toListItem(byId[id]))
    .filter((item): item is ConversationListItem => Boolean(item)),
  {
    memoizeOptions: {
      resultEqualityCheck: isSameListItems,
    },
  }
);

const selectSearchResultItems = createSelector(
  [(state: RootState) => state.conversation.searchResults],
  (searchResults) => searchResults
    ?.map((item) => toListItem(item))
    .filter((item): item is ConversationListItem => Boolean(item)) ?? null,
  {
    memoizeOptions: {
      resultEqualityCheck: (
        previous: ConversationListItem[] | null,
        next: ConversationListItem[] | null
      ) => {
        if (previous === next) return true;
        if (!previous || !next) return false;
        return isSameListItems(previous, next);
      },
    },
  }
);

export const selectConversationListView = createSelector(
  [
    selectConversationListItems,
    (state: RootState) => state.conversation.isLoadingList,
    (state: RootState) => state.conversation.isLoadingMore,
    (state: RootState) => state.conversation.listIds,
    (state: RootState) => state.conversation.pagination,
    selectSearchResultItems,
    (state: RootState) => state.conversation.isSearching,
    (state: RootState) => state.conversation.searchError,
  ],
  (
    conversations,
    isLoadingList,
    isLoadingMore,
    listIds,
    pagination,
    searchResults,
    isSearching,
    searchError
  ): ConversationListView => ({
    conversations,
    isLoadingList,
    isLoadingMore,
    listIds,
    pagination,
    searchResults,
    isSearching,
    searchError,
  })
);

function mapPagination(resp: any, page: number, pageSize: number): Pagination {
  return {
    currentPage: resp.page ?? page,
    pageSize: resp.page_size ?? pageSize,
    totalPages: resp.total_pages ?? Math.ceil((resp.total ?? 0) / pageSize),
    totalCount: resp.total ?? 0,
    hasNext: resp.has_next ?? false,
    hasPrev: resp.has_prev ?? false,
  };
}

export function useConversationList() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const authSessionKey = useAppSelector(selectAuthSessionKey);
  const conversationListVersion = useAppSelector(
    (state) => state.conversation.conversationListVersion
  );
  const {
    isLoadingList,
    isLoadingMore,
    pagination,
    searchResults,
    isSearching,
    searchError,
    conversations,
  } = useAppSelector(selectConversationListView);

  const mountedRef = useRef(true);
  const fetchListRequestIdRef = useRef(0);
  const loadMoreInFlightRef = useRef<Promise<void> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const metadataWorkerGenerationRef = useRef(0);
  const metadataActiveGenerationRef = useRef<number | null>(null);
  const metadataRetryRef = useRef<{
    timerId: ReturnType<typeof setTimeout>;
    resolve: (shouldContinue: boolean) => void;
  } | null>(null);
  const previousAuthSessionKeyRef = useRef(authSessionKey);

  const cancelMetadataRetry = useCallback(() => {
    const pendingRetry = metadataRetryRef.current;
    if (!pendingRetry) return;
    clearTimeout(pendingRetry.timerId);
    metadataRetryRef.current = null;
    pendingRetry.resolve(false);
  }, []);

  const waitForMetadataRetry = useCallback((
    delayMs: number,
    workerGeneration: number,
    requestContext: ConversationListRequestContext
  ): Promise<boolean> => new Promise((resolve) => {
    if (
      !mountedRef.current ||
      metadataWorkerGenerationRef.current !== workerGeneration ||
      !isRequestContextCurrent(store.getState(), requestContext)
    ) {
      resolve(false);
      return;
    }

    const timerId = setTimeout(() => {
      metadataRetryRef.current = null;
      resolve(
        mountedRef.current &&
        metadataWorkerGenerationRef.current === workerGeneration &&
        isRequestContextCurrent(store.getState(), requestContext)
      );
    }, delayMs);
    metadataRetryRef.current = { timerId, resolve };
  }), [store]);

  const fetchList = useCallback(
    async (page = 1, pageSize = CONVERSATION_PAGE_SIZE) => {
      const requestContext = captureRequestContext(store.getState());
      if (!requestContext) return;
      const requestId = fetchListRequestIdRef.current + 1;
      fetchListRequestIdRef.current = requestId;
      const requestMetadata = captureMetadataSnapshot(store.getState());
      const requestListIds = [...store.getState().conversation.listIds];
      dispatch(setLoadingList(true));
      try {
        const response = await getConversations(page, pageSize);
        if (
          !mountedRef.current ||
          fetchListRequestIdRef.current !== requestId ||
          !isRequestContextCurrent(store.getState(), requestContext)
        ) {
          return;
        }
        dispatch(
          setConversationList({
            conversations: (response.items ?? []).map(mapServerItem),
            pagination: mapPagination(response, page, pageSize),
            requestMetadata,
            requestListIds,
          })
        );
      } catch (error) {
        if (
          !mountedRef.current ||
          fetchListRequestIdRef.current !== requestId ||
          !isRequestContextCurrent(store.getState(), requestContext)
        ) {
          return;
        }
        const message = error instanceof Error ? error.message : '获取会话列表失败';
        dispatch(setListError(message));
        dispatch(setLoadingList(false));
      }
    },
    [dispatch, store]
  );

  const refreshLoadedMetadata = useCallback(async () => {
    const workerGeneration = metadataWorkerGenerationRef.current;
    if (metadataActiveGenerationRef.current === workerGeneration) return;
    if (!captureRequestContext(store.getState())) return;

    metadataActiveGenerationRef.current = workerGeneration;
    let observedVersion = store.getState().conversation.conversationListVersion;
    const workerStartEpoch = store.getState().conversation.conversationListEpoch;
    let retryAttempts = 0;
    try {
      while (true) {
        if (
          !mountedRef.current ||
          metadataWorkerGenerationRef.current !== workerGeneration
        ) {
          break;
        }

        const refreshState = store.getState().conversation;
        const dirtyIds = refreshState.conversationListDirtyIds.slice(0, METADATA_BATCH_SIZE);
        const dirtyBatch = dirtyIds.map((id) => ({
          id,
          revision: refreshState.conversationListDirtyRevisions[id],
        }));
        observedVersion = refreshState.conversationListVersion;
        if (dirtyIds.length === 0) break;

        const requestContext = captureRequestContext(store.getState());
        if (!requestContext) break;
        const requestMetadata = captureMetadataSnapshot(store.getState(), dirtyIds);

        try {
          const items = await getConversationsMetadata(dirtyIds);
          if (
            !mountedRef.current ||
            metadataWorkerGenerationRef.current !== workerGeneration ||
            !isRequestContextCurrent(store.getState(), requestContext)
          ) {
            break;
          }
          dispatch(
            updateConversationsMetadata(
              items.map((item) => ({
                id: item.id,
                title: item.title || '新对话',
                model_id: item.model_id || 'unknown',
                updatedAt: parseTimestamp(item.updated_at),
                requestMetadata: requestMetadata[item.id] ?? null,
              }))
            )
          );
          dispatch(acknowledgeConversationListRefresh(dirtyBatch));
          retryAttempts = 0;
        } catch (error) {
          console.warn('刷新对话元数据失败', error);
          if (
            !mountedRef.current ||
            metadataWorkerGenerationRef.current !== workerGeneration ||
            !isRequestContextCurrent(store.getState(), requestContext)
          ) {
            break;
          }

          retryAttempts += 1;
          if (retryAttempts >= METADATA_MAX_ATTEMPTS) {
            break;
          }
          const shouldRetry = await waitForMetadataRetry(
            METADATA_RETRY_BASE_MS * (2 ** (retryAttempts - 1)),
            workerGeneration,
            requestContext
          );
          if (!shouldRetry) break;
        }
      }
    } finally {
      if (metadataActiveGenerationRef.current === workerGeneration) {
        metadataActiveGenerationRef.current = null;
      }
      if (
        !mountedRef.current ||
        metadataWorkerGenerationRef.current !== workerGeneration
      ) {
        return;
      }
      const latestRefreshState = store.getState().conversation;
      if (
        latestRefreshState.conversationListDirtyIds.length > 0 &&
        (
          latestRefreshState.conversationListVersion > observedVersion ||
          latestRefreshState.conversationListEpoch !== workerStartEpoch
        )
      ) {
        void Promise.resolve().then(refreshLoadedMetadata);
      }
    }
  }, [dispatch, store, waitForMetadataRetry]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      fetchListRequestIdRef.current += 1;
      loadMoreInFlightRef.current = null;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      metadataWorkerGenerationRef.current += 1;
      metadataActiveGenerationRef.current = null;
      cancelMetadataRetry();
    };
  }, [cancelMetadataRetry]);

  useEffect(() => {
    if (previousAuthSessionKeyRef.current === authSessionKey) return;
    previousAuthSessionKeyRef.current = authSessionKey;
    fetchListRequestIdRef.current += 1;
    loadMoreInFlightRef.current = null;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    metadataWorkerGenerationRef.current += 1;
    metadataActiveGenerationRef.current = null;
    cancelMetadataRetry();
  }, [authSessionKey, cancelMetadataRetry, dispatch]);

  useEffect(() => {
    if (!authSessionKey) return;
    void fetchList(1, CONVERSATION_PAGE_SIZE);
  }, [authSessionKey, fetchList]);

  useEffect(() => {
    if (!authSessionKey || conversationListVersion === 0) return;
    void refreshLoadedMetadata();
  }, [authSessionKey, conversationListVersion, refreshLoadedMetadata]);

  const searchConversations = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      // 空 query：清空 search state，回到正常列表显示
      if (!trimmed) {
        if (searchAbortRef.current) {
          searchAbortRef.current.abort();
          searchAbortRef.current = null;
        }
        dispatch(clearSearch());
        return;
      }

      // 取消上一次未完成的搜索
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
      }
      const controller = new AbortController();
      searchAbortRef.current = controller;
      const requestContext = captureRequestContext(store.getState());
      if (!requestContext) {
        searchAbortRef.current = null;
        return;
      }

      dispatch(setSearchLoading(true));
      try {
        const items = await searchConversationsApi(trimmed, 50, controller.signal);
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          !isRequestContextCurrent(store.getState(), requestContext)
        ) {
          return;
        }
        const conversations: Conversation[] = items.map((item) => ({
          id: item.id,
          title: item.title || '新对话',
          model_id: item.model_id || 'unknown',
          messages: [],
          createdAt: parseTimestamp(item.created_at),
          updatedAt: parseTimestamp(item.updated_at),
        }));
        dispatch(setSearchResults(conversations));
      } catch (error: any) {
        if (
          error?.name === 'AbortError' ||
          controller.signal.aborted ||
          !mountedRef.current ||
          !isRequestContextCurrent(store.getState(), requestContext)
        ) {
          return;
        }
        const message = error instanceof Error ? error.message : '搜索失败';
        dispatch(setSearchError(message));
      } finally {
        if (searchAbortRef.current === controller) {
          searchAbortRef.current = null;
        }
      }
    },
    [dispatch, store]
  );

  const loadMore = useCallback((): Promise<void> => {
    if (loadMoreInFlightRef.current) {
      return loadMoreInFlightRef.current;
    }
    if (!pagination?.hasNext || isLoadingMore || !authSessionKey) {
      return Promise.resolve();
    }

    const requestContext = captureRequestContext(store.getState());
    if (!requestContext) return Promise.resolve();
    const requestMetadata = captureMetadataSnapshot(store.getState());
    const requestListIds = [...store.getState().conversation.listIds];
    const nextPage = pagination.currentPage + 1;
    const pageSize = pagination.pageSize;
    dispatch(setLoadingMore(true));

    const request = (async () => {
      try {
        const response = await getConversations(nextPage, pageSize);
        if (
          !mountedRef.current ||
          !isRequestContextCurrent(store.getState(), requestContext)
        ) {
          return;
        }
        dispatch(
          appendConversationList({
            conversations: (response.items ?? []).map(mapServerItem),
            pagination: mapPagination(response, nextPage, pageSize),
            requestMetadata,
            requestListIds,
          })
        );
      } catch (error) {
        if (
          !mountedRef.current ||
          !isRequestContextCurrent(store.getState(), requestContext)
        ) {
          return;
        }
        const message = error instanceof Error ? error.message : '加载更多会话失败';
        dispatch(setListError(message));
        dispatch(setLoadingMore(false));
      }
    })();

    loadMoreInFlightRef.current = request;
    void request.finally(() => {
      if (loadMoreInFlightRef.current === request) {
        loadMoreInFlightRef.current = null;
      }
    });
    return request;
  }, [authSessionKey, dispatch, isLoadingMore, pagination, store]);

  return {
    conversations,
    pagination,
    isLoadingList,
    isLoadingMore,
    loadMore,
    refreshLoadedMetadata,
    searchConversations,
    searchResults,
    isSearching,
    searchError,
  };
}
