'use client';

import { useMemo } from 'react';

import { useAppSelector } from '@/redux/hooks';
import { selectStreamContentBlocks } from '@/redux/slices/streamSlice';
import type { AgentRunState } from '@/types/agentRun';
import type {
  ContentBlock,
  Message,
  SearchBlock,
  SearchSourceSummary,
  SourceReference,
  UrlBlock,
} from '@/types/conversation';
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
  const searchBlocks = collectSearchBlocks(blocksToRender);
  const evidenceSearchSources = collectSearchSources(searchBlocks);
  const searchSources = collectCitationSearchSources(searchBlocks, evidenceSearchSources);
  const answerEvidence = deriveAnswerEvidence({
    sourceRefs: collectSourceRefs(searchBlocks, activity.urlBlocks),
    searchSources: evidenceSearchSources,
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
    const searchBlocks = collectSearchBlocks(blocksToRender);
    return collectCitationSearchSources(searchBlocks, collectSearchSources(searchBlocks));
  }, [isCurrentlyStreaming, streamSearchSources, blocksToRender]);

  const answerEvidence = useMemo(
    () => {
      const searchBlocks = collectSearchBlocks(blocksToRender);
      return deriveAnswerEvidence({
        sourceRefs: collectSourceRefs(searchBlocks, activity.urlBlocks),
        searchSources: collectSearchSources(searchBlocks),
        urlBlocks: activity.urlBlocks,
      });
    },
    [blocksToRender, activity.urlBlocks],
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

function collectSearchBlocks(contentBlocks: ContentBlock[]): SearchBlock[] {
  return contentBlocks.filter((block): block is SearchBlock => block.type === 'search');
}

function collectSearchSources(searchBlocks: SearchBlock[]): SearchSourceSummary[] {
  return dedupeSearchSources(searchBlocks.flatMap(block => block.sources ?? []));
}

function collectCitationSearchSources(
  searchBlocks: SearchBlock[],
  fallbackSources: SearchSourceSummary[],
): SearchSourceSummary[] {
  const sourceRefs = searchBlocks.flatMap(block => block.source_refs ?? []);
  if (sourceRefs.length === 0) {
    return fallbackSources;
  }

  const faviconFallbacks = new Map(fallbackSources.map(source => [source.url, source.favicon]));
  return dedupeSearchSources(
    sourceRefs
      .filter(ref => ref.kind === 'search' && isUsableSourceRef(ref))
      .map(ref => ({
        title: ref.title,
        url: ref.url,
        favicon: ref.favicon ?? faviconFallbacks.get(ref.url),
      })),
  );
}

function collectSourceRefs(
  searchBlocks: SearchBlock[],
  urlBlocks: UrlBlock[],
): SourceReference[] | undefined {
  const sourceRefs = [
    ...searchBlocks.flatMap(block => block.source_refs ?? []),
    ...urlBlocks.flatMap(block => block.source_refs ?? []),
  ];

  return sourceRefs.length > 0 ? sourceRefs : undefined;
}

function isUsableSourceRef(source: SourceReference): boolean {
  return Boolean(source.url?.trim()) && (source.status == null || source.status === 'success');
}

function dedupeSearchSources(sources: SearchSourceSummary[]): SearchSourceSummary[] {
  const seen = new Set<string>();
  const result: SearchSourceSummary[] = [];

  for (const source of sources) {
    const key = source.url || source.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }

  return result;
}
