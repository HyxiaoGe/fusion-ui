import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentRunState } from '@/types/agentRun';

const { selectorState, chatMessageRenderMock, isNearBottomMock, resizeObserverState } = vi.hoisted(() => ({
  selectorState: {
    stream: {
      conversationId: null,
      messageId: null as string | null,
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
  isNearBottomMock: vi.fn(),
  resizeObserverState: {
    callback: null as ResizeObserverCallback | null,
    observe: vi.fn(),
    disconnect: vi.fn(),
  },
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: any) => unknown) =>
    selector(selectorState),
}));

vi.mock('@/lib/chat/scrollBehavior', () => ({
  isNearBottom: isNearBottomMock,
}));

vi.mock('./ChatMessage', () => ({
  default: ({
    message,
    agentRun,
    isStreaming,
    onRetry,
    onContinueAgentRun,
    suggestedQuestions,
  }: {
    message: { id: string; content: Array<{ type: string; text?: string }> };
    agentRun?: AgentRunState | null;
    isStreaming?: boolean;
    onRetry?: (messageId: string) => void;
    onContinueAgentRun?: (messageId: string, previousRunId?: string) => void;
    suggestedQuestions?: string[];
  }) => {
    chatMessageRenderMock(message.id, agentRun?.runId ?? null);
    return (
      <div
        data-testid={`chat-message-${message.id}`}
        data-run-id={agentRun?.runId ?? ''}
        data-run-status={agentRun?.status ?? ''}
        data-run-max-steps={agentRun?.config.maxSteps ?? ''}
        data-run-limit-reason={agentRun?.limitReachedReason ?? ''}
        data-streaming={isStreaming ? 'true' : 'false'}
      >
        <div>{message.content.filter(b => b.type === 'text').map(b => b.text).join('')}</div>
        {onRetry ? (
          <button type="button" data-testid={`retry-${message.id}`} onClick={() => onRetry(message.id)}>
            重试
          </button>
        ) : null}
        {agentRun?.status === 'limit_reached' ? (
          <button
            type="button"
            onClick={() => onContinueAgentRun?.(message.id, agentRun.runId)}
          >
            继续查
          </button>
        ) : null}
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
    selectorState.stream.messageId = null;
    selectorState.stream.currentRun = null;
    selectorState.stream.blockOrder = [];
    selectorState.stream.displayedTextLength = 0;
    selectorState.stream.lastError = null;
    isNearBottomMock.mockReset();
    isNearBottomMock.mockReturnValue(true);
    chatMessageRenderMock.mockClear();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    resizeObserverState.callback = null;
    resizeObserverState.observe.mockClear();
    resizeObserverState.disconnect.mockClear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverState.callback = callback;
      }

      observe = resizeObserverState.observe;
      unobserve = vi.fn();
      disconnect = resizeObserverState.disconnect;
    });
  });

  it('两轮消息间隔小于一秒时仍严格保留上游顺序', () => {
    render(
      <ChatMessageList
        conversationId="chat-1"
        messages={[
          { id: 'user-1', role: 'user', content: [], timestamp: 1_000 },
          { id: 'assistant-1', role: 'assistant', content: [], timestamp: 1_500 },
          { id: 'user-2', role: 'user', content: [], timestamp: 1_900 },
          { id: 'assistant-2', role: 'assistant', content: [], timestamp: 2_400 },
        ]}
      />
    );

    expect(screen.getAllByTestId(/^chat-message-/).map((node) => node.dataset.testid)).toEqual([
      'chat-message-user-1',
      'chat-message-assistant-1',
      'chat-message-user-2',
      'chat-message-assistant-2',
    ]);
  });

  it('只向最后一轮 user 和 assistant 暴露重试入口', () => {
    render(
      <ChatMessageList
        conversationId="chat-1"
        onRetry={vi.fn()}
        messages={[
          { id: 'user-1', role: 'user', content: [], sequence: 1, timestamp: 1_000 },
          { id: 'assistant-1', role: 'assistant', content: [], sequence: 2, timestamp: 1_500 },
          { id: 'user-2', role: 'user', content: [], sequence: 3, timestamp: 2_000 },
          { id: 'assistant-2', role: 'assistant', content: [], sequence: 4, timestamp: 2_500 },
        ]}
      />
    );

    expect(screen.queryByTestId('retry-user-1')).toBeNull();
    expect(screen.queryByTestId('retry-assistant-1')).toBeNull();
    expect(screen.getByTestId('retry-user-2')).toBeInTheDocument();
    expect(screen.getByTestId('retry-assistant-2')).toBeInTheDocument();
  });

  it('时间戳异常反转时仍按服务端传入顺序渲染 user 再 assistant', () => {
    render(
      <ChatMessageList
        conversationId="chat-1"
        messages={[
          { id: 'user-1', role: 'user', content: [], sequence: 1, timestamp: 9 * 60 * 60 * 1_000 },
          { id: 'assistant-1', role: 'assistant', content: [], sequence: 2, timestamp: 1_000 },
        ]}
      />
    );

    expect(screen.getAllByTestId(/^chat-message-/).map((node) => node.dataset.testid)).toEqual([
      'chat-message-user-1',
      'chat-message-assistant-1',
    ]);
  });

  it('初次进入长历史会话时即使当前位置不在底部也会滚到最新回复', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    isNearBottomMock.mockReturnValue(false);

    render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          conversationId="chat-1"
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '较早回复' }],
              timestamp: 1,
            },
            {
              id: 'assistant-2',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_2', text: '最新回复' }],
              timestamp: 2,
            },
          ]}
        />
      </div>
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
  });

  it('conversationId 切换时即使消息数和流式状态相同也跳到新会话底部', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_1', text: '同样数量的消息' }],
        timestamp: 1,
      },
    ];

    const { rerender } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList conversationId="chat-1" messages={messages} isStreaming={false} />
      </div>
    );
    scrollIntoView.mockClear();

    rerender(
      <div data-chat-scroll-container="true">
        <ChatMessageList conversationId="chat-2" messages={messages} isStreaming={false} />
      </div>
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
  });

  it('从离底会话切换 conversationId 时首帧同步隐藏旧会话箭头', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_1', text: '回复内容' }],
        timestamp: 1,
      },
    ];

    try {
      act(() => {
        root.render(
          <div data-chat-scroll-container="true">
            <ChatMessageList conversationId="chat-1" messages={messages} isStreaming />
          </div>
        );
      });
      const scrollContainer = host.firstChild as HTMLElement;
      Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 500, writable: true });
      isNearBottomMock.mockReturnValue(true);
      fireEvent.scroll(scrollContainer);
      scrollContainer.scrollTop = 200;
      isNearBottomMock.mockReturnValue(false);
      fireEvent.scroll(scrollContainer);
      expect(host.querySelector('[aria-label="查看最新回复"]')).not.toBeNull();

      flushSync(() => {
        root.render(
          <div data-chat-scroll-container="true">
            <ChatMessageList conversationId="chat-2" messages={messages} isStreaming />
          </div>
        );
      });

      expect(host.querySelector('[aria-label="查看最新回复"]')).toBeNull();
    } finally {
      act(() => root.unmount());
      host.remove();
      consoleErrorSpy.mockRestore();
    }
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
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 900, writable: true });

    isNearBottomMock.mockReturnValue(true);
    fireEvent.scroll(scrollContainer);
    scrollContainer.scrollTop = 600;

    isNearBottomMock.mockReturnValue(false);
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

  it('uses persisted latest agent run to continue a hydrated historical message', () => {
    const onContinueAgentRun = vi.fn();
    render(
      <ChatMessageList
        conversationId="chat-1"
        onContinueAgentRun={onContinueAgentRun}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_1', text: '触顶回答' }],
            timestamp: 1,
            agent_run: {
              runId: 'run-1',
              status: 'limit_reached',
              config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
              totalSteps: 3,
              totalToolCalls: 5,
              limitReachedReason: 'max_steps',
            },
          } as any,
          {
            id: 'assistant-2',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_2', text: '最新回复' }],
            timestamp: 2_000,
          },
        ]}
      />
    );

    expect(screen.getByTestId('chat-message-assistant-1').dataset.runId).toBe('run-1');
    fireEvent.click(screen.getByText('继续查'));
    expect(onContinueAgentRun).toHaveBeenCalledWith('assistant-1', 'run-1');
  });

  it('终态 live run 不遮挡消息水合得到的权威 agent run', () => {
    selectorState.stream.currentRun = {
      runId: 'run-server',
      messageId: 'assistant-1',
      status: 'completed',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 1,
      totalToolCalls: 0,
      steps: [],
      lastSequence: 9,
    };

    render(
      <ChatMessageList
        conversationId="chat-1"
        messages={[{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text' as const, id: 'blk_1', text: '权威回答' }],
          timestamp: 1,
          agent_run: {
            runId: 'run-server',
            status: 'limit_reached',
            config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
            totalSteps: 3,
            totalToolCalls: 5,
            limitReachedReason: 'max_steps',
          },
        } as any]}
      />,
    );

    const message = screen.getByTestId('chat-message-assistant-1');
    expect(message).toHaveAttribute('data-run-id', 'run-server');
    expect(message).toHaveAttribute('data-run-status', 'limit_reached');
    expect(message).toHaveAttribute('data-run-max-steps', '3');
    expect(message).toHaveAttribute('data-run-limit-reason', 'max_steps');
  });

  it('续跑产生的新 terminal currentRun 不被同消息的旧 hydrated run 遮挡', () => {
    selectorState.stream.currentRun = {
      runId: 'run-continuation',
      messageId: 'assistant-1',
      status: 'limit_reached',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 8,
      totalToolCalls: 10,
      steps: [],
      lastSequence: 12,
      limitReachedReason: 'max_steps',
    };

    render(
      <ChatMessageList
        conversationId="chat-1"
        messages={[{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text' as const, id: 'blk_1', text: '续跑后的回答' }],
          timestamp: 1,
          agent_run: {
            runId: 'run-previous',
            status: 'completed',
            config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
            totalSteps: 3,
            totalToolCalls: 2,
          },
        } as any]}
      />,
    );

    expect(screen.getByTestId('chat-message-assistant-1'))
      .toHaveAttribute('data-run-id', 'run-continuation');
  });

  it('同 runId 的 terminal currentRun 不被过期的 hydrated running 快照覆盖', () => {
    selectorState.stream.currentRun = {
      runId: 'run-server',
      messageId: 'assistant-1',
      status: 'limit_reached',
      config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
      totalSteps: 8,
      totalToolCalls: 10,
      steps: [],
      lastSequence: 12,
      limitReachedReason: 'max_steps',
    };

    render(
      <ChatMessageList
        conversationId="chat-1"
        messages={[{
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text' as const, id: 'blk_1', text: '终态回答' }],
          timestamp: 1,
          agent_run: {
            runId: 'run-server',
            status: 'running',
            config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
            totalSteps: 7,
            totalToolCalls: 9,
          },
        } as any]}
      />,
    );

    expect(screen.getByTestId('chat-message-assistant-1'))
      .toHaveAttribute('data-run-status', 'limit_reached');
    expect(screen.getByTestId('chat-message-assistant-1'))
      .toHaveAttribute('data-run-max-steps', '8');
    expect(screen.getByTestId('chat-message-assistant-1'))
      .toHaveAttribute('data-run-limit-reason', 'max_steps');
  });

  it('marks the message owning stream.messageId as streaming even when it is not last', () => {
    selectorState.stream.messageId = 'assistant-1';
    render(
      <ChatMessageList
        isStreaming
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_1', text: '继续中的旧回答' }],
            timestamp: 1,
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            content: [{ type: 'text' as const, id: 'blk_2', text: '最新回复' }],
            timestamp: 2_000,
          },
        ]}
      />
    );

    expect(screen.getByTestId('chat-message-assistant-1').dataset.streaming).toBe('true');
    expect(screen.getByTestId('chat-message-assistant-2').dataset.streaming).toBe('false');
  });

  it('内容高度变化触发跟随时不重新渲染消息行', () => {
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

    render(
      <div data-chat-scroll-container="true">
        <ChatMessageList messages={messages} conversationId="chat-1" isStreaming />
      </div>
    );
    chatMessageRenderMock.mockClear();
    scrollIntoView.mockClear();

    act(() => {
      resizeObserverState.callback?.([], {} as ResizeObserver);
    });

    expect(chatMessageRenderMock).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('流式内容任意增高时在 sticky 模式持续跟随到底部', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          conversationId="chat-1"
          isStreaming
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '正在回复' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );
    scrollIntoView.mockClear();

    act(() => {
      resizeObserverState.callback?.([], {} as ResizeObserver);
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
  });

  it('同时观察滚动容器，视口高度缩小时 sticky 模式继续跟随到底部', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          conversationId="chat-1"
          isStreaming
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '正在回复' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );
    const scrollContainer = container.firstChild as HTMLElement;

    expect(resizeObserverState.observe).toHaveBeenCalledWith(scrollContainer);
    scrollIntoView.mockClear();
    act(() => {
      resizeObserverState.callback?.(
        [{ target: scrollContainer } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
  });

  it('视口高度缩小时非 sticky 模式保持位置和回到底部入口', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          conversationId="chat-1"
          isStreaming={false}
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '回复内容' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );
    const scrollContainer = container.firstChild as HTMLElement;
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 500, writable: true });
    isNearBottomMock.mockReturnValue(true);
    fireEvent.scroll(scrollContainer);
    scrollContainer.scrollTop = 200;
    isNearBottomMock.mockReturnValue(false);
    fireEvent.scroll(scrollContainer);
    scrollIntoView.mockClear();

    act(() => {
      resizeObserverState.callback?.(
        [{ target: scrollContainer } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument();
  });

  it('程序向下滚动经过离底区域时不会误判成用户上滑', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    isNearBottomMock.mockReturnValue(false);

    const { container } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          conversationId="chat-1"
          isStreaming
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '正在回复' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );
    const scrollContainer = container.firstChild as HTMLElement;
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 300, writable: true });
    fireEvent.scroll(scrollContainer);
    scrollIntoView.mockClear();

    act(() => {
      resizeObserverState.callback?.([], {} as ResizeObserver);
    });

    expect(screen.queryByRole('button', { name: '查看最新回复' })).toBeNull();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
  });

  it('用户离底超过阈值时显示查看最新回复按钮，点击后恢复 sticky 并隐藏', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const { container } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          conversationId="chat-1"
          isStreaming
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '正在回复' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );
    const scrollContainer = container.firstChild as HTMLElement;
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 500, writable: true });
    isNearBottomMock.mockReturnValue(true);
    fireEvent.scroll(scrollContainer);
    scrollContainer.scrollTop = 200;
    isNearBottomMock.mockReturnValue(false);
    fireEvent.scroll(scrollContainer);

    const jumpButton = screen.getByRole('button', { name: '查看最新回复' });
    scrollIntoView.mockClear();
    fireEvent.click(jumpButton);

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
    expect(screen.queryByRole('button', { name: '查看最新回复' })).toBeNull();
  });

  it('流式完成后将离底按钮文案切换为回到底部', () => {
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: 'blk_1', text: '回复内容' }],
        timestamp: 1,
      },
    ];
    const { container, rerender } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList conversationId="chat-1" isStreaming messages={messages} />
      </div>
    );
    const scrollContainer = container.firstChild as HTMLElement;
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 500, writable: true });
    isNearBottomMock.mockReturnValue(true);
    fireEvent.scroll(scrollContainer);
    scrollContainer.scrollTop = 200;
    isNearBottomMock.mockReturnValue(false);
    fireEvent.scroll(scrollContainer);

    rerender(
      <div data-chat-scroll-container="true">
        <ChatMessageList conversationId="chat-1" isStreaming={false} messages={messages} />
      </div>
    );

    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument();
  });

  it('回到底部按钮依据聊天滚动视口定位，不使用全局固定右下角', () => {
    const { container } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          conversationId="chat-1"
          isStreaming={false}
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '回复内容' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );
    const scrollContainer = container.firstChild as HTMLElement;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    scrollContainer.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 200,
      right: 900,
      bottom: 650,
      width: 700,
      height: 550,
      x: 200,
      y: 100,
      toJSON: () => ({}),
    }));
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 500, writable: true });
    isNearBottomMock.mockReturnValue(true);
    fireEvent.scroll(scrollContainer);
    scrollContainer.scrollTop = 200;
    isNearBottomMock.mockReturnValue(false);
    fireEvent.scroll(scrollContainer);

    act(() => {
      resizeObserverState.callback?.(
        [{ target: scrollContainer } as unknown as ResizeObserverEntry],
        {} as ResizeObserver,
      );
    });

    const button = screen.getByRole('button', { name: '回到底部' });
    expect(button).toHaveStyle({ right: '316px', bottom: '166px' });
    expect(button.className).not.toContain('right-6');
    expect(button.className).not.toContain('bottom-28');
  });

  it('聊天容器自身滚动不读取布局坐标', () => {
    const { container } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          conversationId="chat-1"
          isStreaming
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '正在回复' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );
    const scrollContainer = container.firstChild as HTMLElement;
    const getBoundingClientRect = vi.fn(() => ({
      top: 0,
      left: 0,
      right: 900,
      bottom: 650,
      width: 900,
      height: 650,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
    scrollContainer.getBoundingClientRect = getBoundingClientRect;

    fireEvent.scroll(scrollContainer);

    expect(getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('无消息或仍在底部附近时不显示回到底部按钮', () => {
    const { rerender } = render(<ChatMessageList messages={[]} isStreaming={false} />);
    expect(screen.queryByRole('button', { name: '回到底部' })).toBeNull();

    rerender(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: [{ type: 'text' as const, id: 'blk_1', text: '已在底部' }],
              timestamp: 1,
            },
          ]}
        />
      </div>
    );
    expect(screen.queryByRole('button', { name: '回到底部' })).toBeNull();
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

  it('shows an in-place conversation loading skeleton instead of the generic empty state', () => {
    render(
      <ChatMessageList
        messages={[]}
        loadingState="history-hydration"
      />
    );

    expect(screen.getByTestId('history-hydration-skeleton')).toBeTruthy();
    expect(screen.getByTestId('chat-loading-surface')).toBeTruthy();
    expect(screen.queryByText('正在加载这段对话')).toBeNull();
    expect(screen.queryByText('开始一个新对话')).toBeNull();
  });

});
