import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ChatMessage', () => ({
  default: ({
    message,
    suggestedQuestions,
  }: {
    message: { content: string };
    suggestedQuestions?: string[];
  }) => (
    <div>
      <div>{message.content}</div>
      {suggestedQuestions?.map((question) => (
        <div key={question}>{question}</div>
      ))}
    </div>
  ),
}));

import ChatMessageList from './ChatMessageList';

describe('ChatMessageList', () => {
  beforeEach(() => {
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
              content: '第一条',
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
              content: '第一条',
              timestamp: 1,
            },
            {
              id: 'assistant-2',
              role: 'assistant',
              content: '第二条',
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
            content: '回复完成',
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

  it('does not show a completed status for historical assistant messages by default', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: '历史回复',
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
            content: '回复完成',
            timestamp: 1,
          },
        ]}
        isStreaming={false}
        isLoadingQuestions={true}
      />
    );

    expect(screen.getByText('正在准备推荐追问...')).toBeTruthy();
  });

  it('shows a resend hint when the latest user message failed', () => {
    render(
      <ChatMessageList
        messages={[
          {
            id: 'user-1',
            role: 'user',
            content: '这条消息发送失败',
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
            content: '上一条回复',
            timestamp: 1_000,
          },
          {
            id: 'user-1',
            role: 'user',
            content: '最新用户消息',
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

  it('shows a jump-to-bottom button when the reader scrolls away from the bottom', () => {
    const { container } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '第一条',
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

    expect(screen.getByRole('button', { name: '回到底部' })).toBeTruthy();
  });

  it('uses a streaming-specific label when new assistant output is arriving off-screen', () => {
    const { container } = render(
      <div data-chat-scroll-container="true">
        <ChatMessageList
          messages={[
            {
              id: 'assistant-1',
              role: 'assistant',
              content: '第一条',
              timestamp: 1,
            },
          ]}
          isStreaming={true}
        />
      </div>
    );

    const scrollContainer = container.firstChild as HTMLElement;
    Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 1600 });
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 400 });
    Object.defineProperty(scrollContainer, 'scrollTop', { configurable: true, value: 600, writable: true });

    fireEvent.scroll(scrollContainer);

    expect(screen.getByRole('button', { name: '查看最新回复' })).toBeTruthy();
  });
});
