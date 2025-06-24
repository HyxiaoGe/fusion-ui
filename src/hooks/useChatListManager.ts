import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  setServerChatList,
  appendServerChatList,
  setLoadingMoreServer,
  setLoadingServerList,
  setServerError,
  clearServerError,
  Chat
} from '@/redux/slices/chatSlice';
import { getConversations } from '@/lib/api/chat';
import { useToast } from '@/components/ui/toast';
import { useChatListRefresh } from '@/hooks/useChatListRefresh';

export const useChatListManager = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { registerRefreshFunction } = useChatListRefresh();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  const {
    chats: localChats,
    serverChatList,
    serverPagination,
    isLoadingServerList,
    isLoadingMoreServer,
    activeChatId,
  } = useAppSelector((state) => state.chat);

  const parseTimestamp = (ts: any): number => {
    if (typeof ts === 'number') return ts;
    if (typeof ts !== 'string' || !ts) return 0;
    
    // If timezone is specified, trust it
    if (ts.endsWith('Z') || /[\+\-]\d{2}:\d{2}$/.test(ts)) {
        const date = new Date(ts);
        return isNaN(date.getTime()) ? 0 : date.getTime();
    }

    // Otherwise, assume it's local time
    const date = new Date(ts.replace('T', ' '));
    return isNaN(date.getTime()) ? 0 : date.getTime();
  };

  const useServerData = serverChatList.length > 0;
  const chats: Chat[] = useServerData
    ? serverChatList.map((chat: any) => ({
        ...chat,
        messages: [],
        model: chat.model,
        createdAt: parseTimestamp(chat.created_at),
        updatedAt: parseTimestamp(chat.updated_at),
      }))
    : localChats;

  const isInitializedRef = useRef(false);
  const lastActiveChatIdRef = useRef<string | null>(null);

  const fetchChatList = useCallback(async (page: number = 1, pageSize: number = 10) => {
    if (!isAuthenticated) return;
    
    try {
      dispatch(setLoadingServerList(true));
      dispatch(clearServerError());
      
      const response = await getConversations(page, pageSize);
      
      const items = response.items || [];
      const chatList = items.map((item: any) => ({
        id: item.id,
        title: item.title || '新对话',
        model: item.model || 'unknown',
        provider: item.provider,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));

      const pagination = {
        current_page: response.page || page,
        page_size: response.page_size || pageSize,
        total_pages: response.total_pages || Math.ceil((response.total || 0) / pageSize),
        total_count: response.total || 0,
        has_next: response.has_next || false,
        has_prev: response.has_prev || false,
      };
      
      dispatch(setServerChatList({ chats: chatList, pagination }));
    } catch (error) {
      console.error('获取会话列表失败:', error);
      dispatch(setServerError(error instanceof Error ? error.message : '获取会话列表失败'));
    } finally {
      dispatch(setLoadingServerList(false));
    }
  }, [dispatch, isAuthenticated]);

  const refreshChatList = useCallback(() => {
    fetchChatList(1, 10);
  }, [fetchChatList]);

  useEffect(() => {
    registerRefreshFunction(refreshChatList);
  }, [registerRefreshFunction, refreshChatList]);

  const loadMoreChats = useCallback(async () => {
    if (useServerData) {
      if (!serverPagination?.has_next || isLoadingMoreServer || !isAuthenticated) {
        return;
      }

      try {
        dispatch(setLoadingMoreServer(true));
        
        const nextPage = serverPagination.current_page + 1;
        const pageSize = serverPagination.page_size;
        
        const response = await getConversations(nextPage, pageSize);
        
        const items = response.items || [];
        const chatList = items.map((item: any) => ({
          id: item.id,
          title: item.title || '新对话',
          model: item.model || 'unknown',
          provider: item.provider,
          created_at: item.created_at,
          updated_at: item.updated_at,
        }));

        const pagination = {
          current_page: response.page || nextPage,
          page_size: response.page_size || pageSize,
          total_pages: response.total_pages || Math.ceil((response.total || 0) / pageSize),
          total_count: response.total || 0,
          has_next: response.has_next || false,
          has_prev: response.has_prev || true,
        };
        
        dispatch(appendServerChatList({ chats: chatList, pagination }));
      } catch (error) {
        console.error('加载更多会话失败:', error);
        dispatch(setServerError(error instanceof Error ? error.message : '加载更多会话失败'));
      } finally {
        dispatch(setLoadingMoreServer(false));
      }
    } else {
      toast({
        message: "这是本地数据，模拟加载更多功能",
        type: "info",
      });
    }
  }, [useServerData, serverPagination, isLoadingMoreServer, dispatch, toast, isAuthenticated]);

  useEffect(() => {
    if (isInitializedRef.current || !isAuthenticated) {
      return;
    }
    isInitializedRef.current = true;
    fetchChatList(1, 10);
  }, [fetchChatList, isAuthenticated]);

  useEffect(() => {
    if (activeChatId && activeChatId !== lastActiveChatIdRef.current) {
      lastActiveChatIdRef.current = activeChatId;
      
      if (useServerData) {
        const chatExists = serverChatList.some(chat => chat.id === activeChatId);
        if (!chatExists) {
          setTimeout(() => {
            refreshChatList();
          }, 500);
        }
      }
    }
  }, [activeChatId, useServerData, serverChatList, refreshChatList]);

  return {
    chats,
    localChats,
    useServerData,
    isLoadingServerList,
    isLoadingMoreServer,
    serverPagination,
    loadMoreChats,
    refreshChatList,
  };
}; 