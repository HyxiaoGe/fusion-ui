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
import { Chat } from "@/redux/slices/chatSlice";
import { Model } from "@/redux/slices/modelSlice";

interface ChatItemProps {
  chat: Chat;
  activeChatId: string | null;
  models: Model[];
  onSelectChat: (chatId: string) => void;
  onStartEditing: (e: React.MouseEvent, chatId: string, currentTitle: string) => void;
  onDeleteChat: (e: React.MouseEvent, chatId: string) => void;
  onGenerateTitle: (e: React.MouseEvent, chatId: string) => void;
  formatDate: (timestamp: number) => string;
}

const ChatItem: React.FC<ChatItemProps> = ({
  chat,
  activeChatId,
  models,
  onSelectChat,
  onStartEditing,
  onDeleteChat,
  onGenerateTitle,
  formatDate,
}) => {
  const isActive = chat.id === activeChatId;

  return (
    <div
      className={`flex items-center group rounded-lg p-3 text-sm cursor-pointer transition-all duration-200 ${
        isActive
          ? "bg-primary/15 dark:bg-primary/20 shadow-lg border border-primary/20 dark:border-primary/30 pl-4 relative z-10"
          : "hover:bg-muted/50 hover:shadow-sm"
      }`}
      onClick={() => onSelectChat(chat.id)}
    >
      <div className="flex-1 min-w-0 relative">
        <div className="flex items-start gap-2">
          <MessageSquareIcon size={16} className={`shrink-0 mt-0.5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          <div className="truncate flex-1 pr-1">
            <div className={`font-medium truncate ${isActive ? "text-primary font-semibold" : ""}`} title={chat.title}>
              {chat.title || "新对话"}
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">
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
      <div
        className={`ml-2 ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        } transition-opacity duration-200`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
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