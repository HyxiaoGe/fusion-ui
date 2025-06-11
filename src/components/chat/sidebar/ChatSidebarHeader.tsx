import React from "react";
import { Button } from "@/components/ui/button";

interface ChatSidebarHeaderProps {
  onNewChat: () => void;
}

const ChatSidebarHeader: React.FC<ChatSidebarHeaderProps> = ({ onNewChat }) => {
  return (
    <div className="px-4 mb-5">
      <div className="relative">
        {/* 背景光晕效果 */}
        <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/20 to-blue-500/20 opacity-30 animate-pulse blur-sm"></div>
        
        <Button 
          className="
            relative w-full flex items-center justify-center gap-2 
            bg-gradient-to-r from-primary to-primary/80
            hover:from-primary/90 hover:to-primary/70
            dark:from-green-500 dark:to-blue-600 
            dark:hover:from-green-600 dark:hover:to-blue-700
            text-primary-foreground font-medium
            shadow-lg hover:shadow-xl 
            border-0 backdrop-blur-sm 
            transition-all duration-300 ease-out
            hover:scale-105 active:scale-95
            before:absolute before:inset-0 before:rounded-lg 
            before:bg-gradient-to-r before:from-white/20 before:to-transparent 
            before:opacity-0 hover:before:opacity-100 
            before:transition-opacity before:duration-300
            overflow-hidden
            animate-bounce-subtle
          " 
          onClick={onNewChat}
        >
          {/* 闪光效果 */}
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
          
          <span className="relative z-10">
            新对话
          </span>
        </Button>
      </div>
    </div>
  );
};

export default ChatSidebarHeader; 