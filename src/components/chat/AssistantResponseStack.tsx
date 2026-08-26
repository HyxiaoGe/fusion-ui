'use client';

import { memo } from 'react';
import type { SearchSourceSummary, StructuredToolResultBlock } from '@/types/conversation';
import type { AgentRunState } from '@/types/agentRun';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import type { TrajectoryBadgeStatus } from '@/lib/trajectory/TrajectoryCellProjection';
import ReasoningContent from './ReasoningContent';
import AssistantActivityStatus from './AssistantActivityStatus';
import type { AssistantActivity } from './assistantActivity';
import AnswerEvidence from './AnswerEvidence';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import type { AnswerEvidenceSidebarModel } from './answerEvidenceSidebarModel';
import MarkdownRenderer from './MarkdownRenderer';
import StructuredToolResults from './StructuredToolResults';
import TrajectoryStatusLine from './trajectory/TrajectoryStatusLine';

interface AssistantResponseStackProps {
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
  trajectoryRunSummary?: TrajectoryRunSummary;
  trajectoryStatus?: TrajectoryBadgeStatus;
  onInspectTrajectory?: () => void;
  answerEvidence: AnswerEvidenceModel | null;
  structuredResults?: StructuredToolResultBlock[];
  structuredResultsLoading?: boolean;
  onStructuredResultFollowUp?: (question: string) => void;
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
  reasoning,
  activity,
  agentRun,
  trajectoryRunSummary,
  trajectoryStatus = 'unknown',
  onInspectTrajectory,
  answerEvidence,
  structuredResults = [],
  structuredResultsLoading = false,
  onStructuredResultFollowUp,
  answerEvidenceSidebar,
  onSourceClick,
  onOpenSources,
  markdown,
  showStreamingCursor,
}: AssistantResponseStackProps) {
  const showReasoning = reasoning.shouldRender;
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

        {agentRun ? (
          <TrajectoryStatusLine
            run={agentRun}
            runSummary={trajectoryRunSummary}
            trajectoryStatus={trajectoryStatus}
            onInspect={onInspectTrajectory}
          />
        ) : null}

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
