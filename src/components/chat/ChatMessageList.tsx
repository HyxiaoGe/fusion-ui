'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Message } from '@/redux/slices/chatSlice';
import ChatMessage from './ChatMessage';
import LoadingIndicator from '../ui/loading-indicator';

interface ChatMessageListProps {
  messages: Message[];
  loading?: boolean;
}

const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, loading = false }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 按时间戳排序消息
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center p-8">
        <div className="max-w-md space-y-4">
          <h3 className="text-xl font-medium">开始一个新对话</h3>
          <p className="text-muted-foreground">
            输入你的问题，开始与 AI 助手对话...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-4">
      {sortedMessages.map((message, index) => (
        <ChatMessage 
          key={message.id} 
          message={message} 
          isLastMessage={index === sortedMessages.length - 1} 
        />
      ))}
      
      {loading && <LoadingIndicator />}
      
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessageList;