'use client';

import { useState } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import ChatSidebar from '@/components/chat/ChatSidebar';
import { Conversation } from '@/lib/db/db';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db/db';

export default function Home() {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  const handleNewConversation = async () => {
    const newConversation: Conversation = {
      title: '新对话',
      model: 'default',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const id = await db.conversations.add(newConversation);
    setSelectedConversation({ ...newConversation, id });
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
  };

  return (
    <MainLayout
      sidebar={
        <ChatSidebar
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          selectedConversationId={selectedConversation?.id}
        />
      }
    >
      {selectedConversation ? (
        <div className="h-full flex flex-col p-4">
          <div className="mb-4">
            <h2 className="text-xl font-bold">{selectedConversation.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              使用模型: {selectedConversation.model}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto border rounded-lg p-4 mb-4">
            {/* 聊天消息区域 */}
            <div className="text-center text-gray-500 dark:text-gray-400">
              暂无消息，开始聊天吧！
            </div>
          </div>
          <div className="flex gap-2">
            <textarea
              className="flex-1 border rounded-lg p-2 min-h-[60px] resize-none"
              placeholder="输入消息..."
            />
            <Button>发送</Button>
          </div>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">欢迎使用小助手</h2>
            <p className="mb-6 text-gray-600 dark:text-gray-400">
              选择一个现有对话或创建一个新对话开始聊天
            </p>
            <Button onClick={handleNewConversation}>创建新对话</Button>
          </div>
        </div>
      )}
    </MainLayout>
  );
}