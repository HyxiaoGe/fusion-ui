'use client';

import { memo } from 'react';
import type { SearchSourceSummary, StructuredToolResultBlock } from '@/types/conversation';
import type { AgentRunState } from '@/types/agentRun';
import { isKimiK3ReasoningModel } from '@/lib/chat/reasoningVisibility';
import ReasoningContent from './ReasoningContent';
import AssistantActivityStatus from './AssistantActivityStatus';
import type { AssistantActivity } from './assistantActivity';
import AnswerEvidence from './AnswerEvidence';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import type { AnswerEvidenceSidebarModel } from './answerEvidenceSidebarModel';
import { AgentRunTimeline } from './agent';
import type { ExecutionProcessSource } from './agent/executionProcessModel';
import MarkdownRenderer from './MarkdownRenderer';
import StructuredToolResults from './StructuredToolResults';

interface AssistantResponseStackProps {
  assistantMessageId: string;
  modelId?: string | null;
  providerId?: string | null;
  reasoning: {
    shouldRender: boolean;
    content: string;
    isVisible: boolean;
    isStreaming: boolean;
    onToggle: () => void;
    startTime?: number;
    endTime?: number;
  };
  activity: AssistantActivity;
  agentRun?: AgentRunState | null;
  onRetry?: () => void;
  onContinueAgentRun?: (previousRunId?: string) => void;
  answerEvidence: AnswerEvidenceModel | null;
  structuredResults?: StructuredToolResultBlock[];
  structuredResultsLoading?: boolean;
  onStructuredResultFollowUp?: (question: string) => void;
  answerEvidenceSidebar?: AnswerEvidenceSidebarModel | null;
  searchQueries?: string[];
  onSourceClick: (index: number) => void;
  onOpenSources: () => void;
  markdown: {
    content: string;
    sources: SearchSourceSummary[];
    onCitationClick?: (index: number) => void;
  };
  showStreamingCursor: boolean;
}

function AssistantResponseStack({
  assistantMessageId,
  modelId,
  providerId,
  reasoning,
  activity,
  agentRun,
  onRetry,
  onContinueAgentRun,
  answerEvidence,
  structuredResults = [],
  structuredResultsLoading = false,
  onStructuredResultFollowUp,
  answerEvidenceSidebar,
  searchQueries,
  onSourceClick,
  onOpenSources,
  markdown,
  showStreamingCursor,
}: AssistantResponseStackProps) {
  const executionSearchSources = toExecutionSearchSources(answerEvidence);
  const agentRunTimelineProps = agentRun === undefined
    ? {
      assistantMessageId,
      onRetry,
      onContinue: onContinueAgentRun,
      searchSources: executionSearchSources,
      searchQueries,
      onOpenSources,
    }
    : {
      assistantMessageId,
      onRetry,
      onContinue: onContinueAgentRun,
      run: agentRun,
      searchSources: executionSearchSources,
      searchQueries,
      onOpenSources,
    };
  const suppressAgentReasoning = !isKimiK3ReasoningModel({ modelId, providerId }) && Boolean(
    agentRun?.config.planMode === 'on'
    || agentRun?.plan?.source === 'model'
    || agentRun?.config.taskMode === 'deep_research',
  );
  const showReasoning = reasoning.shouldRender && !suppressAgentReasoning;
  const showActivityStatus = activity.kind !== 'waiting' || !showReasoning;

  return (
    <div
      data-testid="assistant-response-stack"
      className="w-full min-w-0 [&>*:last-child]:mb-0"
    >
      <div className="w-full max-w-6xl">
        {showReasoning ? (
          <ReasoningContent
            content={reasoning.content}
            isVisible={reasoning.isVisible}
            onToggle={reasoning.onToggle}
            isStreaming={reasoning.isStreaming}
            startTime={reasoning.startTime}
            endTime={reasoning.endTime}
          />
        ) : null}

        {showActivityStatus ? <AssistantActivityStatus activity={activity} /> : null}

        <AgentRunTimeline {...agentRunTimelineProps} />
      </div>

      <StructuredToolResults
        blocks={structuredResults}
        isLoading={structuredResultsLoading}
        onFollowUp={onStructuredResultFollowUp}
      />

      <div className="w-full max-w-6xl">
        <AnswerEvidence
          evidence={answerEvidence}
          onSourceClick={onSourceClick}
          onOpenSources={onOpenSources}
          hasSidebarContent={Boolean(answerEvidenceSidebar?.isRenderable)}
          sidebarIssueCount={answerEvidenceSidebar?.summary.issueCount ?? 0}
        />

        <MarkdownRenderer
          content={markdown.content}
          className="prose-headings:border-0 prose-hr:border-border/30"
          sources={markdown.sources}
          onCitationClick={markdown.onCitationClick}
        />

        {showStreamingCursor ? (
          <span
            data-testid="streaming-cursor"
            className="animate-pulse motion-reduce:animate-none"
          >
            ▌
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default memo(AssistantResponseStack);

function toExecutionSearchSources(answerEvidence: AnswerEvidenceModel | null): ExecutionProcessSource[] | undefined {
  const sources = answerEvidence?.items
    .filter(item => item.kind === 'search_source')
    .map(item => ({
      id: item.id,
      title: item.title,
      url: item.url,
      domain: item.domain,
      favicon: item.favicon,
    })) ?? [];

  return sources.length > 0 ? sources : undefined;
}
