'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { Message } from '@/redux/slices/chatSlice';

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
        isLastMessage && 'mb-4'
      )}
    >
      <Avatar className={cn('mt-1', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        <AvatarFallback>{isUser ? '用' : 'AI'}</AvatarFallback>
        {/* 可以根据需要添加头像图片 */}
        {/* <AvatarImage src={isUser ? '/user-avatar.png' : '/ai-avatar.png'} /> */}
      </Avatar>
      <div className="flex-1 space-y-2">
        <div className="font-medium">{isUser ? '用户' : 'AI助手'}</div>
        <div className="prose prose-neutral dark:prose-invert max-w-none overflow-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeHighlight]}
            className="markdown-content"
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
        <div className="text-xs text-muted-foreground">
          {new Date(message.timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;