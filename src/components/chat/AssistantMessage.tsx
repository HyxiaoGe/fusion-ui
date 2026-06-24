'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot } from 'lucide-react';

import type { FileWithPreview } from '@/lib/utils/fileHelpers';
import { getMessageNetworkDiagnostics } from '@/lib/api/chatDiagnostics';
import { useAppDispatch } from '@/redux/hooks';
import { toggleReasoningVisibility } from '@/redux/slices/conversationSlice';
import type { AgentRunState } from '@/types/agentRun';
import type { Message } from '@/types/conversation';
import type { NetworkDiagnosticsResponse } from '@/types/networkDiagnostics';

import ProviderIcon from '../models/ProviderIcon';
import AssistantResponseStack from './AssistantResponseStack';
import FileCard from './FileCard';
import MessageActions from './MessageActions';
import AnswerEvidenceSidebar from './AnswerEvidenceSidebar';
import { deriveAnswerEvidenceSidebar } from './answerEvidenceSidebarModel';
import { deriveNetworkDiagnosticsModel } from './networkDiagnosticsModel';
import SuggestedQuestions from './SuggestedQuestions';
import {
  deriveStaticAssistantMessageViewModel,
  useAssistantMessageViewModel,
} from './useAssistantMessageViewModel';
import type { AssistantMessageViewModel } from './useAssistantMessageViewModel';
import { useMessageCopy } from './useMessageCopy';

interface AssistantMessageProps {
  message: Message;
  files?: FileWithPreview[];
  isLastMessage: boolean;
  isStreaming: boolean;
  onRetry?: (messageId: string) => void;
  agentRun?: AgentRunState | null;
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
  agentRun,
  suggestedQuestions,
  isLoadingQuestions,
  onSelectQuestion,
  onRefreshQuestions,
  activeChatId,
  providerId,
  modelName,
}: AssistantMessageProps) {
  const shouldUseStreamState = isStreaming && isLastMessage;

  if (shouldUseStreamState) {
    return (
      <StreamingAssistantMessage
        message={message}
        files={files}
        isLastMessage={isLastMessage}
        isStreaming={isStreaming}
        onRetry={onRetry}
        agentRun={agentRun}
        suggestedQuestions={suggestedQuestions}
        isLoadingQuestions={isLoadingQuestions}
        onSelectQuestion={onSelectQuestion}
        onRefreshQuestions={onRefreshQuestions}
        activeChatId={activeChatId}
        providerId={providerId}
        modelName={modelName}
      />
    );
  }

  return (
    <StaticAssistantMessage
      message={message}
      files={files}
      isLastMessage={isLastMessage}
      isStreaming={isStreaming}
      onRetry={onRetry}
      agentRun={agentRun}
      suggestedQuestions={suggestedQuestions}
      isLoadingQuestions={isLoadingQuestions}
      onSelectQuestion={onSelectQuestion}
      onRefreshQuestions={onRefreshQuestions}
      activeChatId={activeChatId}
      providerId={providerId}
      modelName={modelName}
    />
  );
}

function StaticAssistantMessage(props: AssistantMessageProps) {
  const viewModel = useMemo(
    () => deriveStaticAssistantMessageViewModel({
      message: props.message,
      isLoadingQuestions: props.isLoadingQuestions,
      suggestedQuestionsCount: props.suggestedQuestions.length,
      currentRun: props.agentRun,
    }),
    [
      props.agentRun,
      props.isLoadingQuestions,
      props.message,
      props.suggestedQuestions.length,
    ],
  );

  return <AssistantMessageFrame {...props} viewModel={viewModel} />;
}

function StreamingAssistantMessage(props: AssistantMessageProps) {
  const viewModel = useAssistantMessageViewModel({
    message: props.message,
    isStreaming: props.isStreaming,
    isLastMessage: props.isLastMessage,
    isLoadingQuestions: props.isLoadingQuestions,
    suggestedQuestionsCount: props.suggestedQuestions.length,
    currentRun: props.agentRun,
  });

  return <AssistantMessageFrame {...props} viewModel={viewModel} />;
}

function AssistantMessageFrame({
  message,
  files,
  isLastMessage,
  isStreaming,
  onRetry,
  agentRun,
  suggestedQuestions,
  isLoadingQuestions,
  onSelectQuestion,
  onRefreshQuestions,
  activeChatId,
  providerId,
  modelName,
  viewModel,
}: AssistantMessageProps & { viewModel: AssistantMessageViewModel }) {
  const dispatch = useAppDispatch();
  const [localReasoningVisible, setLocalReasoningVisible] = useState(message.isReasoningVisible || false);
  const [answerEvidenceSidebarOpen, setAnswerEvidenceSidebarOpen] = useState(false);
  const [citationHighlight, setCitationHighlight] = useState<{ index: number; tick: number }>({ index: -1, tick: 0 });
  const [networkDiagnostics, setNetworkDiagnostics] = useState<NetworkDiagnosticsResponse | null>(null);
  const [networkDiagnosticsLoading, setNetworkDiagnosticsLoading] = useState(false);
  const [networkDiagnosticsError, setNetworkDiagnosticsError] = useState<string | null>(null);
  const userToggledReasoningRef = useRef(false);
  const networkDiagnosticsRequestInFlightRef = useRef(false);

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
  } = viewModel;

  const { copied, copy } = useMessageCopy({ text: displayText });

  const answerEvidenceSidebar = useMemo(
    () => deriveAnswerEvidenceSidebar({
      answerEvidence,
      searchBlock: activity.searchBlock,
      urlBlocks: activity.urlBlocks,
    }),
    [activity.searchBlock, activity.urlBlocks, answerEvidence],
  );

  const networkDiagnosticsModel = useMemo(
    () => deriveNetworkDiagnosticsModel(networkDiagnostics),
    [networkDiagnostics],
  );

  const handleCitationClick = useCallback((index: number) => {
    setAnswerEvidenceSidebarOpen(true);
    setCitationHighlight(prev => ({ index, tick: prev.tick + 1 }));
  }, []);

  const handleSourcesClose = useCallback(() => {
    setAnswerEvidenceSidebarOpen(false);
    setCitationHighlight({ index: -1, tick: 0 });
  }, []);

  const handleOpenSources = useCallback(() => {
    setAnswerEvidenceSidebarOpen(true);
  }, []);

  const handleToggleReasoning = useCallback(() => {
    userToggledReasoningRef.current = true;
    if (activeChatId) {
      dispatch(toggleReasoningVisibility({
        conversationId: activeChatId,
        messageId: message.id,
        visible: !message.isReasoningVisible,
      }));
    } else {
      setLocalReasoningVisible(!localReasoningVisible);
    }
  }, [activeChatId, dispatch, localReasoningVisible, message.id, message.isReasoningVisible]);

  const handleRetry = useMemo(
    () => onRetry ? () => onRetry(message.id) : undefined,
    [message.id, onRetry],
  );

  useEffect(() => {
    userToggledReasoningRef.current = false;
  }, [message.id]);

  useEffect(() => {
    setNetworkDiagnostics(null);
    setNetworkDiagnosticsError(null);
    setNetworkDiagnosticsLoading(false);
    networkDiagnosticsRequestInFlightRef.current = false;
  }, [activeChatId, message.id]);

  useEffect(() => {
    if (
      !answerEvidenceSidebarOpen
      || !activeChatId
      || networkDiagnostics
      || networkDiagnosticsError
      || networkDiagnosticsRequestInFlightRef.current
    ) {
      return;
    }

    let cancelled = false;
    networkDiagnosticsRequestInFlightRef.current = true;
    setNetworkDiagnosticsLoading(true);
    setNetworkDiagnosticsError(null);

    getMessageNetworkDiagnostics(activeChatId, message.id)
      .then(data => {
        if (!cancelled) {
          setNetworkDiagnostics(data);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setNetworkDiagnosticsError(error instanceof Error ? error.message : '联网诊断暂不可用');
        }
      })
      .finally(() => {
        networkDiagnosticsRequestInFlightRef.current = false;
        setNetworkDiagnosticsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeChatId,
    answerEvidenceSidebarOpen,
    message.id,
    networkDiagnostics,
    networkDiagnosticsError,
  ]);

  const reasoningProps = useMemo(() => ({
    shouldRender: !suppressThinking && (hasThinking || (isStreaming && isLastMessage && isStreamingReasoning)),
    content: displayThinking,
    isVisible: message.isReasoningVisible || localReasoningVisible || (isStreaming && isLastMessage),
    onToggle: handleToggleReasoning,
    isStreaming: isStreamingReasoning && isLastMessage && !isThinkingPhaseComplete,
    startTime: (isLastMessage ? streamingStartTime : undefined) ?? undefined,
    endTime: (isLastMessage ? streamingEndTime : undefined) ?? undefined,
  }), [
    displayThinking,
    handleToggleReasoning,
    hasThinking,
    isLastMessage,
    isStreaming,
    isStreamingReasoning,
    isThinkingPhaseComplete,
    localReasoningVisible,
    message.isReasoningVisible,
    streamingEndTime,
    streamingStartTime,
    suppressThinking,
  ]);

  const markdownProps = useMemo(() => ({
    content: displayText || '',
    sources: searchSources,
    onCitationClick: searchSources.length > 0 ? handleCitationClick : undefined,
  }), [displayText, handleCitationClick, searchSources]);

  useEffect(() => {
    if (!isStreaming && hasThinking && displayText && message.isReasoningVisible) {
      if (userToggledReasoningRef.current) return;
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
            reasoning={reasoningProps}
            activity={activity}
            agentRun={agentRun}
            onRetry={handleRetry}
            answerEvidence={answerEvidence}
            answerEvidenceSidebar={answerEvidenceSidebar}
            onSourceClick={handleCitationClick}
            onOpenSources={handleOpenSources}
            markdown={markdownProps}
            showStreamingCursor={isStreaming && isLastMessage && activity.kind === 'answering'}
          />

          {!isStreaming && (
            <MessageActions
              timestamp={message.timestamp}
              copied={copied}
              onCopy={copy}
              onRetry={handleRetry}
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

      {answerEvidenceSidebar ? (
        <AnswerEvidenceSidebar
          model={answerEvidenceSidebar}
          diagnostics={networkDiagnosticsModel}
          diagnosticsLoading={networkDiagnosticsLoading}
          diagnosticsError={networkDiagnosticsError}
          isOpen={answerEvidenceSidebarOpen}
          onClose={handleSourcesClose}
          highlightIndex={citationHighlight.index}
          highlightTick={citationHighlight.tick}
        />
      ) : null}
    </>
  );
}

export type { AssistantMessageProps };
export default React.memo(AssistantMessage);
