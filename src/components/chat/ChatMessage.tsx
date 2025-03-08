'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { Message } from '@/redux/slices/chatSlice';
import { useAppSelector } from '@/redux/hooks';
import { avatarOptions } from '@/redux/slices/settingsSlice';

interface ChatMessageProps {
  message: Message;
  isLastMessage?: boolean;
  isStreaming?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLastMessage = false, isStreaming = false }) => {
  const isUser = message.role === 'user';
  
  const { userAvatar, assistantAvatar } = useAppSelector(state => state.settings);
  
  // 获取当前选中的头像表情
  const getUserEmoji = () => {
    const avatar = avatarOptions.user.find(a => a.id === userAvatar);
    return avatar ? avatar.emoji : '👤';
  };
  
  const getAssistantEmoji = () => {
    const avatar = avatarOptions.assistant.find(a => a.id === assistantAvatar);
    return avatar ? avatar.emoji : '🤖';
  };

  const formatTime = (timestamp: number) => {
    // 防止无效时间戳
    if (!timestamp || isNaN(timestamp)) {
      console.warn('无效的时间戳:', timestamp);
      return '';
    }
    
    try {
      // 明确使用数值类型创建日期对象
      const date = new Date(Number(timestamp));
      
      // 验证日期是否有效
      if (isNaN(date.getTime())) {
        console.warn('创建了无效的日期对象:', timestamp);
        return '';
      }
      
      // 返回格式化后的时间
      return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'});
    } catch (error) {
      console.error('格式化时间出错:', error);
      return '';
    }
  }

  return (
    <div
      className={cn(
        'flex w-full gap-3 py-4 px-4',
        isLastMessage && 'mb-4',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
    {!isUser && (
      <div className="h-8 w-8 mt-1 flex-shrink-0 rounded-full bg-secondary/10 flex items-center justify-center border shadow-sm">
        <span className="text-sm">{getAssistantEmoji()}</span>
      </div>
    )}
      
      <div className={cn(
        'flex flex-col space-y-1 max-w-[80%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {isUser ? '用户' : 'AI助手'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>
        
        <div className={cn(
          'rounded-2xl px-4 py-2.5 shadow-sm',
          isUser 
            ? 'bg-primary text-primary-foreground rounded-tr-sm' 
            : 'bg-muted rounded-tl-sm'
        )}>
          {isUser ? (
            <div>{message.content}</div>
          ) : (
            <div className={cn(
              "prose prose-neutral dark:prose-invert max-w-none overflow-auto",
              isStreaming && "typing"
            )}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw, rehypeHighlight]}
                components={{
                  pre: ({ node, ...props }) => (
                    <pre className="bg-slate-100 dark:bg-slate-800 rounded-md overflow-auto p-4 my-2" {...props} />
                  ),
                  code: ({ node, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    ) : (
                      <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content || ''}
              </ReactMarkdown>
              {isStreaming && (
                <span className="ml-1 inline-block h-4 w-0.5 bg-current animate-pulse"></span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {isUser && (
        <div className="h-8 w-8 mt-1 flex-shrink-0 rounded-full bg-primary/10 flex items-center justify-center border shadow-sm">
          <span className="text-sm">{getUserEmoji()}</span>
        </div>
      )}
    </div>
  );
};

export default ChatMessage;