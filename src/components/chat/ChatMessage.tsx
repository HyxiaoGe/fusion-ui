'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { selectChatModel } from '@/redux/selectors';
import type { Message, ContentBlock, SearchSourceSummary, FileBlock as FileBlockType } from '@/types/conversation';
import { extractTextFromBlocks, extractThinkingFromBlocks } from '@/types/conversation';
import { toggleReasoningVisibility } from '@/redux/slices/conversationSlice';
import { selectStreamContentBlocks } from '@/redux/slices/streamSlice';
import { Bot, Edit2, FileIcon, RefreshCw, X, Check, Copy } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import FileCard from './FileCard';
import AssistantResponseStack from './AssistantResponseStack';
import { deriveAssistantActivity } from './assistantActivity';
import SourcesSidebar from './SourcesSidebar';
import { deriveAnswerEvidence } from './answerEvidenceModel';
import ProviderIcon from '../models/ProviderIcon';
import { ImageIcon } from 'lucide-react';
import { chatStore } from '@/lib/db/chatStore';
import SuggestedQuestions from './SuggestedQuestions';
import ImageViewer from './ImageViewer';
import AuthImage from './AuthImage';
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
  const [sourcesSidebarOpen, setSourcesSidebarOpen] = useState(false);
  const [citationHighlight, setCitationHighlight] = useState<{ index: number; tick: number }>({ index: -1, tick: 0 });

  const handleCitationClick = (index: number) => {
    setSourcesSidebarOpen(true);
    setCitationHighlight(prev => ({ index, tick: prev.tick + 1 }));
  };

  const handleSourcesClose = () => {
    setSourcesSidebarOpen(false);
    setCitationHighlight({ index: -1, tick: 0 });
  };
  const [viewingImage, setViewingImage] = useState<FileBlockType | null>(null);
  const activeChatId = useAppSelector(state => state.stream.conversationId);

  // 获取流式状态
  const streamingStartTime = useAppSelector(state => state.stream.reasoningStartTime);
  const streamingEndTime = useAppSelector(state => state.stream.reasoningEndTime);
  const isStreamingReasoning = useAppSelector(state => state.stream.isStreamingReasoning);
  const isThinkingPhaseComplete = useAppSelector(state => state.stream.isThinkingPhaseComplete);

  const { toast } = useToast();

  // 获取模型信息
  const chatId = message.chatId || activeChatId;
  const model = useAppSelector(state => selectChatModel(state, chatId));
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

  // 状态主线只消费归属当前消息的 run，避免全局 stream run 污染历史消息。
  const currentRun = useAppSelector(state => state.stream.currentRun);
  const streamSearchSources = useAppSelector(state => state.stream.searchSources);
  const ownedRun = currentRun?.messageId === message.id || currentRun?.serverMessageId === message.id
    ? currentRun
    : null;

  const activity = useMemo(
    () => deriveAssistantActivity({
      isStreaming,
      isCurrentlyStreaming,
      contentBlocks: blocksToRender,
      currentRun: ownedRun,
      messageStatus: message.status ?? null,
      isLoadingSuggestedQuestions: isLoadingQuestions,
      suggestedQuestionsCount: suggestedQuestions.length,
    }),
    [
      isStreaming,
      isCurrentlyStreaming,
      blocksToRender,
      ownedRun,
      message.status,
      isLoadingQuestions,
      suggestedQuestions.length,
    ],
  );

  const searchSources: SearchSourceSummary[] = useMemo(() => {
    if (isCurrentlyStreaming) return streamSearchSources;
    return activity.searchBlock?.sources ?? [];
  }, [isCurrentlyStreaming, streamSearchSources, activity.searchBlock]);

  const answerEvidence = useMemo(
    () => deriveAnswerEvidence({
      searchSources,
      urlBlocks: activity.urlBlocks,
    }),
    [searchSources, activity.urlBlocks],
  );

  const displayText = useMemo(() => extractTextFromBlocks(blocksToRender), [blocksToRender]);
  const displayThinking = useMemo(() => extractThinkingFromBlocks(blocksToRender), [blocksToRender]);
  const suppressThinking = isCurrentlyStreaming && (
    activity.kind === 'tool_running' || activity.kind === 'waiting'
  );
  const hasThinking = !suppressThinking && displayThinking.length > 0;


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
        isEditing ? 'w-full max-w-2xl' : isUser ? 'max-w-[75%]' : 'w-full max-w-[85%] min-w-0',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* AI 消息头部 */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-0.5">
            {providerId ? (
              <ProviderIcon providerId={providerId} size={16} />
            ) : (
              <Bot className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {model ? model.name : 'AI助手'}
            </span>
          </div>
        )}

        {/* 用户消息的文件 blocks（图片在上，文字在下） */}
        {isUser && fileBlocks.length > 0 && (
          <div className="mb-1">
            <div className="flex flex-wrap gap-2">
              {fileBlocks.map((block) => {
                if (block.type !== 'file') return null;
                const isImage = block.mime_type.startsWith('image/');
                return isImage ? (
                  <div
                    key={block.id}
                    className="cursor-pointer group/img relative"
                    onClick={() => setViewingImage(block)}
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

        <div className={cn(!isUser && 'w-full min-w-0')}>
          <div className={cn(
            isUser
              ? 'rounded-2xl px-4 py-2.5 bg-primary/10 dark:bg-primary/15 text-foreground'
              : 'w-full min-w-0',
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
              <AssistantResponseStack
                assistantMessageId={message.id}
                reasoning={{
                  shouldRender: !suppressThinking && (hasThinking || (isStreaming && isLastMessage && isStreamingReasoning)),
                  content: displayThinking,
                  isVisible: message.isReasoningVisible || localReasoningVisible || (isStreaming && isLastMessage),
                  onToggle: handleToggleReasoning,
                  isStreaming: isStreamingReasoning && isLastMessage && !isThinkingPhaseComplete,
                  startTime: (isLastMessage ? streamingStartTime : undefined) ?? undefined,
                  endTime: (isLastMessage ? streamingEndTime : undefined) ?? undefined,
                }}
                activity={activity}
                onRetry={onRetry ? () => onRetry(message.id) : undefined}
                answerEvidence={answerEvidence}
                onSourceClick={handleCitationClick}
                onOpenSources={() => setSourcesSidebarOpen(true)}
                markdown={{
                  content: displayText || '',
                  sources: searchSources,
                  onCitationClick: searchSources.length > 0 ? handleCitationClick : undefined,
                }}
                showStreamingCursor={isStreaming && isLastMessage && activity.kind === 'answering'}
              />
            )}

            {/* AI 消息操作栏 */}
            {!isUser && !isStreaming && (
              <div className="flex items-center gap-1 h-8 mt-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150 lg:pointer-events-none lg:group-hover:pointer-events-auto">
                <span className="text-xs text-muted-foreground/70 mr-1">
                  {formatTime(message.timestamp)}
                </span>
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast" onClick={handleCopyMessage}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>{copied ? '已复制' : '复制'}</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast" onClick={() => onRetry && onRetry(message.id)}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p>重新生成</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>


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
          <div className="flex items-center gap-0.5 h-8 mt-0.5 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150 lg:pointer-events-none lg:group-hover:pointer-events-auto">
            <span className="text-xs text-muted-foreground/70 mr-1">
              {formatTime(message.timestamp)}
            </span>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast" onClick={() => setIsEditing(true)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p>编辑</p></TooltipContent>
              </Tooltip>
              {onRetry && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-fast" onClick={() => onRetry(message.id)}>
                      <RefreshCw className="h-4 w-4" />
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

      {/* 参考资料侧边栏 */}
      {searchSources.length > 0 && (
        <SourcesSidebar
          sources={searchSources}
          isOpen={sourcesSidebarOpen}
          onClose={handleSourcesClose}
          highlightIndex={citationHighlight.index}
          highlightTick={citationHighlight.tick}
        />
      )}

      {/* 图片查看器 */}
      <ImageViewer
        fileBlock={viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </div>
  );
};

export default ChatMessage;
