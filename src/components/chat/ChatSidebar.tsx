'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Conversation } from '@/lib/db/db';
import { getAllConversations } from '@/lib/db/db';
import { PlusIcon } from 'lucide-react';

interface ChatSidebarProps {
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  selectedConversationId?: number;
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  onSelectConversation,
  onNewConversation,
  selectedConversationId
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    const loadConversations = async () => {
      const convs = await getAllConversations();
      setConversations(convs);
    };

    loadConversations();
  }, []);

  return (
    <div className="flex flex-col h-full py-4">
      <div className="px-4 mb-4">
        <Button 
          className="w-full flex items-center gap-2" 
          onClick={onNewConversation}
        >
          <PlusIcon size={16} />
          <span>新对话</span>
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
            暂无聊天记录
          </div>
        ) : (
          <ul className="space-y-1 px-2">
            {conversations.map((conv) => (
              <li key={conv.id}>
                <button
                  className={`w-full text-left px-3 py-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-sm ${
                    selectedConversationId === conv.id
                      ? 'bg-slate-200 dark:bg-slate-700'
                      : ''
                  }`}
                  onClick={() => onSelectConversation(conv)}
                >
                  <div className="font-medium truncate">{conv.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {new Date(conv.updatedAt).toLocaleString()}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ChatSidebar;