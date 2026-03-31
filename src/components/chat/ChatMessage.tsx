'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import type { Message, ContentBlock, SearchSource } from '@/types/conversation';
import { extractTextFromBlocks, extractThinkingFromBlocks, extractSearchBlock } from '@/types/conversation';
import { toggleReasoningVisibility } from '@/redux/slices/conversationSlice';
import { selectStreamContentBlocks } from '@/redux/slices/streamSlice';
import { avatarOptions } from '@/redux/slices/settingsSlice';
import { Edit2, FileIcon, RefreshCw, X, Check, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import FileCard from './FileCard';
import ReasoningContent from './ReasoningContent';
import SearchStatus from './SearchStatus';
import SourcesPanel from './SourcesPanel';
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

  // 从 content blocks 中提取文本（用于编辑）
  const messageText = useMemo(() => extractTextFromBlocks(message.content), [message.content]);

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(messageText);
  const [copied, setCopied] = useState(false);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [localReasoningVisible, setLocalReasoningVisible] = useState(message.isReasoningVisible || false);
  const activeChatId = useAppSelector(state => state.stream.conversationId);

  // 获取流式状态
  const streamingStartTime = useAppSelector(state => state.stream.reasoningStartTime);
  const streamingEndTime = useAppSelector(state => state.stream.reasoningEndTime);
  const isStreamingReasoning = useAppSelector(state => state.stream.isStreamingReasoning);
  const isThinkingPhaseComplete = useAppSelector(state => state.stream.isThinkingPhaseComplete);

  const { assistantAvatar } = useAppSelector(state => state.settings);
  const { toast } = useToast();

  // 获取模型信息
  const chats = useAppSelector(state => state.conversation.byId);
  const models = useAppSelector(state => state.models.models);

  const chat = (message.chatId ? chats[message.chatId] : undefined) || (activeChatId ? chats[activeChatId] : undefined);
  const model = chat ? models.find(m => m.id === chat.model_id) : null;
  const providerId = model?.provider;

  // 流式时从 streamSlice 取 content blocks，历史时从 message.content 取
  const streamBlocks = useAppSelector(state =>
    isStreaming && isLastMessage && state.stream.messageId === message.id
      ? selectStreamContentBlocks(state.stream)
      : null
  );
  const blocksToRender: ContentBlock[] = (isStreaming && isLastMessage && streamBlocks)
    ? streamBlocks
    : message.content;

  // 搜索状态：区分流式 vs 历史
  const isCurrentlyStreaming = isStreaming && isLastMessage && streamBlocks !== null;
  const streamSearchQuery = useAppSelector(state => state.stream.searchQuery);
  const streamSearchSources = useAppSelector(state => state.stream.searchSources);
  const streamIsSearching = useAppSelector(state => state.stream.isSearching);

  const searchSources: SearchSource[] = useMemo(() => {
    if (isCurrentlyStreaming) return streamSearchSources;
    const searchBlock = extractSearchBlock(message.content);
    return searchBlock?.sources ?? [];
  }, [isCurrentlyStreaming, streamSearchSources, message.content]);

  const showSearching = isCurrentlyStreaming && streamIsSearching;
  const searchQuery = isCurrentlyStreaming ? streamSearchQuery : extractSearchBlock(message.content)?.query ?? null;
  // thinking pending 阶段：正在推理但内容为空（第一轮缓冲中），后续可能转为搜索
  const isThinkingPending = isCurrentlyStreaming && isStreamingReasoning && !streamSearchQuery;

  // 从 blocks 提取文本和推理内容
  const displayText = useMemo(() => extractTextFromBlocks(blocksToRender), [blocksToRender]);
  const displayThinking = useMemo(() => extractThinkingFromBlocks(blocksToRender), [blocksToRender]);
  // 仅流式阶段的搜索场景抑制 ReasoningContent（避免 tool_call 推理噪音）
  // 历史消息中的 ThinkingBlock 是第二轮有效推理，正常展示
  const suppressThinking = isCurrentlyStreaming && (showSearching || isThinkingPending);
  const hasThinking = !suppressThinking && displayThinking.length > 0;

  const getAssistantEmoji = () => {
    const avatar = avatarOptions.assistant.find(a => a.id === assistantAvatar);
    return avatar ? avatar.emoji : '🤖';
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp || isNaN(timestamp)) return '';
    try {
      const date = new Date(Number(timestamp));
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit) {
      onEdit(message.id, editContent);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(messageText);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancelEdit();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (editContent.trim() && editContent !== messageText) {
        handleSaveEdit();
      }
    }
  };

  const handleToggleReasoning = () => {
    if (activeChatId) {
      dispatch(toggleReasoningVisibility({
        conversationId: activeChatId,
        messageId: message.id,
        visible: !message.isReasoningVisible
      }));
    } else {
      setLocalReasoningVisible(!localReasoningVisible);
    }
  };

  // 同步到数据库
  useEffect(() => {
    if (message.shouldSyncToDb && (message.chatId || activeChatId)) {
      const messageSnapshot = {
        ...message,
        chatId: message.chatId || activeChatId || undefined,
      };
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

  // 思考完成后自动折叠（延迟 800ms）
  useEffect(() => {
    if (!isStreaming && hasThinking && displayText && message.isReasoningVisible) {
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
    const textToCopy = displayText;
    if (!textToCopy) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

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

  // 渲染文件 blocks（来自 content blocks）
  const fileBlocks = blocksToRender.filter(b => b.type === 'file');

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
        {/* AI 消息头部 */}
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
                <div className="w-full space-y-3 animate-in fade-in-50 duration-200">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Edit2 className="h-3 w-3" />
                    <span>编辑消息</span>
                  </div>
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
              )
            ) : (
              // AI 消息：渲染 content blocks
              <div>
                {/* 推理折叠区 */}
                {!suppressThinking && (hasThinking || (isStreaming && isLastMessage && isStreamingReasoning)) && (
                  <ReasoningContent
                    content={displayThinking}
                    isVisible={message.isReasoningVisible || localReasoningVisible || (isStreaming && isLastMessage)}
                    onToggle={handleToggleReasoning}
                    isStreaming={isStreamingReasoning && isLastMessage && !isThinkingPhaseComplete}
                    startTime={(isLastMessage ? streamingStartTime : undefined) ?? undefined}
                    endTime={isLastMessage ? streamingEndTime : undefined}
                  />
                )}

                {message.status === 'failed' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-red-500">
                    <X className="h-3 w-3" />
                    <span>生成失败，请重试</span>
                  </div>
                )}

                {/* 搜索场景：思考中 → 搜索中过渡动画 */}
                {isThinkingPending && (
                  <SearchStatus isThinking />
                )}
                {showSearching && searchQuery && (
                  <SearchStatus query={searchQuery} />
                )}

                {/* 搜索结果：来源卡片 */}
                {!showSearching && searchSources.length > 0 && (
                  <SourcesPanel sources={searchSources} />
                )}

                <MarkdownRenderer
                  content={displayText || ''}
                  className="prose-headings:border-0 prose-hr:border-border/30"
                  sources={searchSources}
                />

                {isStreaming && isLastMessage && (
                  <span className="animate-pulse">▌</span>
                )}
              </div>
            )}

            {/* AI 消息操作栏 */}
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

          {/* 用户消息的文件 blocks */}
          {isUser && fileBlocks.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-2">
                {fileBlocks.map((block) => {
                  if (block.type !== 'file') return null;
                  return (
                    <div key={block.id} className="flex items-center space-x-2 rounded-md border border-border p-2 bg-background shadow-sm">
                      <div className="shrink-0">
                        <div className="w-10 h-10 flex items-center justify-center bg-muted/20 rounded-md border">
                          {block.mime_type.startsWith('image/') ? (
                            <ImageIcon className="h-8 w-8 text-blue-500" />
                          ) : block.mime_type.includes('pdf') ? (
                            <FileIcon className="h-8 w-8 text-red-500" />
                          ) : (
                            <FileIcon className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate max-w-[180px]">{block.filename}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI 消息的文件显示（旧模式：传入的 files prop） */}
          {!isUser && files && files.length > 0 && (
            <div className="mt-2">
              <div className="flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <FileCard
                    key={`${file.name}-${index}`}
                    chatId={message.id}
                    file={file}
                    onRemove={() => {}}
                    readOnly={true}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 用户消息操作 */}
        {isUser && !isEditing && (
          <div className="flex items-center gap-0.5 h-6 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto">
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
              {onRetry && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => onRetry(message.id)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom"><p>重新发送</p></TooltipContent>
                </Tooltip>
              )}
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
