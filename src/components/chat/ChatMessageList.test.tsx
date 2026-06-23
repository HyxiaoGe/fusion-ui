import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';

const { selectorState, chatMessageRenderMock } = vi.hoisted(() => ({
  selectorState: {
    stream: {
      conversationId: null,
      currentRun: null as AgentRunState | null,
      blockOrder: [] as string[],
      textBlocks: {},
      thinkingBlocks: {},
      blockTypes: {},
      totalTextLength: 0,
      displayedTextLength: 0,
      lastError: null,
    },
    conversation: {
      byId: {
        'chat-1': { id: 'chat-1', model_id: 'model-1', messages: [] },
      },
    },
    models: {
      selectedModelId: 'model-1',
      models: [{ id: 'model-1', provider: 'qwen', name: 'Qwen Max' }],
    },
  },
  chatMessageRenderMock: vi.fn(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: any) => unknown) =>
    selector(selectorState),
}));

vi.mock('./ChatMessage', () => ({
  default: ({
    message,
    agentRun,
    suggestedQuestions,
  }: {
    message: { id: string; content: Array<{ type: string; text?: string }> };
    agentRun?: AgentRunState | null;
    suggestedQuestions?: string[];
  }) => {
    chatMessageRenderMock(message.id, agentRun?.runId ?? null);
    return (
      <div data-testid={`chat-message-${message.id}`} data-run-id={agentRun?.runId ?? ''}>
        <div>{message.content.filter(b => b.type === 'text').map(b => b.text).join('')}</div>
        {suggestedQuestions?.map((question) => (
          <div key={question}>{question}</div>
        ))}
      </div>
    );
  },
}));

import ChatMessageList from './ChatMessageList';

describe('ChatMessageList', () => {
  beforeEach(() => {
    selectorState.stream.currentRun = null;
    selectorState.stream.blockOrder = [];
    selectorState.stream.displayedTextLength = 0;
    selectorState.stream.lastError = null;
    chatMessageRenderMock.mockClear();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('does not force-scroll when the reader has moved away from the bottom', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const { container, rerender } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '第一条' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );

    const scrollContainer = container.firstChild as HTMLElement;
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1600 });
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 600, writable: true });

    fireEvent.scroll(scrollContainer);
    scrollIntoView.mockClear();

    rerender(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '第一条' }],
              timestamp: 1,
            },
            {
              id: 'assistant-2',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_2', text: '第二条' }],
              timestamp: 2,
            },
          ]}
        />
      </div>
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('shows a completed status after the last assistant message finishes', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_1', text: '回复完成' }],
            timestamp: 1,
          },
        ]}
        isStreaming={false}
        isLoadingQuestions={false}
        completionStateVisible={true}
      />
    );

    expect(screen.getByText('本轮回复已完成')).toBeTruthy();
  });

  it('hides the completed status once suggested follow-up questions are ready', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_1', text: '回复完成' }],
            timestamp: 1,
          },
        ]}
        suggestedQuestions={['继续追问']}
        isStreaming={false}
        isLoadingQuestions={false}
        completionStateVisible={true}
      />
    );

    expect(screen.queryByText('本轮回复已完成')).toBeNull();
  });

  it('does not show a completed status for historical assistant messages by default', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_1', text: '历史回复' }],
            timestamp: 1,
          },
        ]}
        isStreaming={false}
        isLoadingQuestions={false}
      />
    );

    expect(screen.queryByText('本轮回复已完成')).toBeNull();
  });

  it('shows a follow-up loading status while suggested questions are fetching', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_1', text: '回复完成' }],
            timestamp: 1,
          },
        ]}
        isStreaming={false}
        isLoadingQuestions={true}
      />
    );

    // loading 状态现在由 SuggestedQuestions 组件展示，ChatMessageList 不再显示该文案
    expect(screen.queryByText('正在准备推荐追问...')).toBeNull();
  });

  it('shows a resend hint when the latest user message failed', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'user-1',
            role: 'user',
            content: [{ type: 'text' as const, id: 'blk_1', text: '这条消息发送失败' }],
            status: 'failed',
            timestamp: 1,
          },
        ]}
        isStreaming={false}
        isLoadingQuestions={false}
      />
    );

    expect(screen.getByText('发送失败，可重新发送')).toBeTruthy();
  });

  it('only attaches suggested questions to the latest assistant message', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_1', text: '上一条回复' }],
            timestamp: 1_000,
          },
          {
            id: 'user-1',
            role: 'user',
            content: [{ type: 'text' as const, id: 'blk_2', text: '最新用户消息' }],
            status: 'failed',
            timestamp: 3_000,
          },
        ]}
        suggestedQuestions={['建议问题']}
        isStreaming={false}
        isLoadingQuestions={false}
      />
    );

    expect(screen.queryByText('建议问题')).toBeNull();
  });

  it('currentRun 更新时只重新渲染归属该 run 的消息行', () => {
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_1', text: '历史回复' }],
        timestamp: 1,
      },
      {
        id: 'assistant-2',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_2', text: '当前回复' }],
        timestamp: 2_000,
      },
    ];

    const { rerender } = render(
      <ChatMessageList messages={messages} conversationId="chat-1" />
    );
    chatMessageRenderMock.mockClear();

    selectorState.stream.currentRun = {
      runId: 'run-2',
      messageId: 'assistant-2',
      status: 'running',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 0,
      steps: [],
      lastSequence: 1,
    };

    rerender(<ChatMessageList messages={messages} conversationId="chat-1" />);

    expect(chatMessageRenderMock).toHaveBeenCalledTimes(1);
    expect(chatMessageRenderMock).toHaveBeenCalledWith('assistant-2', 'run-2');
  });

  it('currentRun 通过 serverMessageId 匹配时只重新渲染归属消息行', () => {
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_1', text: '历史回复' }],
        timestamp: 1,
      },
      {
        id: 'server-assistant-2',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_2', text: '服务端消息' }],
        timestamp: 2_000,
      },
    ];

    const { rerender } = render(
      <ChatMessageList messages={messages} conversationId="chat-1" />
    );
    chatMessageRenderMock.mockClear();

    selectorState.stream.currentRun = {
      runId: 'run-server-2',
      messageId: 'client-temp-2',
      serverMessageId: 'server-assistant-2',
      status: 'running',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 0,
      steps: [],
      lastSequence: 1,
    };

    rerender(<ChatMessageList messages={messages} conversationId="chat-1" />);

    expect(chatMessageRenderMock).toHaveBeenCalledTimes(1);
    expect(chatMessageRenderMock).toHaveBeenCalledWith('server-assistant-2', 'run-server-2');
  });

  it('currentRun 切换归属消息时旧行清空 run，新行挂载 run', () => {
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_1', text: '第一条回复' }],
        timestamp: 1,
      },
      {
        id: 'assistant-2',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_2', text: '第二条回复' }],
        timestamp: 2_000,
      },
    ];

    selectorState.stream.currentRun = {
      runId: 'run-1',
      messageId: 'assistant-1',
      status: 'running',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 0,
      steps: [],
      lastSequence: 1,
    };

    const { rerender } = render(
      <ChatMessageList messages={messages} conversationId="chat-1" />
    );
    chatMessageRenderMock.mockClear();

    selectorState.stream.currentRun = {
      runId: 'run-2',
      messageId: 'assistant-2',
      status: 'running',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 0,
      steps: [],
      lastSequence: 2,
    };

    rerender(<ChatMessageList messages={messages} conversationId="chat-1" />);

    expect(chatMessageRenderMock).toHaveBeenCalledTimes(2);
    expect(chatMessageRenderMock).toHaveBeenCalledWith('assistant-1', null);
    expect(chatMessageRenderMock).toHaveBeenCalledWith('assistant-2', 'run-2');
  });

  it('stream 滚动信号更新时不重新渲染消息行', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_1', text: '历史回复' }],
        timestamp: 1,
      },
      {
        id: 'assistant-2',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_2', text: '当前回复' }],
        timestamp: 2_000,
      },
    ];

    const { rerender } = render(
      <ChatMessageList messages={messages} conversationId="chat-1" isStreaming />
    );
    chatMessageRenderMock.mockClear();
    scrollIntoView.mockClear();

    selectorState.stream.displayedTextLength = 12;
    selectorState.stream.blockOrder = ['blk_2'];

    rerender(<ChatMessageList messages={messages} conversationId="chat-1" isStreaming />);

    expect(chatMessageRenderMock).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('supports a routed-chat empty state copy that differs from the home view', () => {
    render(
      <ChatMessageList
        messages={[]}
        emptyState={{
          title: '这个会话还没有消息',
          description: '发送第一条消息，继续这段会话。',
        }}
      />
    );

    expect(screen.getByText('这个会话还没有消息')).toBeTruthy();
    expect(screen.getByText('发送第一条消息，继续这段会话。')).toBeTruthy();
    expect(screen.queryByText('开始一个新对话')).toBeNull();
  });

  it('shows an in-place history hydration skeleton instead of the generic empty state', () => {
    render(
      <ChatMessageList
        messages={[]}
        loadingState="history-hydration"
      />
    );

    expect(screen.getByText('正在恢复这段对话')).toBeTruthy();
    expect(screen.getByText('消息会在几秒内加载完成。')).toBeTruthy();
    expect(screen.queryByText('开始一个新对话')).toBeNull();
  });

});
