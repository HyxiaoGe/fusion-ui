'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileWithPreview, formatFileSize } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { Message, toggleReasoningVisibility } from '@/redux/slices/chatSlice';
import { avatarOptions } from '@/redux/slices/settingsSlice';
import { Edit2, FileIcon, RefreshCw } from 'lucide-react';
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import FileCard from './FileCard';
import ReasoningContent from './ReasoningContent';

interface ChatMessageProps {
  message: Message;
  files?: FileWithPreview[];
  isLastMessage?: boolean;
  isStreaming?: boolean;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, files, isLastMessage = false, isStreaming = false, onRetry, onEdit }) => {
  const dispatch = useAppDispatch();
  const isUser = message.role === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  
  const { userAvatar, assistantAvatar } = useAppSelector(state => state.settings);
  
  // 获取头像表情
  const getUserEmoji = () => {
    const avatar = avatarOptions.user.find(a => a.id === userAvatar);
    return avatar ? avatar.emoji : '👤';
  };
  
  const getAssistantEmoji = () => {
    const avatar = avatarOptions.assistant.find(a => a.id === assistantAvatar);
    return avatar ? avatar.emoji : '🤖';
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp || isNaN(timestamp)) {
      console.warn('无效的时间戳:', timestamp);
      return '';
    }
    
    try {
      const date = new Date(Number(timestamp));
      
      if (isNaN(date.getTime())) {
        console.warn('创建了无效的日期对象:', timestamp);
        return '';
      }
      
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

  // 切换推理内容可见性
  const handleToggleReasoning = () => {
    if (message.chatId) {
      dispatch(toggleReasoningVisibility({
        chatId: message.chatId,
        messageId: message.id,
        visible: !message.isReasoningVisible
      }));
    }
  };
  
  // 获取流式推理内容
  const streamingReasoningContent = useAppSelector(
    state => isStreaming && isLastMessage ? state.chat.streamingReasoningContent : ''
  );
  
  const displayReasoning = isStreaming && isLastMessage && streamingReasoningContent 
    ? streamingReasoningContent 
    : message.reasoning;

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
              // 编辑模式
              <div className="w-full animate-in fade-in-50 duration-200">
                <div className="relative mb-2 rounded-2xl overflow-hidden">
                  <TextareaAutosize
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    minRows={2}
                    maxRows={8}
                    className="w-full px-4 py-3 bg-primary text-primary-foreground text-sm resize-none focus:outline-none border-none"
                    autoFocus
                    placeholder="编辑您的消息..."
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCancelEdit}
                    className="h-8 px-3"
                  >
                    取消
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveEdit}
                    disabled={!editContent.trim() || editContent === message.content}
                    className="h-8 px-3"
                  >
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              // 用户消息显示
              <div>
                {message.content}
                {/* 文件显示 */}
                {message.fileInfo && message.fileInfo.length > 0 && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-2">
                      {message.fileInfo.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center space-x-2 rounded-md border border-border p-2 bg-card/80">
                          <div className="shrink-0">
                            {file.type.startsWith('image/') ? (
                              <div className="w-10 h-10 relative rounded-md overflow-hidden border">
                                <img src={file.previewUrl} alt={file.name} className="object-cover w-full h-full" />
                              </div>
                            ) : (
                              <FileIcon className="h-8 w-8 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate max-w-[180px]">{file.name}</p>
                            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          ) : (
            // AI助手消息显示
            <div className={cn(
              "prose prose-neutral dark:prose-invert max-w-none overflow-auto",
              isStreaming && "typing"
            )}>
              {/* 推理内容显示 - 现在直接使用reasoning属性，不需要解析内容 */}
              {displayReasoning && (
                <ReasoningContent
                  reasoning={displayReasoning}
                  isVisible={message.isReasoningVisible || isStreaming}
                  onToggleVisibility={handleToggleReasoning}
                  className="mb-2"
                  isStreaming={isStreaming && isLastMessage}
                />
              )}
              
              {/* 消息内容显示 */}
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
              
              {/* 文件显示 */}
              {files && files.length > 0 && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-2">
                    {files.map((file, index) => (
                      <FileCard
                        key={`${file.name}-${index}`}
                        chatId={message.id}
                        file={file}
                        onRemove={() => {}} // 在消息中不允许删除文件
                        readOnly={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 重新生成按钮 */}
          {!isUser && !isStreaming && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
                onClick={() => onRetry && onRetry(message.id)}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                重新生成
              </Button>
            </div>
          )}
        </div>
        
        {/* 编辑按钮 - 仅用户消息显示且非编辑状态 */}
        {isUser && !isEditing && !message.status && (
          <div className="opacity-100 transition-opacity duration-150">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs text-primary-foreground/70 hover:text-primary-foreground hover:bg-transparent"
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