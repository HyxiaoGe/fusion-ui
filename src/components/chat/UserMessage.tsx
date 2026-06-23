'use client';

import React, { useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { Check, Edit2, FileIcon, ImageIcon, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ContentBlock, FileBlock as FileBlockType, Message } from '@/types/conversation';

import AuthImage from './AuthImage';
import MessageActions from './MessageActions';

interface UserMessageProps {
  message: Message;
  blocksToRender: ContentBlock[];
  messageText: string;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onViewImage: (block: FileBlockType) => void;
}

const userActionClassName = 'flex items-center gap-0.5 h-8 mt-0.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150 lg:pointer-events-none lg:group-hover:pointer-events-auto';

function UserMessage({
  message,
  blocksToRender,
  messageText,
  onRetry,
  onEdit,
  onViewImage,
}: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(messageText);
  const fileBlocks = blocksToRender.filter((block): block is FileBlockType => block.type === 'file');

  const handleStartEdit = () => {
    setEditContent(messageText);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== messageText) {
      onEdit?.(message.id, editContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(messageText);
    setIsEditing(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleCancelEdit();
    } else if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault();
      if (editContent.trim() && editContent !== messageText) {
        handleSaveEdit();
      }
    }
  };

  return (
    <div className={cn('flex flex-col space-y-1 items-end', isEditing ? 'w-full max-w-2xl' : 'max-w-[75%]')}>
      {fileBlocks.length > 0 && (
        <div className="mb-1">
          <div className="flex flex-wrap gap-2">
            {fileBlocks.map((block) => {
              const isImage = block.mime_type.startsWith('image/');
              return isImage ? (
                <div
                  key={block.id}
                  className="cursor-pointer group/img relative"
                  onClick={() => onViewImage(block)}
                >
                  <AuthImage
                    fileId={block.file_id}
                    src={block.thumbnail_url}
                    alt={block.filename}
                    className="rounded-lg max-w-[240px] max-h-[240px] object-cover
                               border border-border/50 hover:border-primary/50 transition"
                  />
                </div>
              ) : (
                (() => {
                  const ext = (block.filename.split('.').pop() || '').toUpperCase();
                  const labelText = block.mime_type.includes('pdf')
                    ? 'PDF'
                    : (ext && ext.length > 0 && ext.length <= 4 ? ext : 'FILE');
                  return (
                    <div key={block.id} className="flex items-center space-x-2 rounded-md border border-border p-2 bg-background shadow-sm">
                      <div className="shrink-0">
                        <div className="relative w-10 h-10 flex items-center justify-center bg-muted/20 rounded-md border">
                          {isImage ? (
                            <ImageIcon className="h-8 w-8 text-blue-500" />
                          ) : block.mime_type.includes('pdf') ? (
                            <FileIcon className="h-8 w-8 text-red-500" />
                          ) : (
                            <FileIcon className="h-8 w-8 text-muted-foreground" />
                          )}
                          <span className="absolute -bottom-1 -right-1 px-1 py-0 text-[8px] font-bold leading-tight text-primary-foreground bg-primary rounded">
                            {labelText}
                          </span>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate max-w-[180px]">{block.filename}</p>
                      </div>
                    </div>
                  );
                })()
              );
            })}
          </div>
        </div>
      )}

      <div className={cn(
        'rounded-xl border border-border/60 bg-primary/10 px-4 py-2.5 text-foreground shadow-sm shadow-black/5 dark:border-border/50 dark:bg-primary/15 dark:shadow-black/20',
        isEditing && 'w-full',
      )}
        aria-label="用户消息内容"
      >
        {isEditing ? (
          <div className="w-full space-y-3 animate-in fade-in-50 duration-200">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Edit2 className="h-3 w-3" />
              <span>编辑消息</span>
            </div>
            <div className="relative w-full rounded-xl overflow-hidden border border-border bg-background">
              <TextareaAutosize
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                minRows={6}
                maxRows={15}
                className="w-full min-w-full px-4 py-3 bg-transparent text-foreground text-sm resize-none focus:outline-none border-none placeholder:text-muted-foreground"
                autoFocus
                placeholder="编辑您的消息..."
                onKeyDown={handleKeyDown}
                style={{ width: '100%', minWidth: '100%' }}
              />
              <div className="absolute bottom-2 right-3 text-xs text-muted-foreground">
                {editContent.length} 字符
              </div>
            </div>
            <div className="flex justify-between items-center w-full">
              <div className="text-xs text-muted-foreground">
                按 Esc 取消，Ctrl+Enter 保存
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleCancelEdit} className="h-9 px-4">
                  <X className="h-3 w-3 mr-1" />取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={!editContent.trim() || editContent === messageText}
                  className="h-9 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="h-3 w-3 mr-1" />保存
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div>{messageText}</div>
            {message.status === 'failed' ? (
              <div className="flex items-center gap-2 text-xs text-red-500 mt-1">
                <X className="h-3 w-3" />
                <span>发送失败，请重新发送</span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {!isEditing && (
        <MessageActions
          timestamp={message.timestamp}
          onEdit={handleStartEdit}
          onRetry={onRetry ? () => onRetry(message.id) : undefined}
          retryLabel="重新发送"
          className={userActionClassName}
        />
      )}
    </div>
  );
}

export default UserMessage;
