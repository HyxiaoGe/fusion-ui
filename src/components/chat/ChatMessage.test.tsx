import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';

const dispatchMock = vi.fn();
const toastMock = vi.fn();
const selectorState = {
  conversation: {
    byId: {
      'chat-1': { id: 'chat-1', model_id: 'model-1', messages: [] },
    },
    animatingTitleId: null,
  },
  stream: {
    conversationId: 'chat-1',
    messageId: null as string | null,
    textBlocks: {} as Record<string, string>,
    thinkingBlocks: {} as Record<string, string>,
    blockOrder: [] as string[],
    blockTypes: {} as Record<string, 'text' | 'thinking'>,
    totalTextLength: 0,
    displayedTextLength: 0,
    isStreamingReasoning: false,
    isThinkingPhaseComplete: false,
    reasoningStartTime: null,
    reasoningEndTime: null,
    // Task 13b cut over：streamSlice 用 currentRun + searchSources 替换旧扁平字段
    currentRun: null as AgentRunState | null,
    searchSources: [] as unknown[],
  },
  settings: {},
  auth: {
    isAuthenticated: false,
    user: null,
  },
  models: {
    models: [{ id: 'model-1', provider: 'qwen', name: 'Qwen Max' }],
  },
};

function resetSelectorState() {
  Object.assign(selectorState.conversation, {
    byId: {
      'chat-1': { id: 'chat-1', model_id: 'model-1', messages: [] },
    },
    animatingTitleId: null,
  });
  Object.assign(selectorState.stream, {
    conversationId: 'chat-1',
    messageId: null,
    textBlocks: {},
    thinkingBlocks: {},
    blockOrder: [],
    blockTypes: {},
    totalTextLength: 0,
    displayedTextLength: 0,
    isStreamingReasoning: false,
    isThinkingPhaseComplete: false,
    reasoningStartTime: null,
    reasoningEndTime: null,
    currentRun: null,
    searchSources: [],
  });
  Object.assign(selectorState.auth, {
    isAuthenticated: false,
    user: null,
  });
  selectorState.models.models = [{ id: 'model-1', provider: 'qwen', name: 'Qwen Max' }];
}

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: typeof selectorState) => unknown) => selector(selectorState),
}));

vi.mock('@/lib/db/chatStore', () => ({
  chatStore: { upsertMessage: vi.fn() },
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('./ReasoningContent', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="reasoning-content">{content}</div>
  ),
}));

vi.mock('./SuggestedQuestions', () => ({
  default: () => null,
}));

vi.mock('./CodeBlock', () => ({
  default: ({ value }: { value: string }) => <pre>{value}</pre>,
}));

vi.mock('./FileCard', () => ({
  default: () => null,
}));

vi.mock('../models/ProviderIcon', () => ({
  default: () => <span>icon</span>,
}));

import ChatMessage from './ChatMessage';

describe('ChatMessage', () => {
  beforeEach(() => {
    resetSelectorState();
    vi.useFakeTimers();
    toastMock.mockReset();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('shows a copied label briefly after copying assistant content', async () => {
    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text' as const, id: 'blk_test', text: '复制这条消息' }],
          timestamp: 1,
        }}
      />,
    );

    // The copy button is the first tooltip-trigger button in the action bar
    const copyButton = document.querySelector('button[data-slot="tooltip-trigger"]') as HTMLElement;
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('复制这条消息');

    await act(async () => {
      await Promise.resolve();
    });

    // After successful copy, the icon changes to a check mark
    expect(copyButton.querySelector('.lucide-check')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // After timeout, the icon reverts to copy
    expect(copyButton.querySelector('.lucide-copy')).toBeTruthy();
  });

  it('surfaces a toast instead of throwing when clipboard copy fails', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('blocked'));

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text' as const, id: 'blk_test', text: '复制失败测试' }],
          timestamp: 1,
        }}
      />,
    );

    const copyButton = document.querySelector('button[data-slot="tooltip-trigger"]') as HTMLElement;
    fireEvent.click(copyButton);

    await act(async () => {
      await Promise.resolve();
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '复制失败，请重试',
        type: 'error',
      }),
    );
  });

  it('renders streaming assistant content from stream state instead of persisted message content', () => {
    selectorState.stream.messageId = 'assistant-1';
    selectorState.stream.textBlocks = { 'blk_s1': '流式正文' };
    selectorState.stream.thinkingBlocks = {};
    selectorState.stream.blockOrder = ['blk_s1'];
    selectorState.stream.blockTypes = { 'blk_s1': 'text' };
    selectorState.stream.totalTextLength = 4;
    selectorState.stream.displayedTextLength = 4;

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [],
          timestamp: 1,
          chatId: 'chat-1',
        }}
        isStreaming
        isLastMessage
      />,
    );

    expect(screen.getByText('流式正文')).toBeTruthy();

    // Reset stream state
    selectorState.stream.messageId = null;
    selectorState.stream.textBlocks = {};
    selectorState.stream.thinkingBlocks = {};
    selectorState.stream.blockOrder = [];
    selectorState.stream.blockTypes = {};
    selectorState.stream.totalTextLength = 0;
    selectorState.stream.displayedTextLength = 0;
  });

  it('does not render search UI when thinking only mentions search', () => {
    selectorState.stream.messageId = 'assistant-1';
    selectorState.stream.textBlocks = {};
    selectorState.stream.thinkingBlocks = { 'blk_t1': '让我搜索一下，但没有真实工具调用。' };
    selectorState.stream.blockOrder = ['blk_t1'];
    selectorState.stream.blockTypes = { 'blk_t1': 'thinking' };
    selectorState.stream.currentRun = null;

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [],
          timestamp: 1,
          chatId: 'chat-1',
        }}
        isStreaming
        isLastMessage
      />,
    );

    expect(screen.queryByText(/正在搜索/)).toBeNull();

    selectorState.stream.messageId = null;
    selectorState.stream.thinkingBlocks = {};
    selectorState.stream.blockOrder = [];
    selectorState.stream.blockTypes = {};
  });

  it('renders real running web_search as the main activity', () => {
    selectorState.stream.messageId = 'assistant-1';
    selectorState.stream.textBlocks = {};
    selectorState.stream.thinkingBlocks = { 'blk_t1': '准备调用搜索。' };
    selectorState.stream.blockOrder = ['blk_t1'];
    selectorState.stream.blockTypes = { 'blk_t1': 'thinking' };
    selectorState.stream.currentRun = {
      runId: 'run-1',
      messageId: 'assistant-1',
      status: 'running',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 1,
      lastSequence: 2,
      steps: [
        {
          stepId: 'step-1',
          stepNumber: 1,
          status: 'running',
          startedAt: 1,
          contentBlockIds: [],
          toolCalls: [
            {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 异常检测' },
              status: 'running',
              startedAt: 1,
            },
          ],
        },
      ],
    };

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [],
          timestamp: 1,
          chatId: 'chat-1',
        }}
        isStreaming
        isLastMessage
      />,
    );

    expect(screen.getByText('正在搜索：AI 异常检测')).toBeTruthy();

    selectorState.stream.messageId = null;
    selectorState.stream.thinkingBlocks = {};
    selectorState.stream.blockOrder = [];
    selectorState.stream.blockTypes = {};
    selectorState.stream.currentRun = null;
  });

  it('renders degraded web_search notice without rendering an empty sources panel', () => {
    selectorState.stream.currentRun = {
      runId: 'run-1',
      messageId: 'assistant-1',
      status: 'completed',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 1,
      lastSequence: 3,
      steps: [
        {
          stepId: 'step-1',
          stepNumber: 1,
          status: 'completed',
          startedAt: 1,
          completedAt: 2,
          contentBlockIds: [],
          toolCalls: [
            {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 新闻' },
              status: 'degraded',
              error: 'timeout',
              startedAt: 1,
              completedAt: 2,
            },
          ],
        },
      ],
    };

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'text-1', text: '基于已有信息回答。' }],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    expect(screen.getByText('搜索暂不可用')).toBeTruthy();
    expect(screen.getByText('已基于现有信息回答')).toBeTruthy();
    expect(screen.queryByText(/参考 \d+ 篇资料/)).toBeNull();

    selectorState.stream.currentRun = null;
  });

  it('ignores activity issues from a run owned by another assistant message', () => {
    selectorState.stream.currentRun = {
      runId: 'run-1',
      messageId: 'assistant-other',
      status: 'completed',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 1,
      lastSequence: 3,
      steps: [
        {
          stepId: 'step-1',
          stepNumber: 1,
          status: 'completed',
          startedAt: 1,
          completedAt: 2,
          contentBlockIds: [],
          toolCalls: [
            {
              toolCallId: 'tool-1',
              toolName: 'web_search',
              arguments: { query: 'AI 新闻' },
              status: 'degraded',
              error: 'timeout',
              startedAt: 1,
              completedAt: 2,
            },
          ],
        },
      ],
    };

    const { rerender } = render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'text-1', text: '这条消息正常回答。' }],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    expect(screen.queryByText('搜索暂不可用')).toBeNull();
    expect(screen.queryByText('已基于现有信息回答')).toBeNull();

    selectorState.stream.currentRun = {
      runId: 'run-2',
      messageId: 'assistant-other',
      status: 'failed',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 0,
      totalToolCalls: 0,
      lastSequence: 1,
      steps: [],
      failure: { code: 'provider_error', message: 'failed' },
    };

    rerender(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'text-1', text: '这条消息正常回答。' }],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    expect(screen.queryByText('生成失败，请重试')).toBeNull();
  });

  it('keeps reasoning visible while streaming text answer', () => {
    selectorState.stream.messageId = 'assistant-1';
    selectorState.stream.textBlocks = { 'blk_s1': '正在输出正文' };
    selectorState.stream.thinkingBlocks = { 'blk_t1': '先分析上下文' };
    selectorState.stream.blockOrder = ['blk_t1', 'blk_s1'];
    selectorState.stream.blockTypes = { 'blk_t1': 'thinking', 'blk_s1': 'text' };
    selectorState.stream.totalTextLength = 6;
    selectorState.stream.displayedTextLength = 6;

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [],
          timestamp: 1,
          chatId: 'chat-1',
        }}
        isStreaming
        isLastMessage
      />,
    );

    expect(screen.getByTestId('reasoning-content')).toHaveTextContent('先分析上下文');
    expect(screen.getByText('正在输出正文')).toBeTruthy();
  });
});
