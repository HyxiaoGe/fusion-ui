"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeleteChatDialog from "./sidebar/DeleteChatDialog";
import RenameChatDialog from "./sidebar/RenameChatDialog";
import ChatSidebarHeader from "./sidebar/ChatSidebarHeader";
import ChatList from "./sidebar/ChatList";
import { useConversationList } from "@/hooks/useConversationList";
import { useSidebarActions } from "@/hooks/useSidebarActions";
import { useAppSelector } from "@/redux/hooks";
import type { Conversation } from "@/types/conversation";
import { formatInTimeZone } from 'date-fns-tz';

interface ChatSidebarProps {
  onNewChat: () => void;
  activeChatIdOverride?: string | null;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat, activeChatIdOverride }) => {
  const pathname = usePathname();
  const { conversations, isLoadingList, isLoadingMore, loadMore, pagination } = useConversationList();
  const {
    closeDeleteDialog,
    closeRenameDialog,
    confirmDelete,
    confirmRename,
    deleteTargetId,
    generateTitle,
    openDeleteDialog,
    openRenameDialog,
    renameTargetId,
    renameValue,
    selectConversation,
    setRenameValue,
  } = useSidebarActions();
  const { models } = useAppSelector((state) => state.models);
  const routeConversationId = pathname?.startsWith('/chat/') ? pathname.split('/chat/')[1] : null;
  const activeChatId = activeChatIdOverride === undefined ? routeConversationId : activeChatIdOverride;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);

  const checkScrollbar = useCallback(() => {
    if (!containerRef.current) return;
    const element = containerRef.current;
    const hasScroll = element.scrollHeight > element.clientHeight;
    const canLoadMore = Boolean(pagination?.hasNext) && !isLoadingMore;
    setShowLoadMoreButton(!hasScroll && canLoadMore);
  }, [isLoadingMore, pagination?.hasNext]);

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
  }, [checkScrollbar, conversations.length, pagination]);

  const formatDate = (timestamp: number) => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return formatInTimeZone(new Date(timestamp), timeZone, 'MM/dd/yyyy');
  };

  const getDateGroupLabel = (timestamp: number) => {
    const now = new Date();
    const date = new Date(timestamp);
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const chatDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((nowDate.getTime() - chatDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (diffDays <= 3) return "三天内";
    if (diffDays <= 7) return "一周内";
    if (diffDays <= 30) return "一个月内";
    return "更早";
  };

  const sortedAndGroupedChats = React.useMemo(() => {
    const sortedChats = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    const groups: Record<string, Conversation[]> = {};
    sortedChats.forEach((chat) => {
      const groupLabel = getDateGroupLabel(chat.updatedAt);
      if (!groups[groupLabel]) {
        groups[groupLabel] = [];
      }
      groups[groupLabel].push(chat);
    });
    const groupOrder = ["今天", "昨天", "三天内", "一周内", "一个月内", "更早"];
    return groupOrder
      .map((groupLabel) => ({ groupLabel, groupChats: groups[groupLabel] || [] }))
      .filter((group) => group.groupChats.length > 0);
  }, [conversations]);

  const handleScroll = () => {
    if (!containerRef.current || isLoadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 5) {
      void loadMore();
    }
  };

  return (
    <div className="flex flex-col h-full py-2 relative">
      <ChatSidebarHeader onNewChat={onNewChat} />

      <ChatList
        chats={conversations}
        sortedAndGroupedChats={sortedAndGroupedChats}
        activeChatId={activeChatId}
        models={models}
        isLoadingServerList={isLoadingList}
        isLoadingMoreServer={isLoadingMore}
        containerRef={containerRef}
        handleScroll={handleScroll}
        handleSelectChat={selectConversation}
        handleStartEditing={(e, chatId, currentTitle) => {
          e.stopPropagation();
          openRenameDialog(chatId, currentTitle);
        }}
        handleDeleteChat={(e, chatId) => {
          e.stopPropagation();
          openDeleteDialog(chatId);
        }}
        handleGenerateTitle={(e, chatId) => {
          e.stopPropagation();
          void generateTitle(chatId);
        }}
        formatDate={formatDate}
      />

      {showLoadMoreButton && (
        <div className="absolute bottom-4 left-4 right-4 flex justify-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 to-purple-500/20 opacity-30 animate-pulse blur-sm"></div>
            <Button
              onClick={() => void loadMore()}
              disabled={isLoadingMore}
              className="relative px-6 py-2 rounded-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 dark:from-blue-500 dark:to-purple-600 dark:hover:from-blue-600 dark:hover:to-purple-700 text-primary-foreground font-medium text-sm shadow-lg hover:shadow-xl border-0 backdrop-blur-sm transition-all duration-300 ease-out hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 animate-bounce-subtle before:absolute before:inset-0 before:rounded-full before:bg-gradient-to-r before:from-white/20 before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity before:duration-300 overflow-hidden"
              size="sm"
            >
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              <span className="relative z-10">
                {isLoadingMore ? (
                  <>
                    <RefreshCwIcon size={16} className="mr-2 animate-spin" />
                    加载中...
                  </>
                ) : (
                  <>显示更多</>
                )}
              </span>
            </Button>
          </div>
        </div>
      )}

      <DeleteChatDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
        onConfirm={confirmDelete}
      />

      <RenameChatDialog
        open={Boolean(renameTargetId)}
        onOpenChange={(open) => {
          if (!open) closeRenameDialog();
        }}
        onConfirm={() => void confirmRename(renameValue)}
        title={renameValue}
        onTitleChange={setRenameValue}
      />
    </div>
  );
};

export default ChatSidebar;
