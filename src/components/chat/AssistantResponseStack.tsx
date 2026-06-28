'use client';

import { memo } from 'react';
import type { SearchSourceSummary } from '@/types/conversation';
import type { AgentRunState } from '@/types/agentRun';
import ReasoningContent from './ReasoningContent';
import AssistantActivityStatus from './AssistantActivityStatus';
import type { AssistantActivity } from './assistantActivity';
import AnswerEvidence from './AnswerEvidence';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import type { AnswerEvidenceSidebarModel } from './answerEvidenceSidebarModel';
import { AgentRunTimeline } from './agent';
import MarkdownRenderer from './MarkdownRenderer';

interface AssistantResponseStackProps {
  assistantMessageId: string;
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
  answerEvidenceSidebar?: AnswerEvidenceSidebarModel | null;
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
  reasoning,
  activity,
  agentRun,
  onRetry,
  onContinueAgentRun,
  answerEvidence,
  answerEvidenceSidebar,
  onSourceClick,
  onOpenSources,
  markdown,
  showStreamingCursor,
}: AssistantResponseStackProps) {
  const agentRunTimelineProps = agentRun === undefined
    ? { assistantMessageId, onRetry, onContinue: onContinueAgentRun }
    : { assistantMessageId, onRetry, onContinue: onContinueAgentRun, run: agentRun };

  return (
    <div
      data-testid="assistant-response-stack"
      className="w-full min-w-0 [&>*:last-child]:mb-0"
    >
      {reasoning.shouldRender ? (
        <ReasoningContent
          content={reasoning.content}
          isVisible={reasoning.isVisible}
          onToggle={reasoning.onToggle}
          isStreaming={reasoning.isStreaming}
          startTime={reasoning.startTime}
          endTime={reasoning.endTime}
        />
      ) : null}

      <AssistantActivityStatus activity={activity} />

      <AgentRunTimeline {...agentRunTimelineProps} />

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
  );
}

export default memo(AssistantResponseStack);
