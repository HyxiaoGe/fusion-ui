"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useAppSelector } from "@/redux/hooks";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "../ui/toast";
import DeleteChatDialog from "./sidebar/DeleteChatDialog";
import RenameChatDialog from "./sidebar/RenameChatDialog";
import ChatSidebarHeader from "./sidebar/ChatSidebarHeader";
import ChatList from "./sidebar/ChatList";
import { useChatListManager } from "@/hooks/useChatListManager";
import { useSidebarChatActions } from "@/hooks/useSidebarChatActions";
import { Chat } from "@/redux/slices/chatSlice";

interface ChatSidebarProps {
  onNewChat: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat }) => {
  const { toast } = useToast();
  
  const {
    chats,
    localChats,
    useServerData,
    isLoadingServerList,
    isLoadingMoreServer,
    serverPagination,
    loadMoreChats,
  } = useChatListManager();

  const {
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isRenameDialogOpen,
    setIsRenameDialogOpen,
    newTitle,
    setNewTitle,
    handleSelectChat,
    handleStartEditing,
    handleDeleteChat,
    confirmDelete,
    handleGenerateTitle,
    handleRename,
  } = useSidebarChatActions({
    localChats,
    chats,
    useServerData,
    serverPagination,
  });

  const { activeChatId } = useAppSelector((state) => state.chat);
  const { models } = useAppSelector((state) => state.models);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);

  const checkScrollbar = useCallback(() => {
    if (containerRef.current) {
      const element = containerRef.current;
      const hasScroll = element.scrollHeight > element.clientHeight;
      
      const canLoadMore = useServerData
        ? Boolean(serverPagination?.has_next) && !isLoadingMoreServer
        : chats.length >= 5;
      
      setShowLoadMoreButton(!hasScroll && canLoadMore);
    }
  }, [serverPagination?.has_next, isLoadingMoreServer, chats.length, useServerData]);

  useEffect(() => {
    checkScrollbar();
    
    const resizeObserver = new ResizeObserver(checkScrollbar);
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [checkScrollbar, chats.length, serverPagination]);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  const getDateGroupLabel = (timestamp: number) => {
    const now = new Date();
    const date = new Date(timestamp);
    
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const chatDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffDays = Math.floor((nowDate.getTime() - chatDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (diffDays <= 3) return "三天内";
    if (diffDays <= 7) return "一周内";
    if (diffDays <= 30) return "一个月内";
    return "更早";
  };

  const sortedAndGroupedChats = React.useMemo(() => {
    const sortedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
    
    const groups: Record<string, Chat[]> = {};
    
    sortedChats.forEach(chat => {
      const groupLabel = getDateGroupLabel(chat.updatedAt);
      if (!groups[groupLabel]) {
        groups[groupLabel] = [];
      }
      groups[groupLabel].push(chat);
    });
    
    return groups;
  }, [chats]);

  const handleScroll = () => {
    if (!containerRef.current || isLoadingMoreServer) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    
    if (scrollTop + clientHeight >= scrollHeight - 5) {
      if(loadMoreChats) loadMoreChats();
    }
  };

  return (
    <div className="flex flex-col h-full py-2 relative">
      <ChatSidebarHeader onNewChat={onNewChat} />

      <ChatList
        chats={chats}
        sortedAndGroupedChats={sortedAndGroupedChats}
        activeChatId={activeChatId}
        models={models}
        isLoadingServerList={isLoadingServerList}
        isLoadingMoreServer={isLoadingMoreServer}
        containerRef={containerRef}
        handleScroll={handleScroll}
        handleSelectChat={handleSelectChat}
        handleStartEditing={handleStartEditing}
        handleDeleteChat={handleDeleteChat}
        handleGenerateTitle={handleGenerateTitle}
        formatDate={formatDate}
      />

      {showLoadMoreButton && (
        <div className="absolute bottom-4 left-4 right-4 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 opacity-30 animate-pulse blur-sm"></div>
            
            <Button 
              onClick={loadMoreChats}
              disabled={isLoadingMoreServer}
              className="
                relative px-6 py-2 rounded-full 
                bg-gradient-to-r from-primary to-primary/80
                hover:from-primary/90 hover:to-primary/70
                dark:from-blue-500 dark:to-purple-600 
                dark:hover:from-blue-600 dark:hover:to-purple-700
                text-primary-foreground font-medium text-sm
                shadow-lg hover:shadow-xl 
                border-0 backdrop-blur-sm 
                transition-all duration-300 ease-out
                hover:scale-105 active:scale-95
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                animate-bounce-subtle
                before:absolute before:inset-0 before:rounded-full 
                before:bg-gradient-to-r before:from-white/20 before:to-transparent 
                before:opacity-0 hover:before:opacity-100 
                before:transition-opacity before:duration-300
                overflow-hidden
              "
              size="sm"
            >
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              
              <span className="relative z-10">
                {isLoadingMoreServer ? (
                  <>
                    <RefreshCwIcon size={16} className="mr-2 animate-spin" />
                    加载中...
                  </>
                ) : (
                  <>
                    显示更多
                  </>
                )}
              </span>
            </Button>
          </div>
        </div>
      )}

      <DeleteChatDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={confirmDelete}
      />

      <RenameChatDialog
        open={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        onConfirm={handleRename}
        title={newTitle}
        onTitleChange={setNewTitle}
      />
    </div>
  );
};

export default ChatSidebar;
