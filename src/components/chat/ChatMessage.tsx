'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { Message } from '@/redux/slices/chatSlice';
import { useAppSelector } from '@/redux/hooks';
import { avatarOptions } from '@/redux/slices/settingsSlice';
import { AlertCircle, RefreshCw, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatMessageProps {
  message: Message;
  isLastMessage?: boolean;
  isStreaming?: boolean;
  onRetry?: (messageId: string) => void; // 添加重试回调
  onEdit?: (messageId: string, content: string) => void; // 添加编辑回调
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isLastMessage = false, isStreaming = false, onRetry, onEdit }) => {
  const isUser = message.role === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  
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

  // 处理编辑内容
  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent);
    }
    setIsEditing(false);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditContent(message.content);
    setIsEditing(false);
  };

  return (
    <div
      className={cn(
        'flex w-full gap-3 py-4 px-4 group',
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
            isEditing ? (
              // 编辑模式下显示文本框和保存/取消按钮
              <div className="w-full space-y-3 animate-in fade-in-50 duration-200">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full p-3 border border-primary/20 focus:border-primary/50 rounded-lg bg-background text-foreground min-h-[100px] text-sm resize-none shadow-sm focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                  autoFocus
                  placeholder="编辑您的消息..."
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelEdit}
                    className="rounded-full px-4 hover:bg-muted/80 transition-colors"
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={!editContent.trim()}
                    className="rounded-full px-4 bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
                  >
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              // 非编辑模式下显示普通消息内容
              <div>{message.content}</div>
            )
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
          {/* 显示错误状态和操作按钮 */}
          {message.status === 'failed' && (
                <div className="flex items-center mt-2 text-destructive gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs">发送失败</span>
                  {onRetry && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-7 px-2 ml-2"
                      onClick={() => onRetry(message.id)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      重试
                    </Button>
                  )}
                </div>
              )}
        </div>
        {/* 编辑按钮 - 仅用户消息显示且非编辑状态 */}
        {isUser && !isEditing && !message.status && (
          <div className="flex justify-end">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="h-3 w-3 mr-1" />
              编辑
            </Button>
          </div>
        )}
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