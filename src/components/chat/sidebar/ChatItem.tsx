import React from "react";
import {
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
import type { Conversation } from "@/types/conversation";
import type { Model } from "@/redux/slices/modelsSlice";

interface ChatItemProps {
  chat: Conversation;
  activeChatId: string | null;
  models: Model[];
  onSelectChat: (chatId: string) => void;
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

const ChatItem: React.FC<ChatItemProps> = ({
  chat,
  activeChatId,
  models,
  onSelectChat,
  onStartEditing,
  onDeleteChat,
  onGenerateTitle,
  formatDate,
  searchQuery,
}) => {
  const isActive = chat.id === activeChatId;

  return (
    <div
      className={`flex items-center group rounded-lg p-3 text-sm cursor-pointer transition-all duration-200 ${
        isActive
          ? "relative pl-4 bg-muted/50 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-primary"
          : "hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
      }`}
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
              {chat.model && models.find(m => m.id === chat.model) && (
                <span className="ml-1">
                  · {models.find(m => m.id === chat.model)?.name}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="ml-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100"
              title="更多操作"
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

export default ChatItem; 
