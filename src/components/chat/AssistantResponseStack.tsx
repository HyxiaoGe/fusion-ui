'use client';

import type { SearchSourceSummary } from '@/types/conversation';
import ReasoningContent from './ReasoningContent';
import AssistantActivityStatus from './AssistantActivityStatus';
import type { AssistantActivity } from './assistantActivity';
import AnswerEvidence from './AnswerEvidence';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
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
  onRetry?: () => void;
  answerEvidence: AnswerEvidenceModel | null;
  onSourceClick: (index: number) => void;
  onOpenSources: () => void;
  markdown: {
    content: string;
    sources: SearchSourceSummary[];
    onCitationClick?: (index: number) => void;
  };
  showStreamingCursor: boolean;
}

export default function AssistantResponseStack({
  assistantMessageId,
  reasoning,
  activity,
  onRetry,
  answerEvidence,
  onSourceClick,
  onOpenSources,
  markdown,
  showStreamingCursor,
}: AssistantResponseStackProps) {
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

      <AgentRunTimeline
        assistantMessageId={assistantMessageId}
        onRetry={onRetry}
      />

      <AnswerEvidence
        evidence={answerEvidence}
        onSourceClick={onSourceClick}
        onOpenSources={onOpenSources}
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
