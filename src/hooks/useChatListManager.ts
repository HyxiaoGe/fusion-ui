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

  const {
    chats: localChats,
    serverChatList,
    serverPagination,
    isLoadingServerList,
    isLoadingMoreServer,
    activeChatId,
  } = useAppSelector((state) => state.chat);

  const useServerData = serverChatList.length > 0;
  const chats: Chat[] = useServerData
    ? serverChatList.map((chat: any) => ({
        ...chat,
        messages: [],
        modelId: chat.model_id,
        createdAt: new Date(String(chat.created_at).replace(' ', 'T') + 'Z').getTime(),
        updatedAt: new Date(String(chat.updated_at).replace(' ', 'T') + 'Z').getTime(),
      }))
    : localChats;

  const isInitializedRef = useRef(false);
  const lastActiveChatIdRef = useRef<string | null>(null);

  const fetchChatList = useCallback(async (page: number = 1, pageSize: number = 10) => {
    try {
      dispatch(setLoadingServerList(true));
      dispatch(clearServerError());
      
      const response = await getConversations(page, pageSize);
      
      const items = response.items || [];
      const chatList = items.map((item: any) => ({
        id: item.id,
        title: item.title || '新对话',
        model_id: item.model || item.provider || 'unknown',
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
  }, [dispatch]);

  const refreshChatList = useCallback(() => {
    fetchChatList(1, 10);
  }, [fetchChatList]);

  useEffect(() => {
    registerRefreshFunction(refreshChatList);
  }, [registerRefreshFunction, refreshChatList]);

  const loadMoreChats = useCallback(async () => {
    if (useServerData) {
      if (!serverPagination?.has_next || isLoadingMoreServer) {
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
          model_id: item.model || item.provider || 'unknown',
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
  }, [useServerData, serverPagination, isLoadingMoreServer, dispatch, toast]);

  useEffect(() => {
    if (isInitializedRef.current) {
      return;
    }
    isInitializedRef.current = true;
    fetchChatList(1, 10);
  }, [fetchChatList]);

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