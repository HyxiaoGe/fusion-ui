import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  appendConversationList,
  setConversationList,
  setListError,
  setLoadingList,
  setLoadingMore,
} from '@/redux/slices/conversationSlice';
import { getConversations } from '@/lib/api/chat';
import { parseTimestamp } from '@/lib/utils/parseTimestamp';
import type { Conversation, Pagination } from '@/types/conversation';

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
    byId,
    conversationListVersion,
    isLoadingList,
    isLoadingMore,
    listIds,
    pagination,
  } = useAppSelector((state) => state.conversation);

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

  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchList(1, 10);
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAuthenticated || conversationListVersion === 0) return;
    void fetchList(1, 10);
  }, [conversationListVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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
    conversations: listIds.map((id) => byId[id]).filter(Boolean),
    pagination,
    isLoadingList,
    isLoadingMore,
    loadMore,
  };
}
