import React from 'react';
import { render, screen } from '@testing-library/react';
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
      />
    );

    expect(screen.getByText('本轮回复已完成')).toBeTruthy();
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
});
