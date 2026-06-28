'use client';

import { cn } from '@/lib/utils';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import type { Message, FileBlock as FileBlockType } from '@/types/conversation';
import { extractTextFromBlocks } from '@/types/conversation';
import React, { useState, useEffect, useMemo } from 'react';
import { chatStore } from '@/lib/db/chatStore';
import type { AgentRunState } from '@/types/agentRun';
import ImageViewer from './ImageViewer';
import UserMessage from './UserMessage';
import AssistantMessage from './AssistantMessage';

interface ChatMessageProps {
  message: Message;
  files?: FileWithPreview[];
  isLastMessage?: boolean;
  isStreaming?: boolean;
  onRetry?: (messageId: string) => void;
  onContinueAgentRun?: (messageId: string, previousRunId?: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  activeChatId?: string | null;
  providerId?: string;
  modelName?: string;
  agentRun?: AgentRunState | null;
  suggestedQuestions?: string[];
  isLoadingQuestions?: boolean;
  onSelectQuestion?: (question: string) => void;
  onRefreshQuestions?: () => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, files, isLastMessage = false, isStreaming = false, onRetry, onContinueAgentRun, onEdit, activeChatId = null, providerId, modelName = 'AI助手', agentRun = null, suggestedQuestions = [], isLoadingQuestions = false, onSelectQuestion, onRefreshQuestions }) => {
  const isUser = message.role === 'user';

  // 从 content blocks 中提取文本（用于编辑）
  const messageText = useMemo(() => extractTextFromBlocks(message.content), [message.content]);

  const [viewingImage, setViewingImage] = useState<FileBlockType | null>(null);
  const chatId = message.chatId || activeChatId;

  // 同步到数据库
  useEffect(() => {
    if (message.shouldSyncToDb && chatId) {
      const messageSnapshot = {
        ...message,
        chatId,
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
  }, [message, chatId]);

  return (
    <div
      className={cn(
        'flex w-full gap-3 py-2 px-4 group',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div className={cn(
        'flex flex-col space-y-1',
        isUser ? 'w-full' : 'w-full max-w-[85%] min-w-0',
        isUser ? 'items-end' : 'items-start'
      )}>
        {isUser ? (
          <UserMessage
            message={message}
            blocksToRender={message.content}
            messageText={messageText}
            onRetry={onRetry}
            onEdit={onEdit}
            onViewImage={setViewingImage}
          />
        ) : (
          <AssistantMessage
            message={message}
            files={files}
            isLastMessage={isLastMessage}
            isStreaming={isStreaming}
            onRetry={onRetry}
            onContinueAgentRun={onContinueAgentRun}
            agentRun={agentRun}
            suggestedQuestions={suggestedQuestions}
            isLoadingQuestions={isLoadingQuestions}
            onSelectQuestion={onSelectQuestion}
            onRefreshQuestions={onRefreshQuestions}
            activeChatId={activeChatId}
            providerId={providerId}
            modelName={modelName}
          />
        )}
      </div>

      {/* 图片查看器 */}
      <ImageViewer
        fileBlock={viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </div>
  );
};

export default React.memo(ChatMessage);
