import { useCallback, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
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
import {
  getConversations,
  getConversationsMetadata,
  searchConversations as searchConversationsApi,
} from '@/lib/api/chat';
import { parseTimestamp } from '@/lib/utils/parseTimestamp';
import type { Conversation, Pagination } from '@/types/conversation';
import type { RootState } from '@/redux/store';

export type ConversationListItem = Omit<Conversation, 'messages'>;

interface ConversationListView {
  conversations: ConversationListItem[];
  conversationListVersion: number;
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

function isSameStringList(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  return a.every((item, index) => item === b[index]);
}

function isSamePagination(a: Pagination | null, b: Pagination | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    a.currentPage === b.currentPage &&
    a.pageSize === b.pageSize &&
    a.totalPages === b.totalPages &&
    a.totalCount === b.totalCount &&
    a.hasNext === b.hasNext &&
    a.hasPrev === b.hasPrev
  );
}

function isSameNullableList(
  a: ConversationListItem[] | null,
  b: ConversationListItem[] | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  return isSameListItems(a, b);
}

function selectConversationListView(state: RootState): ConversationListView {
  const {
    byId,
    conversationListVersion,
    isLoadingList,
    isLoadingMore,
    listIds,
    pagination,
    searchResults,
    isSearching,
    searchError,
  } = state.conversation;

  return {
    conversations: listIds.map((id) => toListItem(byId[id])).filter((item): item is ConversationListItem => Boolean(item)),
    conversationListVersion,
    isLoadingList,
    isLoadingMore,
    listIds,
    pagination,
    searchResults: searchResults?.map((item) => toListItem(item)).filter((item): item is ConversationListItem => Boolean(item)) ?? null,
    isSearching,
    searchError,
  };
}

function isSameConversationListView(a: ConversationListView, b: ConversationListView): boolean {
  return (
    a.conversationListVersion === b.conversationListVersion &&
    a.isLoadingList === b.isLoadingList &&
    a.isLoadingMore === b.isLoadingMore &&
    a.isSearching === b.isSearching &&
    a.searchError === b.searchError &&
    isSameStringList(a.listIds, b.listIds) &&
    isSamePagination(a.pagination, b.pagination) &&
    isSameListItems(a.conversations, b.conversations) &&
    isSameNullableList(a.searchResults, b.searchResults)
  );
}

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
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const {
    conversationListVersion,
    isLoadingList,
    isLoadingMore,
    listIds,
    pagination,
    searchResults,
    isSearching,
    searchError,
    conversations,
  } = useAppSelector(selectConversationListView, isSameConversationListView);

  const fetchList = useCallback(
    async (page = 1, pageSize = 10) => {
      if (!isAuthenticated) return;
      dispatch(setLoadingList(true));
      try {
        const response = await getConversations(page, pageSize);
        dispatch(
          setConversationList({
            conversations: (response.items ?? []).map(mapServerItem),
            pagination: mapPagination(response, page, pageSize),
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : '获取会话列表失败';
        dispatch(setListError(message));
        dispatch(setLoadingList(false));
      }
    },
    [dispatch, isAuthenticated]
  );

  // in-flight 锁：同时只允许一个 metadata refresh 请求
  const metadataRefreshInFlightRef = useRef(false);

  const refreshLoadedMetadata = useCallback(async () => {
    if (!isAuthenticated) return;
    if (metadataRefreshInFlightRef.current) return;
    if (listIds.length === 0) return;

    metadataRefreshInFlightRef.current = true;
    try {
      const items = await getConversationsMetadata(listIds);
      dispatch(
        updateConversationsMetadata(
          items.map((item) => ({
            id: item.id,
            title: item.title || '新对话',
            model_id: item.model_id || 'unknown',
            updatedAt: parseTimestamp(item.updated_at),
          }))
        )
      );
    } catch (error) {
      // 失败 silent ignore：标题刷新不是关键路径，不能因此破坏列表
      console.warn('刷新对话元数据失败', error);
    } finally {
      metadataRefreshInFlightRef.current = false;
    }
  }, [dispatch, isAuthenticated, listIds]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchList(1, 10);
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated || conversationListVersion === 0) return;
    void refreshLoadedMetadata();
  }, [conversationListVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // 当前进行中的搜索请求 controller，用于取消旧请求
  const searchAbortRef = useRef<AbortController | null>(null);

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

      dispatch(setSearchLoading(true));
      try {
        const items = await searchConversationsApi(trimmed, 50, controller.signal);
        if (controller.signal.aborted) return;
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
        if (error?.name === 'AbortError') return;
        const message = error instanceof Error ? error.message : '搜索失败';
        dispatch(setSearchError(message));
      }
    },
    [dispatch]
  );

  const loadMore = useCallback(async () => {
    if (!pagination?.hasNext || isLoadingMore || !isAuthenticated) return;
    dispatch(setLoadingMore(true));
    try {
      const nextPage = pagination.currentPage + 1;
      const response = await getConversations(nextPage, pagination.pageSize);
      dispatch(
        appendConversationList({
          conversations: (response.items ?? []).map(mapServerItem),
          pagination: mapPagination(response, nextPage, pagination.pageSize),
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载更多会话失败';
      dispatch(setListError(message));
      dispatch(setLoadingMore(false));
    }
  }, [dispatch, isAuthenticated, isLoadingMore, pagination]);

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
