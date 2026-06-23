'use client';

import { useMemo } from 'react';

import { useAppSelector } from '@/redux/hooks';
import { selectStreamContentBlocks } from '@/redux/slices/streamSlice';
import type { AgentRunState } from '@/types/agentRun';
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
  currentRun?: AgentRunState | null;
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

export interface StaticAssistantMessageViewModelOptions {
  message: Message;
  isLoadingQuestions: boolean;
  suggestedQuestionsCount: number;
  currentRun?: AgentRunState | null;
}

export function deriveStaticAssistantMessageViewModel({
  message,
  isLoadingQuestions,
  suggestedQuestionsCount,
  currentRun = null,
}: StaticAssistantMessageViewModelOptions): AssistantMessageViewModel {
  const blocksToRender = message.content;
  const ownedRun = currentRun?.messageId === message.id || currentRun?.serverMessageId === message.id
    ? currentRun
    : null;
  const activity = deriveAssistantActivity({
    isStreaming: false,
    isCurrentlyStreaming: false,
    contentBlocks: blocksToRender,
    currentRun: ownedRun,
    messageStatus: message.status ?? null,
    isLoadingSuggestedQuestions: isLoadingQuestions,
    suggestedQuestionsCount,
  });
  const searchSources = activity.searchBlock?.sources ?? [];
  const answerEvidence = deriveAnswerEvidence({
    searchSources,
    urlBlocks: activity.urlBlocks,
  });
  const displayText = extractTextFromBlocks(blocksToRender);
  const displayThinking = extractThinkingFromBlocks(blocksToRender);

  return {
    blocksToRender,
    isCurrentlyStreaming: false,
    activity,
    searchSources,
    answerEvidence,
    displayText,
    displayThinking,
    suppressThinking: false,
    hasThinking: displayThinking.length > 0,
    streamingStartTime: null,
    streamingEndTime: undefined,
    isStreamingReasoning: false,
    isThinkingPhaseComplete: false,
  };
}

export function useAssistantMessageViewModel({
  message,
  isStreaming,
  isLastMessage,
  isLoadingQuestions,
  suggestedQuestionsCount,
  currentRun,
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

  const streamCurrentRun = useAppSelector(state => state.stream.currentRun);
  const streamSearchSources = useAppSelector(state => state.stream.searchSources);
  const runForMessage = currentRun ?? streamCurrentRun;
  const ownedRun = runForMessage?.messageId === message.id || runForMessage?.serverMessageId === message.id
    ? runForMessage
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
