import React from "react";
import { Button } from "@/components/ui/button";
import { SquarePen } from "lucide-react";

interface ChatSidebarHeaderProps {
  onNewChat: () => void;
}

const ChatSidebarHeader: React.FC<ChatSidebarHeaderProps> = ({ onNewChat }) => {
  return (
    <div className="flex items-center justify-between px-3 py-3">
      <span className="text-sm font-semibold text-foreground px-1">Fusion AI</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onNewChat}
        title="新对话"
      >
        <SquarePen className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default ChatSidebarHeader;
