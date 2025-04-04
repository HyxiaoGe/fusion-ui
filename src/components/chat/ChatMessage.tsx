'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileWithPreview, formatFileSize } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { Message, toggleReasoningVisibility } from '@/redux/slices/chatSlice';
import { avatarOptions } from '@/redux/slices/settingsSlice';
import { Edit2, FileIcon, RefreshCw, Lightbulb, FileText, Image, Film, PenLine, RotateCcw, FileArchive } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import FileCard from './FileCard';
import ReasoningContent from './ReasoningContent';
import ProviderIcon from '../models/ProviderIcon';
import { ImageIcon } from 'lucide-react';
import { chatStore } from '@/lib/db/chatStore';

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

  const [localReasoningVisible, setLocalReasoningVisible] = useState(message.isReasoningVisible || false);
  const activeChatId = useAppSelector(state => state.chat.activeChatId);

  const { userAvatar, assistantAvatar } = useAppSelector(state => state.settings);

  // 获取当前聊天使用的模型信息
  const chats = useAppSelector(state => state.chat.chats);
  const models = useAppSelector(state => state.models.models);

  // 查找消息所属的聊天及其使用的模型
  const chat = chats.find(c => c.id === message.chatId || c.id === activeChatId);
  const model = chat ? models.find(m => m.id === chat.modelId) : null;
  const providerId = model?.provider;

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

      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
    if (message.shouldSyncToDb) {
      // 提取需要更新的字段
      const updates = {
        content: message.content,
        reasoning: message.reasoning,
        isReasoningVisible: message.isReasoningVisible,
        reasoningStartTime: message.reasoningStartTime,
        reasoningEndTime: message.reasoningEndTime
      };
      
      // 异步更新数据库，不阻塞UI
      const syncToDb = async () => {
        try {
          await chatStore.updateMessage(message.id, updates);
          console.log('思考时间已同步到数据库');
        } catch (error) {
          console.error('同步到数据库失败:', error);
        }
      };
      
      syncToDb();
    }
  }, [message.shouldSyncToDb, message.id, message.content, message.reasoning, 
      message.isReasoningVisible, message.reasoningStartTime, message.reasoningEndTime]);

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
          {providerId ? (
            <ProviderIcon providerId={providerId} size={16} />
          ) : (
            <span className="text-sm">{getAssistantEmoji()}</span>
          )}
        </div>
      )}

      <div className={cn(
        'flex flex-col space-y-1 max-w-[80%]',
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
                  {message.content || isStreaming}
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
                    isVisible={message.isReasoningVisible || localReasoningVisible || isStreaming}
                    onToggleVisibility={handleToggleReasoning}
                    className="mb-2"
                    isStreaming={isStreaming && isLastMessage}
                    startTime={message.reasoningStartTime}
                    endTime={message.reasoningEndTime}
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