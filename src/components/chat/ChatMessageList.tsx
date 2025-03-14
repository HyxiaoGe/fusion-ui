'use client';

import { Message } from '@/redux/slices/chatSlice';
import React, { useEffect, useMemo, useRef } from 'react';
import LoadingIndicator from '../ui/loading-indicator';
import ChatMessage from './ChatMessage';

interface ChatMessageListProps {
  messages: Message[];
  loading?: boolean;
  isStreaming?: boolean;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
}

// 定义角色排序优先级
const getRolePriority = (role: string): number => {
  switch (role) {
    case 'user': return 0; // 用户消息最高优先级
    case 'system': return 1; // 系统消息次之
    case 'assistant': return 2; // AI回复最低优先级
    default: return 3;
  }
};

const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, loading = false, isStreaming = false, onRetry, onEdit }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 按时间戳排序消息 - 确保使用完整毫秒精度
  const sortedMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      // 确保转换为数字类型进行比较
      const timestampA = Number(a.timestamp);
      const timestampB = Number(b.timestamp);

      const timestampDiff = timestampA - timestampB;
      
      // 如果时间戳相同（或非常接近，如在同一秒内）
      if (Math.abs(timestampDiff) < 1000) {
        // 根据角色排序：用户消息排在AI回复前面
        return getRolePriority(a.role) - getRolePriority(b.role);
      }
      
      return timestampDiff;
    });
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
          isStreaming={isStreaming && index === sortedMessages.length - 1 && message.role === 'assistant'}
          onRetry={onRetry}
          onEdit={onEdit}
        />
      ))}
      
      {loading && !isStreaming && <LoadingIndicator />}
      
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessageList;