'use client';

import { useMemo } from 'react';

import { useAppSelector } from '@/redux/hooks';
import { selectStreamContentBlocks } from '@/redux/slices/streamSlice';
import type { ContentBlock, Message, SearchSourceSummary } from '@/types/conversation';
import { extractTextFromBlocks, extractThinkingFromBlocks } from '@/types/conversation';

import { deriveAssistantActivity } from './assistantActivity';
import type { AssistantActivity } from './assistantActivity';
import { deriveAnswerEvidence } from './answerEvidenceModel';
import type { AnswerEvidenceModel } from './answerEvidenceModel';

export interface UseAssistantMessageViewModelOptions {
  message: Message;
  isStreaming: boolean;
  isLastMessage: boolean;
  isLoadingQuestions: boolean;
  suggestedQuestionsCount: number;
}

export interface AssistantMessageViewModel {
  blocksToRender: ContentBlock[];
  isCurrentlyStreaming: boolean;
  activity: AssistantActivity;
  searchSources: SearchSourceSummary[];
  answerEvidence: AnswerEvidenceModel | null;
  displayText: string;
  displayThinking: string;
  suppressThinking: boolean;
  hasThinking: boolean;
  streamingStartTime: number | null;
  streamingEndTime: number | undefined;
  isStreamingReasoning: boolean;
  isThinkingPhaseComplete: boolean;
}

export function useAssistantMessageViewModel({
  message,
  isStreaming,
  isLastMessage,
  isLoadingQuestions,
  suggestedQuestionsCount,
}: UseAssistantMessageViewModelOptions): AssistantMessageViewModel {
  const streamingStartTime = useAppSelector(state => state.stream.reasoningStartTime);
  const streamingEndTime = useAppSelector(state => state.stream.reasoningEndTime);
  const isStreamingReasoning = useAppSelector(state => state.stream.isStreamingReasoning);
  const isThinkingPhaseComplete = useAppSelector(state => state.stream.isThinkingPhaseComplete);

  const streamBlocks = useAppSelector(state =>
    isStreaming && isLastMessage && state.stream.messageId === message.id
      ? selectStreamContentBlocks(state.stream)
      : null
  );
  const blocksToRender: ContentBlock[] = (isStreaming && isLastMessage && streamBlocks)
    ? streamBlocks
    : message.content;
  const isCurrentlyStreaming = isStreaming && isLastMessage && streamBlocks !== null;

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
      suggestedQuestionsCount,
    }),
    [
      isStreaming,
      isCurrentlyStreaming,
      blocksToRender,
      ownedRun,
      message.status,
      isLoadingQuestions,
      suggestedQuestionsCount,
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

  return {
    blocksToRender,
    isCurrentlyStreaming,
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
  };
}
