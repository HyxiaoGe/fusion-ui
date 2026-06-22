import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';

const dispatchMock = vi.fn();
const toastMock = vi.fn();
const initialScrollIntoView = Element.prototype.scrollIntoView;
let originalScrollIntoView: typeof Element.prototype.scrollIntoView | undefined;
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

vi.mock('./SourcesPanel', () => ({
  default: () => <div data-testid="old-sources-panel">旧来源入口</div>,
}));

vi.mock('./UrlCard', () => ({
  default: () => <div data-testid="old-url-card">旧 URL 卡片</div>,
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
    originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
    Object.defineProperty(window, 'isSecureContext', { value: true, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    if (originalScrollIntoView) {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    } else {
      delete (Element.prototype as Partial<Pick<Element, 'scrollIntoView'>>).scrollIntoView;
    }
    originalScrollIntoView = undefined;
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
    expect(screen.queryByText(/回答依据/)).toBeNull();

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

  it('通过 AnswerEvidence 展示搜索结果，不再渲染旧来源面板和底部参考入口', () => {
    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [
            {
              type: 'search',
              id: 'search-1',
              query: 'AI standards governance',
              sources: [
                {
                  title: 'Global AI Standards Forum G7 functions governance',
                  url: 'https://standards.example.com/g7-governance',
                },
              ],
            },
            { type: 'text', id: 'text-1', text: '这是联网回答。[1]' },
          ],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    expect(screen.getByText('回答依据 · 搜索 1 条')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看来源：Global AI Standards Forum G7 functions governance' })).toBeInTheDocument();
    expect(screen.queryByTestId('old-sources-panel')).toBeNull();
    expect(screen.queryByText(/参考 \d+ 篇资料/)).toBeNull();
  });

  it('通过 AnswerEvidence 展示 URL 读取结果，不再渲染旧 URL 卡片', () => {
    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [
            {
              type: 'url_read',
              id: 'url-1',
              title: 'Example Article',
              url: 'https://example.com/article',
            },
            { type: 'text', id: 'text-1', text: '已读取网页后回答。' },
          ],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    expect(screen.getByText('回答依据 · 读取 1 个网页')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开网页：Example Article' })).toHaveAttribute('href', 'https://example.com/article');
    expect(screen.queryByTestId('old-url-card')).toBeNull();
  });

  it('assistant 回复通过 AssistantResponseStack 渲染正文和辅助层', () => {
    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [
            {
              type: 'search',
              id: 'search-1',
              query: 'AI standards source',
              sources: [
                {
                  title: 'AI Standards Source',
                  url: 'https://standards.example.com/source',
                },
              ],
            },
            {
              type: 'url_read',
              id: 'url-1',
              title: 'AI Standards Report',
              url: 'https://standards.example.com/report',
            },
            { type: 'text', id: 'text-1', text: 'AI 标准需要透明的评估流程。[1]' },
          ],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    const stack = screen.getByTestId('assistant-response-stack');

    expect(stack).toBeInTheDocument();
    expect(within(stack).getByText('AI 标准需要透明的评估流程。')).toBeInTheDocument();
    expect(within(stack).getByText('回答依据 · 搜索 1 条 · 读取 1 个网页')).toBeInTheDocument();
    expect(within(stack).getByRole('button', { name: '查看参考资料 1：AI Standards Source' })).toBeInTheDocument();
  });

  it('正文 Markdown 引用仍能打开来源侧栏', () => {
    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [
            {
              type: 'search',
              id: 'search-1',
              query: 'AI standards source',
              sources: [
                {
                  title: 'AI Standards Source',
                  url: 'https://standards.example.com/source',
                },
              ],
            },
            { type: 'text', id: 'text-1', text: '引用来源[1]。' },
          ],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看参考资料 1：AI Standards Source' }));

    expect(screen.getByText('参考资料')).toBeInTheDocument();
    expect(screen.getAllByText('AI Standards Source').length).toBeGreaterThanOrEqual(1);
  });

  it('混合搜索和多个 URL 读取结果时展示统一回答依据预览', () => {
    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: [
            {
              type: 'search',
              id: 'search-1',
              query: 'mixed evidence',
              sources: [
                {
                  title: 'Mixed Search Source',
                  url: 'https://search.example.com/mixed',
                },
              ],
            },
            { type: 'url_read', id: 'url-1', title: '网页 1', url: 'https://one.example.com' },
            { type: 'url_read', id: 'url-2', title: '网页 2', url: 'https://two.example.com' },
            { type: 'url_read', id: 'url-3', title: '网页 3', url: 'https://three.example.com' },
            { type: 'url_read', id: 'url-4', title: '网页 4', url: 'https://four.example.com' },
            { type: 'text', id: 'text-1', text: '混合依据回答。[1]' },
          ],
          timestamp: 1,
          chatId: 'chat-1',
        }}
      />,
    );

    expect(screen.getByText('回答依据 · 搜索 1 条 · 读取 4 个网页')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /打开网页：/ })).toHaveLength(2);
    expect(screen.getByText('另有 2 个网页')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看全部搜索来源' })).toBeNull();
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

describe('ChatMessage 测试环境', () => {
  it('不会把 scrollIntoView 测试桩泄漏给后续测试', () => {
    expect(Element.prototype.scrollIntoView).toBe(initialScrollIntoView);
  });
});
