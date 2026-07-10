import React from "react";
import {
  Loader2,
  MessageSquareIcon,
  MoreVerticalIcon,
  PencilIcon,
  RefreshCwIcon,
  TrashIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConversationListItem } from "@/hooks/useConversationList";

interface ChatItemProps {
  chat: ConversationListItem;
  isActive: boolean;
  isStreaming?: boolean;
  modelNameById: Map<string, string>;
  onSelectChat: (chatId: string) => void;
  onPrefetchChat?: (chatId: string) => void;
  onStartEditing: (e: React.MouseEvent, chatId: string, currentTitle: string) => void;
  onDeleteChat: (e: React.MouseEvent, chatId: string) => void;
  onGenerateTitle: (e: React.MouseEvent, chatId: string) => void;
  formatDate: (timestamp: number) => string;
  searchQuery?: string;
}

const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query) return <span>{text}</span>;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, index)}
      <mark className="bg-yellow-200/60 dark:bg-yellow-500/30 rounded-sm px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </span>
  );
};

const PREFETCH_INTENT_DELAY_MS = 150;

const ChatItem: React.FC<ChatItemProps> = ({
  chat,
  isActive,
  isStreaming = false,
  modelNameById,
  onSelectChat,
  onPrefetchChat,
  onStartEditing,
  onDeleteChat,
  onGenerateTitle,
  formatDate,
  searchQuery,
}) => {
  const modelName = chat.model_id ? modelNameById.get(chat.model_id) : undefined;
  const prefetchIntentTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingPrefetch = React.useCallback(() => {
    if (prefetchIntentTimerRef.current) {
      clearTimeout(prefetchIntentTimerRef.current);
      prefetchIntentTimerRef.current = null;
    }
  }, []);
  const prefetchImmediately = React.useCallback(() => {
    cancelPendingPrefetch();
    onPrefetchChat?.(chat.id);
  }, [cancelPendingPrefetch, chat.id, onPrefetchChat]);
  const schedulePrefetch = React.useCallback(() => {
    if (!onPrefetchChat || prefetchIntentTimerRef.current) {
      return;
    }
    prefetchIntentTimerRef.current = setTimeout(() => {
      prefetchIntentTimerRef.current = null;
      onPrefetchChat(chat.id);
    }, PREFETCH_INTENT_DELAY_MS);
  }, [chat.id, onPrefetchChat]);

  React.useEffect(() => cancelPendingPrefetch, [cancelPendingPrefetch]);

  return (
    <div
      data-conversation-id={chat.id}
      tabIndex={0}
      className={`flex items-center group rounded-lg p-3 text-sm cursor-pointer transition-all duration-200 ${
        isActive
          ? "relative pl-4 bg-muted/50 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary"
          : "hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
      }`}
      onPointerEnter={(event) => {
        if (!event.pointerType || event.pointerType === "mouse" || event.pointerType === "pen") {
          schedulePrefetch();
        }
      }}
      onPointerLeave={cancelPendingPrefetch}
      onPointerDown={prefetchImmediately}
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          schedulePrefetch();
        }
      }}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          cancelPendingPrefetch();
        }
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
          return;
        }
        event.preventDefault();
        prefetchImmediately();
        onSelectChat(chat.id);
      }}
      onClick={() => onSelectChat(chat.id)}
    >
      <div className="flex-1 min-w-0 relative">
        <div className="flex items-center gap-2">
          <MessageSquareIcon size={16} className={`shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          <div className="truncate flex-1 pr-1">
            <div className={`font-medium truncate ${isActive ? "text-primary font-semibold" : ""}`} title={chat.title || "新对话"}>
              {searchQuery ? (
                <HighlightedText text={chat.title || "新对话"} query={searchQuery} />
              ) : (
                chat.title || "新对话"
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {formatDate(chat.updatedAt || chat.createdAt)}
              {modelName && (
                <span className="ml-1">
                  · {modelName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="relative ml-2 h-6 w-6 shrink-0">
        {isStreaming ? (
          <span
            role="status"
            aria-label={`${chat.title || "新对话"} 正在输出`}
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-primary transition-opacity group-hover:opacity-0"
          >
            <Loader2
              size={14}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          </span>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100"
              title="更多操作"
              onPointerDown={(event) => {
                cancelPendingPrefetch();
                event.stopPropagation();
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVerticalIcon size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => onStartEditing(e, chat.id, chat.title)}>
              <PencilIcon size={14} className="mr-2" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => onDeleteChat(e, chat.id)}>
              <TrashIcon size={14} className="mr-2" />
              删除对话
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => onGenerateTitle(e, chat.id)}>
              <RefreshCwIcon size={14} className="mr-2" />
              生成标题
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default React.memo(ChatItem);
