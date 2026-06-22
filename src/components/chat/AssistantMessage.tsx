'use client';

import React, { useEffect, useState } from 'react';
import { Bot } from 'lucide-react';

import type { FileWithPreview } from '@/lib/utils/fileHelpers';
import { useAppDispatch } from '@/redux/hooks';
import { toggleReasoningVisibility } from '@/redux/slices/conversationSlice';
import type { Message } from '@/types/conversation';

import ProviderIcon from '../models/ProviderIcon';
import AssistantResponseStack from './AssistantResponseStack';
import FileCard from './FileCard';
import MessageActions from './MessageActions';
import SourcesSidebar from './SourcesSidebar';
import SuggestedQuestions from './SuggestedQuestions';
import { useAssistantMessageViewModel } from './useAssistantMessageViewModel';
import { useMessageCopy } from './useMessageCopy';

interface AssistantMessageProps {
  message: Message;
  files?: FileWithPreview[];
  isLastMessage: boolean;
  isStreaming: boolean;
  onRetry?: (messageId: string) => void;
  suggestedQuestions: string[];
  isLoadingQuestions: boolean;
  onSelectQuestion?: (question: string) => void;
  onRefreshQuestions?: () => void;
  activeChatId: string | null;
  providerId?: string;
  modelName: string;
}

function AssistantMessage({
  message,
  files,
  isLastMessage,
  isStreaming,
  onRetry,
  suggestedQuestions,
  isLoadingQuestions,
  onSelectQuestion,
  onRefreshQuestions,
  activeChatId,
  providerId,
  modelName,
}: AssistantMessageProps) {
  const dispatch = useAppDispatch();
  const [localReasoningVisible, setLocalReasoningVisible] = useState(message.isReasoningVisible || false);
  const [sourcesSidebarOpen, setSourcesSidebarOpen] = useState(false);
  const [citationHighlight, setCitationHighlight] = useState<{ index: number; tick: number }>({ index: -1, tick: 0 });

  const {
    activity,
    searchSources,
    answerEvidence,
    displayText,
    displayThinking,
    suppressThinking,
    hasThinking,
    streamingStartTime,
    streamingEndTime,
    isStreamingReasoning,
    isThinkingPhaseComplete,
  } = useAssistantMessageViewModel({
    message,
    isStreaming,
    isLastMessage,
    isLoadingQuestions,
    suggestedQuestionsCount: suggestedQuestions.length,
  });

  const { copied, copy } = useMessageCopy({ text: displayText });

  const handleCitationClick = (index: number) => {
    setSourcesSidebarOpen(true);
    setCitationHighlight(prev => ({ index, tick: prev.tick + 1 }));
  };

  const handleSourcesClose = () => {
    setSourcesSidebarOpen(false);
    setCitationHighlight({ index: -1, tick: 0 });
  };

  const handleToggleReasoning = () => {
    if (activeChatId) {
      dispatch(toggleReasoningVisibility({
        conversationId: activeChatId,
        messageId: message.id,
        visible: !message.isReasoningVisible,
      }));
    } else {
      setLocalReasoningVisible(!localReasoningVisible);
    }
  };

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
  }, [activeChatId, dispatch, displayText, hasThinking, isStreaming, message.id, message.isReasoningVisible]);

  return (
    <>
      <div className="flex items-center gap-1.5 mb-0.5">
        {providerId ? (
          <ProviderIcon providerId={providerId} size={16} />
        ) : (
          <Bot className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground">
          {modelName}
        </span>
      </div>

      <div className="w-full min-w-0">
        <div className="w-full min-w-0">
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

          {!isStreaming && (
            <MessageActions
              timestamp={message.timestamp}
              copied={copied}
              onCopy={copy}
              onRetry={onRetry ? () => onRetry(message.id) : undefined}
              retryLabel="重新生成"
            />
          )}
        </div>

        {files && files.length > 0 && (
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

      {isLastMessage && !isStreaming && onSelectQuestion && (
        <SuggestedQuestions
          questions={suggestedQuestions}
          isLoading={isLoadingQuestions}
          onSelectQuestion={onSelectQuestion}
          onRefresh={onRefreshQuestions}
        />
      )}

      {searchSources.length > 0 && (
        <SourcesSidebar
          sources={searchSources}
          isOpen={sourcesSidebarOpen}
          onClose={handleSourcesClose}
          highlightIndex={citationHighlight.index}
          highlightTick={citationHighlight.tick}
        />
      )}
    </>
  );
}

export type { AssistantMessageProps };
export default AssistantMessage;
