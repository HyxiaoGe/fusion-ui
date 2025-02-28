'use client';

import React from 'react';
import { useAppSelector, useAppDispatch } from '@/redux/hooks';
import { Button } from '@/components/ui/button';
import { 
  PlusIcon, 
  TrashIcon, 
  MoreVerticalIcon, 
  MessageSquareIcon 
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { setActiveChat, deleteChat } from '@/redux/slices/chatSlice';

interface ChatSidebarProps {
  onNewChat: () => void;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({ onNewChat }) => {
  const dispatch = useAppDispatch();
  const { chats, activeChatId } = useAppSelector((state) => state.chat);
  const { models } = useAppSelector((state) => state.models);

  // 格式化日期
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  // 选择对话
  const handleSelectChat = (chatId: string) => {
    dispatch(setActiveChat(chatId));
  };

  // 删除对话
  const handleDeleteChat = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    dispatch(deleteChat(chatId));
  };

  return (
    <div className="flex flex-col h-full py-2">
      <div className="px-4 mb-4">
        <Button 
          className="w-full flex items-center gap-2" 
          onClick={onNewChat}
        >
          <PlusIcon size={16} />
          <span>新对话</span>
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2">
        {chats.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            暂无聊天记录
          </div>
        ) : (
          <ul className="space-y-1">
            {chats.map((chat) => {
              const model = models.find(m => m.id === chat.modelId);
              
              return (
                <li key={chat.id}>
                  <div
                    className={`flex items-center justify-between py-2 px-3 rounded-md cursor-pointer hover:bg-accent/50 ${
                      activeChatId === chat.id ? 'bg-accent' : ''
                    }`}
                    onClick={() => handleSelectChat(chat.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MessageSquareIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="font-medium truncate text-sm">{chat.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <span>{model?.name || '未知模型'}</span>
                          <span>•</span>
                          <span>{formatDate(chat.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVerticalIcon className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-destructive" onClick={(e) => handleDeleteChat(e, chat.id)}>
                          <TrashIcon className="h-4 w-4 mr-2" />
                          删除对话
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;