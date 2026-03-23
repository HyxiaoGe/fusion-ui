import React from "react";
import ChatItem from "./ChatItem";
import type { Conversation } from "@/types/conversation";
import type { Model } from "@/redux/slices/modelsSlice";

interface ChatListProps {
  chats: Conversation[];
  sortedAndGroupedChats: { groupLabel: string; groupChats: Conversation[] }[];
  activeChatId: string | null;
  models: Model[];
  isLoadingServerList: boolean;
  isLoadingMoreServer: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: () => void;
  handleSelectChat: (chatId: string) => void;
  handleStartEditing: (e: React.MouseEvent, chatId: string, currentTitle: string) => void;
  handleDeleteChat: (e: React.MouseEvent, chatId: string) => void;
  handleGenerateTitle: (e: React.MouseEvent, chatId: string) => void;
  formatDate: (timestamp: number) => string;
  searchQuery?: string;
}

const ChatList: React.FC<ChatListProps> = ({
  chats,
  sortedAndGroupedChats,
  activeChatId,
  models,
  isLoadingServerList,
  isLoadingMoreServer,
  containerRef,
  handleScroll,
  handleSelectChat,
  handleStartEditing,
  handleDeleteChat,
  handleGenerateTitle,
  formatDate,
  searchQuery,
}) => {
  return (
    <div className="px-2 flex-1 overflow-y-auto" ref={containerRef} onScroll={handleScroll}>
      {chats.length === 0 ? (
        <div className="text-sm text-muted-foreground mt-4 text-center">
          {searchQuery ? `未找到包含 "${searchQuery}" 的对话` : '暂无对话记录'}
        </div>
      ) : searchQuery ? (
        /* 搜索模式：扁平列表，不分组 */
        <div className="space-y-2">
          {chats.map((chat) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              activeChatId={activeChatId}
              models={models}
              onSelectChat={handleSelectChat}
              onStartEditing={handleStartEditing}
              onDeleteChat={handleDeleteChat}
              onGenerateTitle={handleGenerateTitle}
              formatDate={formatDate}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      ) : (
        /* 正常模式：分组列表 */
        <div>
          {sortedAndGroupedChats.map(({ groupLabel, groupChats }) => (
            <div key={groupLabel} className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground px-2 mb-2">{groupLabel}</h3>
              <div className="space-y-2">
                {groupChats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    activeChatId={activeChatId}
                    models={models}
                    onSelectChat={handleSelectChat}
                    onStartEditing={handleStartEditing}
                    onDeleteChat={handleDeleteChat}
                    onGenerateTitle={handleGenerateTitle}
                    formatDate={formatDate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {isLoadingMoreServer && (
        <div className="p-4 text-center text-muted-foreground text-sm">
          加载更多...
        </div>
      )}
      
      {isLoadingServerList && chats.length === 0 && (
        <div className="p-4 text-center text-muted-foreground text-sm">
          加载中...
        </div>
      )}
    </div>
  );
};

export default ChatList; 
