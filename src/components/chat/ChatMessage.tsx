'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { Message } from '@/redux/slices/chatSlice';
import { User, Bot } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  isLastMessage?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLastMessage = false }) => {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full gap-4 py-4',
        isLastMessage && 'mb-4',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <Avatar className="h-8 w-8 bg-primary/10 text-primary">
          <AvatarFallback><Bot size={16} /></AvatarFallback>
          {/* 如果有AI头像图片可以添加 */}
          {/* <AvatarImage src="/ai-avatar.png" /> */}
        </Avatar>
      )}
      
      <div className={cn(
        'flex flex-col space-y-2 max-w-[80%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        <div className="font-medium text-sm text-muted-foreground">
          {isUser ? '用户' : 'AI助手'}
        </div>
        
        <div className={cn(
          'rounded-lg px-4 py-2',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
        )}>
          {isUser ? (
            <div>{message.content}</div>
          ) : (
            <div className="prose prose-neutral dark:prose-invert max-w-none overflow-auto">
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
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        
        <div className="text-xs text-muted-foreground">
          {new Date(message.timestamp).toLocaleString()}
        </div>
      </div>
      
      {isUser && (
        <Avatar className="h-8 w-8 bg-primary text-primary-foreground">
          <AvatarFallback><User size={16} /></AvatarFallback>
          {/* 如果有用户头像图片可以添加 */}
          {/* <AvatarImage src="/user-avatar.png" /> */}
        </Avatar>
      )}
    </div>
  );
};

export default ChatMessage;