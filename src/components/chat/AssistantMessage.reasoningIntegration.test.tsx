import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';

const { dispatchMock, selectorState } = vi.hoisted(() => {
  const currentRun: AgentRunState = {
    runId: 'run-k3',
    messageId: 'assistant-placeholder',
    status: 'running',
    config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300, planMode: 'on' },
    totalSteps: 1,
    totalToolCalls: 1,
    lastSequence: 2,
    steps: [{
      stepId: 'step-1',
      stepNumber: 1,
      status: 'running',
      startedAt: 1,
      contentBlockIds: ['thinking-1'],
      toolCalls: [{
        toolCallId: 'tool-1',
        toolName: 'web_search',
        arguments: { query: '公开资料' },
        status: 'running',
        startedAt: 1,
      }],
    }],
  };

  return {
    dispatchMock: vi.fn(),
    selectorState: {
      stream: {
        conversationId: 'chat-1',
        messageId: 'assistant-placeholder',
        staticBlocks: [],
        textBlocks: {},
        thinkingBlocks: { 'thinking-1': '正在核对公开资料' },
        blockOrder: ['thinking-1'],
        blockTypes: { 'thinking-1': 'thinking' },
        totalTextLength: 0,
        displayedTextLength: 0,
        isStreaming: true,
        isStreamingReasoning: true,
        isThinkingPhaseComplete: false,
        reasoningStartTime: 1,
        reasoningEndTime: undefined,
        searchSources: [],
        lastEntryId: '2-0',
        streamStatus: 'streaming',
        currentRun,
        lastError: null,
        contextUsage: null,
        contextUsageConversationId: null,
        contextUsageMeta: null,
        contextUsageInFlight: null,
        contextUsageInFlightConversationId: null,
        contextUsageInFlightMeta: null,
        pendingContextRequest: null,
      },
    },
  };
});

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: typeof selectorState) => unknown) => selector(selectorState),
}));

vi.mock('../models/ProviderIcon', () => ({ default: () => null }));
vi.mock('./ReasoningContent', () => ({
  default: ({ content }: { content: string }) => (
    <section data-testid="integrated-reasoning">{content}</section>
  ),
}));
vi.mock('./AssistantActivityStatus', () => ({ default: () => null }));
vi.mock('./agent', () => ({ AgentRunTimeline: () => null }));
vi.mock('./AnswerEvidence', () => ({ default: () => null }));
vi.mock('./MarkdownRenderer', () => ({ default: () => null }));
vi.mock('./StructuredToolResults', () => ({ default: () => null }));
vi.mock('./AnswerEvidenceSidebar', () => ({ default: () => null }));
vi.mock('./SuggestedQuestions', () => ({ default: () => null }));
vi.mock('./MessageActions', () => ({ default: () => null }));
vi.mock('./FileCard', () => ({ default: () => null }));
vi.mock('./useMessageCopy', () => ({
  useMessageCopy: () => ({ copied: false, copy: vi.fn() }),
}));

import AssistantMessage from './AssistantMessage';

describe('AssistantMessage K3 思考真实链路', () => {
  it('流式 placeholder 没有 message.model_id 时仍按真实工具状态隐藏 K3 思考', () => {
    render(
      <AssistantMessage
        message={{
          id: 'assistant-placeholder',
          role: 'assistant',
          content: [],
        }}
        isLastMessage
        isStreaming
        agentRun={selectorState.stream.currentRun}
        suggestedQuestions={[]}
        isLoadingQuestions={false}
        activeChatId="chat-1"
        modelId="kimi-k3"
        providerId="moonshot"
        modelName="Kimi K3"
      />,
    );

    expect(screen.queryByTestId('integrated-reasoning')).toBeNull();
  });
});
