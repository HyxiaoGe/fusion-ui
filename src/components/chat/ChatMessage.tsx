'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileWithPreview, formatFileSize } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import type { Message } from '@/types/conversation';
import { toggleReasoningVisibility } from '@/redux/slices/conversationSlice';
import { completeThinkingPhase } from '@/redux/slices/streamSlice';
import { avatarOptions } from '@/redux/slices/settingsSlice';
import { Edit2, FileIcon, RefreshCw, X, Check, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import FileCard from './FileCard';
import ReasoningContent from './ReasoningContent';
import MarkdownRenderer from './MarkdownRenderer';
import ProviderIcon from '../models/ProviderIcon';
import { ImageIcon } from 'lucide-react';
import { chatStore } from '@/lib/db/chatStore';
import SuggestedQuestions from './SuggestedQuestions';
import { useToast } from '@/components/ui/toast';

interface ChatMessageProps {
  message: Message;
  files?: FileWithPreview[];
  isLastMessage?: boolean;
  isStreaming?: boolean;
  onRetry?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  suggestedQuestions?: string[];
  isLoadingQuestions?: boolean;
  onSelectQuestion?: (question: string) => void;
  onRefreshQuestions?: () => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, files, isLastMessage = false, isStreaming = false, onRetry, onEdit, suggestedQuestions = [], isLoadingQuestions = false, onSelectQuestion, onRefreshQuestions }) => {
  const dispatch = useAppDispatch();
  const isUser = message.role === 'user';
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [localReasoningVisible, setLocalReasoningVisible] = useState(message.isReasoningVisible || false);
  const activeChatId = useAppSelector(state => state.stream.conversationId);
  
  // 获取流式状态的时间戳
  const streamingStartTime = useAppSelector(state => state.stream.reasoningStartTime);
  const streamingEndTime = useAppSelector(state => state.stream.reasoningEndTime);
  const isStreamingReasoning = useAppSelector(state => state.stream.isStreamingReasoning);

  const { assistantAvatar } = useAppSelector(state => state.settings);
  const { toast } = useToast();

  // 获取当前聊天使用的模型信息
  const chats = useAppSelector(state => state.conversation.byId);
  const models = useAppSelector(state => state.models.models);

  // 查找消息所属的聊天及其使用的模型
  const chat = (message.chatId ? chats[message.chatId] : undefined) || (activeChatId ? chats[activeChatId] : undefined);
  const model = chat ? models.find(m => m.id === chat.model) : null;
  const providerId = chat?.provider || model?.provider;

  const getAssistantEmoji = () => {
    const avatar = avatarOptions.assistant.find(a => a.id === assistantAvatar);
    return avatar ? avatar.emoji : '🤖';
  };

  const formatTime = (timestamp?: number) => {
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

      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
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

  // 处理键盘快捷键
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (editContent.trim() && editContent !== message.content) {
        handleSaveEdit();
      }
    }
  };

  // 切换推理内容可见性
  const handleToggleReasoning = () => {

    if (activeChatId) {
      dispatch(toggleReasoningVisibility({
        conversationId: activeChatId,
        messageId: message.id,
        visible: !message.isReasoningVisible
      }));
    } else {
      // 如果没有活跃聊天ID，可以直接在本地更新状态
      setLocalReasoningVisible(!localReasoningVisible);
    }
  };

  // 获取流式推理内容
  const streamingReasoningContent = useAppSelector(
    state => isStreaming && isLastMessage ? state.stream.reasoning : ''
  );
  const streamingContent = useAppSelector(
    state => isStreaming && isLastMessage ? state.stream.content : ''
  );

  const displayReasoning = isStreaming && isLastMessage && streamingReasoningContent
    ? streamingReasoningContent
    : message.reasoning;
  const displayContent = isStreaming && isLastMessage ? streamingContent : message.content;

  // 同步思考时间到数据库
  useEffect(() => {
    // 只在shouldSyncToDb为true时同步到数据库
    if (message.shouldSyncToDb && (message.chatId || activeChatId)) {
      // 提取需要更新的字段
      const messageSnapshot = {
        ...message,
        chatId: message.chatId || activeChatId || undefined,
      };
      
      // 异步更新数据库，不阻塞UI
      const syncToDb = async () => {
        try {
          await chatStore.upsertMessage(messageSnapshot);
        } catch (error) {
          console.error('同步到数据库失败:', error);
        }
      };
      
      syncToDb();
    }
  }, [message, activeChatId]);

  // 当推理内容生成完成时，标记思考阶段结束
  useEffect(() => {
    if (message.reasoning && !isStreaming) {
      dispatch(completeThinkingPhase());
    }
  }, [message.reasoning, isStreaming, dispatch]);

  // 计算思考用时
  const reasoningDuration = useMemo(() => {
    if (message.reasoningStartTime && message.reasoningEndTime) {
      return ((message.reasoningEndTime - message.reasoningStartTime) / 1000).toFixed(1);
    }
    return null;
  }, [message.reasoningStartTime, message.reasoningEndTime]);

  // 思考完成后自动折叠（延迟 800ms）
  useEffect(() => {
    if (!isStreaming && message.reasoning && message.content && message.isReasoningVisible) {
      const timer = setTimeout(() => {
        if (activeChatId) {
          dispatch(toggleReasoningVisibility({
            conversationId: activeChatId,
            messageId: message.id,
            visible: false,
          }));
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);

      if (copiedResetTimerRef.current) {
        clearTimeout(copiedResetTimerRef.current);
      }

      copiedResetTimerRef.current = setTimeout(() => {
        setCopied(false);
        copiedResetTimerRef.current = null;
      }, 2000);
    } catch {
      toast({
        message: '复制失败，请重试',
        type: 'error',
      });
    }
  };

  return (
    <div
      className={cn(
        'flex w-full gap-3 py-2 px-4 group',
        isUser ? 'justify-end' : 'justify-start',
        isEditing && 'px-2'
      )}
    >
      <div className={cn(
        'flex flex-col space-y-1',
        isEditing ? 'w-full max-w-2xl' : isUser ? 'max-w-[70%]' : 'max-w-[85%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* AI 消息头部：ProviderIcon + 模型名 + 时间戳 */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-0.5">
            {providerId ? (
              <ProviderIcon providerId={providerId} size={16} />
            ) : (
              <span className="text-sm">{getAssistantEmoji()}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {model ? model.name : 'AI助手'}
            </span>
          </div>
        )}

        <div>
          <div className={cn(
            isUser
              ? 'rounded-2xl px-4 py-2 bg-black/5 dark:bg-white/10 text-foreground'
              : '',
            isEditing && 'w-full'
          )}>
            {isUser ? (
              isEditing ? (
                // 编辑模式 - 优化版
                <div className="w-full space-y-3 animate-in fade-in-50 duration-200">
                  {/* 编辑提示标签 */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Edit2 className="h-3 w-3" />
                    <span>编辑消息</span>
                  </div>

                  {/* 文本编辑区域 */}
                  <div className="relative w-full rounded-xl overflow-hidden border border-border bg-background">
                    <TextareaAutosize
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      minRows={6}
                      maxRows={15}
                      className="w-full min-w-full px-4 py-3 bg-transparent text-foreground text-sm resize-none focus:outline-none border-none placeholder:text-muted-foreground"
                      autoFocus
                      placeholder="编辑您的消息..."
                      onKeyDown={handleKeyDown}
                      style={{ width: '100%', minWidth: '100%' }}
                    />

                    {/* 字符计数 */}
                    <div className="absolute bottom-2 right-3 text-xs text-muted-foreground">
                      {editContent.length} 字符
                    </div>
                  </div>

                  {/* 操作按钮区域 */}
                  <div className="flex justify-between items-center w-full">
                    <div className="text-xs text-muted-foreground">
                      按 Esc 取消，Ctrl+Enter 保存
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        className="h-9 px-4"
                      >
                        <X className="h-3 w-3 mr-1" />
                        取消
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={!editContent.trim() || editContent === message.content}
                        className="h-9 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        保存
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                // 用户消息显示
                <div>
                  <div>{message.content}</div>
                  {message.status === 'failed' ? (
                    <div className="flex items-center gap-2 text-xs text-red-500 mt-1">
                      <X className="h-3 w-3" />
                      <span>发送失败，请重新发送</span>
                    </div>
                  ) : null}
                </div>
              )
            ) : (
              // AI助手消息显示
              <div>
                {displayReasoning && (
                  <ReasoningContent
                    content={displayReasoning}
                    isVisible={message.isReasoningVisible || localReasoningVisible}
                    onToggle={handleToggleReasoning}
                    isStreaming={isStreamingReasoning && isLastMessage}
                    duration={reasoningDuration}
                    startTime={(isLastMessage ? streamingStartTime : message.reasoningStartTime) ?? undefined}
                    endTime={isLastMessage ? streamingEndTime : message.reasoningEndTime}
                  />
                )}

                {message.status === 'failed' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-red-500">
                    <X className="h-3 w-3" />
                    <span>生成失败，请重试</span>
                  </div>
                )}

                <MarkdownRenderer
                  content={displayContent || ''}
                  className="prose-headings:border-0 prose-hr:border-border/30"
                />

                {isStreaming && (
                  <span className="animate-pulse">▌</span>
                )}
              </div>
            )}

            {/* AI 消息操作栏：hover 时显示，固定高度不引起布局抖动 */}
            {!isUser && !isStreaming && (
              <div className="flex items-center gap-1 h-6 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto">
                <span className="text-[10px] text-muted-foreground/50 mr-1">
                  {formatTime(message.timestamp)}
                </span>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleCopyMessage}>
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>{copied ? '已复制' : '复制'}</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => onRetry && onRetry(message.id)}>
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>重新生成</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
          {/* )} */}

          {/* 文件显示 - 放在消息内容下方 */}
          {isUser && message.fileInfo && message.fileInfo.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-2">
                {message.fileInfo.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center space-x-2 rounded-md border border-border p-2 bg-background shadow-sm">
                    <div className="shrink-0">
                      {file.type.startsWith('image/') ? (
                        <div className="w-10 h-10 flex items-center justify-center bg-muted/20 rounded-md border">
                          <ImageIcon className="h-8 w-8 text-blue-500" />
                        </div>
                      ) : file.type.includes('pdf') ? (
                        <div className="w-10 h-10 flex items-center justify-center bg-muted/20 rounded-md border">
                          <FileIcon className="h-8 w-8 text-red-500" />
                        </div>
                      ) : file.type.includes('document') || file.type.includes('word') || file.type.includes('excel') || file.type.includes('text/plain') ? (
                        <div className="w-10 h-10 flex items-center justify-center bg-muted/20 rounded-md border">
                          <FileIcon className="h-8 w-8 text-green-500" />
                        </div>
                      ) : file.type.includes('javascript') || file.type.includes('html') || file.type.includes('css') || /\.(jsx|tsx|py|java|c|cpp|php|rb|go|rs)$/.test(file.name || '') ? (
                        <div className="w-10 h-10 flex items-center justify-center bg-muted/20 rounded-md border">
                          <FileIcon className="h-8 w-8 text-purple-500" />
                        </div>
                      ) : file.type.includes('zip') || file.type.includes('compressed') ? (
                        <div className="w-10 h-10 flex items-center justify-center bg-muted/20 rounded-md border">
                          <FileIcon className="h-8 w-8 text-yellow-500" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 flex items-center justify-center bg-muted/20 rounded-md border">
                          <FileIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate max-w-[180px]">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      {file.type.startsWith('image/') && <p className="text-xs text-blue-500">图片文件</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI助手消息的文件显示 */}
          {!isUser && files && files.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <FileCard
                    key={`${file.name}-${index}`}
                    chatId={message.id}
                    file={file}
                    onRemove={() => { }} // 在消息中不允许删除文件
                    readOnly={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 用户消息操作：hover 时显示，固定高度不引起布局抖动 */}
        {isUser && !isEditing && (
          <div className="flex items-center gap-1 h-6 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto">
            <span className="text-[10px] text-muted-foreground/50 mr-1">
              {formatTime(message.timestamp)}
            </span>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setIsEditing(true)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p>编辑</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {!isUser && isLastMessage && !isStreaming && onSelectQuestion && (
          <SuggestedQuestions 
            questions={suggestedQuestions || []}
            isLoading={isLoadingQuestions}
            onSelectQuestion={onSelectQuestion}
            onRefresh={onRefreshQuestions}
          />
        )}
      </div>

    </div>
  );
};

export default ChatMessage;
