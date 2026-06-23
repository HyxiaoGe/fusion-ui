import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SquarePen } from "lucide-react";

interface ChatSidebarHeaderProps {
  onNewChat: () => void;
  isNewChatActive?: boolean;
}

const ChatSidebarHeader: React.FC<ChatSidebarHeaderProps> = ({ onNewChat, isNewChatActive = false }) => {
  return (
    <div className="flex items-center justify-between px-3 py-3">
      <span className="text-sm font-semibold text-foreground px-1">Fusion AI</span>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 transition-colors",
          isNewChatActive && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
        )}
        onClick={onNewChat}
        aria-pressed={isNewChatActive}
        title="新对话"
      >
        <SquarePen className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default ChatSidebarHeader;
