"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { usePathname } from "next/navigation";
import { RefreshCwIcon, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatarMenu } from "@/components/layouts/UserAvatarMenu";
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // 搜索过滤
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter(conv =>
      conv.title?.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  // Cmd/Ctrl+K 聚焦搜索框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleScroll = () => {
    if (!containerRef.current || isLoadingMore) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 5) {
      void loadMore();
    }
  };

  return (
    <div className="flex flex-col h-full py-2">
      <ChatSidebarHeader onNewChat={onNewChat} />

      {/* 搜索框 */}
      <div className="px-3 pb-2">
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
          isSearchFocused
            ? "bg-background border border-input ring-1 ring-ring"
            : "bg-muted/50 border border-border hover:border-border hover:bg-muted/80 cursor-text"
        )}>
          <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('');
                searchInputRef.current?.blur();
              }
            }}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ChatList
        chats={searchQuery.trim() ? filteredConversations : conversations}
        sortedAndGroupedChats={sortedAndGroupedChats}
        activeChatId={activeChatId}
        models={models}
        isLoadingServerList={isLoadingList}
        isLoadingMoreServer={isLoadingMore}
        containerRef={containerRef}
        handleScroll={handleScroll}
        handleSelectChat={selectConversation}
        searchQuery={searchQuery.trim() || undefined}
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
        <div className="px-4 py-2 flex justify-center">
          <Button
            onClick={() => void loadMore()}
            disabled={isLoadingMore}
            variant="outline"
            size="sm"
            className="text-xs rounded-full px-4"
          >
            {isLoadingMore ? (
              <>
                <RefreshCwIcon size={14} className="mr-1.5 animate-spin" />
                加载中...
              </>
            ) : (
              '显示更多'
            )}
          </Button>
        </div>
      )}

      {/* 底部用户区（固定不随列表滚动） */}
      <div className="mt-auto border-t pt-2 px-2 pb-3">
        <UserAvatarMenu />
      </div>

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
