"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Search, X, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatarMenu } from "@/components/layouts/UserAvatarMenu";
import DeleteChatDialog from "./sidebar/DeleteChatDialog";
import RenameChatDialog from "./sidebar/RenameChatDialog";
import ChatSidebarHeader from "./sidebar/ChatSidebarHeader";
import ChatList from "./sidebar/ChatList";
import { useConversationList } from "@/hooks/useConversationList";
import { useSidebarActions } from "@/hooks/useSidebarActions";
import { useAppSelector, useAppDispatch } from "@/redux/hooks";
import { setThemeMode } from "@/redux/slices/themeSlice";
import { useResolvedTheme } from "@/lib/hooks/useResolvedTheme";
import type { ConversationListItem } from "@/hooks/useConversationList";
import { formatInTimeZone } from 'date-fns-tz';

interface ChatSidebarProps {
  onNewChat: () => void;
  activeChatIdOverride?: string | null;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat, activeChatIdOverride }) => {
  const pathname = usePathname();
  const {
    conversations,
    isLoadingList,
    isLoadingMore,
    loadMore,
    pagination,
    searchConversations,
    searchResults,
    isSearching,
    searchError,
  } = useConversationList();
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
  const dispatch = useAppDispatch();
  const themeMode = useAppSelector((state) => state.theme.mode);
  const resolvedTheme = useResolvedTheme(themeMode);
  const isDark = resolvedTheme === 'dark';
  const modelNameById = React.useMemo(() => {
    return new Map(models.map((model) => [model.id, model.name]));
  }, [models]);

  const toggleTheme = useCallback(() => {
    dispatch(setThemeMode(isDark ? 'light' : 'dark'));
  }, [dispatch, isDark]);

  const routeConversationId = pathname?.startsWith('/chat/') ? pathname.split('/chat/')[1] : null;
  const activeChatId = activeChatIdOverride === undefined ? routeConversationId : activeChatIdOverride;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // active 对话 updatedAt：当 metadata refresh 把它推到顶部时（如刚发完消息），
  // 自动滚到顶部让用户看到位置变化
  const activeUpdatedAt = conversations.find((c) => c.id === activeChatId)?.updatedAt ?? null;

  // activeChatId 变化、退出搜索、或 active 被推到新位置时，滚到当前激活对话
  // 不在搜索模式下生效，避免搜索期间乱跳
  useEffect(() => {
    if (!activeChatId) return;
    if (searchQuery.trim()) return;
    if (!containerRef.current) return;
    // 等下一个渲染帧再 scroll，确保 ChatItem 已渲染（updatedAt 变化触发 sortedAndGroupedChats 重排）
    const timer = setTimeout(() => {
      const container = containerRef.current;
      const target = container?.querySelector(
        `[data-conversation-id="${activeChatId}"]`
      ) as HTMLElement | null;
      if (container && target) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const visibilityTolerancePx = 1;
        const isTargetVisible =
          targetRect.top >= containerRect.top - visibilityTolerancePx &&
          targetRect.bottom <= containerRect.bottom + visibilityTolerancePx;
        if (isTargetVisible) return;
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [activeChatId, searchQuery, activeUpdatedAt]);

  // sentinel 进视口时自动触发 loadMore，搜索模式下禁用分页加载
  useEffect(() => {
    if (!sentinelRef.current) return;
    if (!pagination?.hasNext) return;
    if (searchQuery.trim()) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingMore) {
          void loadMore();
        }
      },
      { rootMargin: '100px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [pagination?.hasNext, isLoadingMore, loadMore, searchQuery]);

  const formatDate = useCallback((timestamp: number) => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return formatInTimeZone(new Date(timestamp), timeZone, 'MM/dd/yyyy');
  }, []);

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
    const groups: Record<string, ConversationListItem[]> = {};
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

  // 搜索框 debounce 调后端 API；空 query 立即清空
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
      if (!value.trim()) {
        void searchConversations('');
        return;
      }
      searchDebounceRef.current = setTimeout(() => {
        void searchConversations(value);
      }, 300);
    },
    [searchConversations]
  );

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  const isSearchMode = searchQuery.trim().length > 0;
  const displayChats = isSearchMode ? (searchResults ?? []) : conversations;
  const handleStartEditing = useCallback((e: React.MouseEvent, chatId: string, currentTitle: string) => {
    e.stopPropagation();
    openRenameDialog(chatId, currentTitle);
  }, [openRenameDialog]);

  const handleDeleteChat = useCallback((e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    openDeleteDialog(chatId);
  }, [openDeleteDialog]);

  const handleGenerateTitle = useCallback((e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    void generateTitle(chatId);
  }, [generateTitle]);

  return (
    <div className="flex flex-col h-full py-2">
      <ChatSidebarHeader onNewChat={onNewChat} />

      {/* 搜索框 */}
      <div className="px-3 pb-2">
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
          isSearchFocused
            ? "bg-background border border-input ring-1 ring-ring"
            : "bg-muted/30 border border-border/70 dark:border-border hover:border-border hover:bg-muted/60 cursor-text"
        )}>
          <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="搜索对话..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                handleSearchChange('');
                searchInputRef.current?.blur();
              }
            }}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* 搜索状态提示行 */}
      {isSearchMode && isSearching && (
        <div className="px-4 py-1 text-xs text-muted-foreground">搜索中...</div>
      )}
      {isSearchMode && searchError && (
        <div className="px-4 py-1 text-xs text-danger">搜索失败：{searchError}</div>
      )}

      <ChatList
        chats={displayChats}
        sortedAndGroupedChats={sortedAndGroupedChats}
        activeChatId={activeChatId}
        modelNameById={modelNameById}
        isLoadingServerList={isLoadingList}
        isLoadingMoreServer={isLoadingMore}
        containerRef={containerRef}
        handleSelectChat={selectConversation}
        searchQuery={searchQuery.trim() || undefined}
        sentinelRef={sentinelRef}
        handleStartEditing={handleStartEditing}
        handleDeleteChat={handleDeleteChat}
        handleGenerateTitle={handleGenerateTitle}
        formatDate={formatDate}
      />

      {/* 底部用户区（固定不随列表滚动） */}
      <div className="flex items-center justify-between gap-2 mt-auto border-t pt-2 px-2 pb-3">
        <UserAvatarMenu />
        <button
          type="button"
          onClick={toggleTheme}
          className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast"
          aria-label={isDark ? '切换到亮色模式' : '切换到暗色模式'}
          title={isDark ? '切换到亮色模式' : '切换到暗色模式'}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
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
