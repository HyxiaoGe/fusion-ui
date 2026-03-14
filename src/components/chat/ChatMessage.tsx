'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileWithPreview, formatFileSize } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { Message, toggleReasoningVisibility, completeThinkingPhase } from '@/redux/slices/chatSlice';
import { avatarOptions } from '@/redux/slices/settingsSlice';
import { Edit2, FileIcon, RefreshCw, Lightbulb, FileText, Image, Film, PenLine, RotateCcw, FileArchive, X, Check, Copy } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import FileCard from './FileCard';
import ReasoningContent from './ReasoningContent';
import ProviderIcon from '../models/ProviderIcon';
import { ImageIcon } from 'lucide-react';
import { chatStore } from '@/lib/db/chatStore';
import SuggestedQuestions from './SuggestedQuestions';
import CodeBlock from './CodeBlock';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  const activeChatId = useAppSelector(state => state.chat.activeChatId);
  
  // 获取流式状态的时间戳
  const streamingStartTime = useAppSelector(state => state.chat.streamingReasoningStartTime);
  const streamingEndTime = useAppSelector(state => state.chat.streamingReasoningEndTime);
  const isStreamingReasoning = useAppSelector(state => state.chat.isStreamingReasoning);

  const { userAvatar, assistantAvatar } = useAppSelector(state => state.settings);
  const { isAuthenticated, user } = useAppSelector(state => state.auth);
  const { toast } = useToast();

  // 获取当前聊天使用的模型信息
  const chats = useAppSelector(state => state.chat.chats);
  const models = useAppSelector(state => state.models.models);

  // 查找消息所属的聊天及其使用的模型
  const chat = chats.find(c => c.id === message.chatId || c.id === activeChatId);
  const model = chat ? models.find(m => m.id === chat.model) : null;
  const providerId = chat?.provider || model?.provider;

  // 获取头像表情
  const getUserEmoji = () => {
    const avatar = avatarOptions.user.find(a => a.id === userAvatar);
    return avatar ? avatar.emoji : '👤';
  };

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
        chatId: activeChatId,
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
    state => isStreaming && isLastMessage ? state.chat.streamingReasoningContent : ''
  );

  const displayReasoning = isStreaming && isLastMessage && streamingReasoningContent
    ? streamingReasoningContent
    : message.reasoning;

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
        'flex w-full gap-3 py-4 px-4 group',
        isLastMessage && 'mb-4',
        isUser ? 'justify-end' : 'justify-start',
        isEditing && 'px-2'
      )}
    >
      {!isUser && (
        <div className="h-8 w-8 mt-1 flex-shrink-0 rounded-full bg-secondary/10 flex items-center justify-center border shadow-sm">
          {providerId ? (
            <ProviderIcon providerId={providerId} size={16} />
          ) : (
            <span className="text-sm">{getAssistantEmoji()}</span>
          )}
        </div>
      )}

      <div className={cn(
        'flex flex-col space-y-1',
        isEditing ? 'w-full max-w-none min-w-[1000px]' : 'max-w-[85%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {isUser ? '用户' : model ? model.name : 'AI助手'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>

        <div>
          <div className={cn(
            'rounded-2xl px-4 py-2.5 shadow-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm',
            isEditing && 'min-w-[1200px] w-full'
          )}>
            {isUser ? (
              isEditing ? (
                // 编辑模式 - 优化版
                <div className="w-full space-y-3 animate-in fade-in-50 duration-200">
                  {/* 编辑提示标签 */}
                  <div className="flex items-center gap-2 text-xs text-primary-foreground/70">
                    <Edit2 className="h-3 w-3" />
                    <span>编辑消息</span>
                  </div>
                  
                  {/* 文本编辑区域 */}
                  <div className="relative w-full rounded-xl overflow-hidden border border-primary-foreground/20 bg-primary-foreground/5 backdrop-blur-sm">
                    <TextareaAutosize
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      minRows={6}
                      maxRows={15}
                      className="w-full min-w-full px-4 py-3 bg-transparent text-primary-foreground text-sm resize-none focus:outline-none border-none placeholder:text-primary-foreground/50"
                      autoFocus
                      placeholder="编辑您的消息..."
                      onKeyDown={handleKeyDown}
                      style={{ width: '100%', minWidth: '100%' }}
                    />
                    
                    {/* 字符计数 */}
                    <div className="absolute bottom-2 right-3 text-xs text-primary-foreground/50">
                      {editContent.length} 字符
                    </div>
                  </div>
                  
                  {/* 操作按钮区域 */}
                  <div className="flex justify-between items-center w-full">
                    <div className="text-xs text-primary-foreground/60">
                      按 Esc 取消，Ctrl+Enter 保存
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        className="h-9 px-4 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20 hover:border-primary-foreground/30"
                      >
                        <X className="h-3 w-3 mr-1" />
                        取消
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={!editContent.trim() || editContent === message.content}
                        className="h-9 px-4 bg-primary-foreground text-primary hover:bg-primary-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        保存
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                // 用户消息显示
                <div className="space-y-2">
                  <div>{message.content || isStreaming}</div>
                  {message.status === 'failed' ? (
                    <div className="flex items-center gap-2 text-xs text-red-100/90">
                      <X className="h-3 w-3" />
                      <span>发送失败，请重新发送</span>
                    </div>
                  ) : null}
                </div>
              )
            ) : (
              // AI助手消息显示
              <div className={cn(
                "prose prose-neutral dark:prose-invert max-w-none overflow-auto",
                isStreaming && "typing"
              )}>

                {displayReasoning && (
                  <ReasoningContent
                    reasoning={displayReasoning}
                    isVisible={message.isReasoningVisible || localReasoningVisible}
                    onToggleVisibility={handleToggleReasoning}
                    isStreaming={isStreamingReasoning && isLastMessage}
                    forceShow={isStreamingReasoning && isLastMessage}
                    startTime={(isLastMessage ? streamingStartTime : message.reasoningStartTime) ?? undefined}
                    endTime={isLastMessage ? streamingEndTime : message.reasoningEndTime}
                    duration={message.duration}
                    className="mt-2"
                  />
                )}

                {message.status === 'failed' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-red-500">
                    <X className="h-3 w-3" />
                    <span>生成失败，请重试</span>
                  </div>
                )}

                {/* 消息内容显示 */}
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    pre: ({ node, children, ...props }) => {
                      // 不渲染pre标签，让code组件自己处理
                      return <>{children}</>;
                    },
                    code: ({ node, className, children, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeContent = String(children).replace(/\n$/, '');
                      
                      // 如果有语言标识且内容包含换行符，则认为是代码块
                      if (match && codeContent.includes('\n')) {
                        return (
                          <CodeBlock 
                            language={match[1]} 
                            value={codeContent}
                            showLineNumbers={true}
                            maxLines={15}
                          />
                        );
                      }
                      
                      // 否则是内联代码
                      return (
                        <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-sm font-mono" {...props}>
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

            {/* 重新生成按钮 */}
            {!isUser && !isStreaming && (
              <div className={cn(
                'transition-opacity duration-150 flex gap-2 mt-2',
                isLastMessage || message.status === 'failed'
                  ? 'opacity-100'
                  : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
              )}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
                  onClick={handleCopyMessage}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {copied ? '已复制!' : '复制消息'}
                </Button>
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

        {/* 用户消息操作 */}
        {isUser && !isEditing && (
          <div className="opacity-100 transition-opacity duration-150 flex gap-2">
            {message.status === 'failed' ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-red-100/80 hover:text-red-50 hover:bg-transparent"
                onClick={() => onRetry && onRetry(message.id)}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                重新发送
              </Button>
            ) : null}
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

        {!isUser && isLastMessage && !isStreaming && onSelectQuestion && (
          <SuggestedQuestions 
            questions={suggestedQuestions || []}
            isLoading={isLoadingQuestions}
            onSelectQuestion={onSelectQuestion}
            onRefresh={onRefreshQuestions}
          />
        )}
      </div>

      {isUser && (
        <div className="h-8 w-8 mt-1 flex-shrink-0">
          {isAuthenticated && user?.avatar ? (
            <Avatar 
              key={`chat-avatar-${isAuthenticated}-${user?.avatar}`}
              className="h-8 w-8"
            >
              <AvatarImage src={user.avatar} alt="用户头像" />
              <AvatarFallback className="text-sm">
                <div className="w-full h-full flex items-center justify-center">
                  <span className="block text-center leading-none">{getUserEmoji()}</span>
                </div>
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border shadow-sm">
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-sm block text-center leading-none">{getUserEmoji()}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 添加全局CSS样式
const styles = `
.typing-indicator {
  display: inline-flex;
  align-items: center;
}

.typing-indicator span {
  height: 4px;
  width: 4px;
  margin: 0 2px;
  background-color: currentColor;
  border-radius: 50%;
  display: inline-block;
  opacity: 0.6;
}

.typing-indicator span:nth-child(1) {
  animation: pulse 1.5s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation: pulse 1.5s infinite ease-in-out 0.4s;
}

.typing-indicator span:nth-child(3) {
  animation: pulse 1.5s infinite ease-in-out 0.8s;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.3);
  }
}
`;

export default ChatMessage;
