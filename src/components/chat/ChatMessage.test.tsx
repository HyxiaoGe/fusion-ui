import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dispatchMock = vi.fn();
const toastMock = vi.fn();
const selectorState = {
  conversation: {
    byId: {
      'chat-1': { id: 'chat-1', model: 'model-1', provider: 'qwen', messages: [] },
    },
    animatingTitleId: null,
  },
  stream: {
    conversationId: 'chat-1',
    content: '',
    reasoning: '',
    reasoningStartTime: null,
    reasoningEndTime: null,
    isStreamingReasoning: false,
  },
  settings: {
    userAvatar: 'default',
    assistantAvatar: 'default',
  },
  auth: {
    isAuthenticated: false,
    user: null,
  },
  models: {
    models: [{ id: 'model-1', provider: 'qwen', name: 'Qwen Max' }],
  },
};

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
  default: () => null,
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
    vi.useFakeTimers();
    toastMock.mockReset();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
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
          content: '复制这条消息',
          timestamp: 1,
        }}
      />,
    );

    const button = screen.getByRole('button', { name: '复制' });
    fireEvent.click(button);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('复制这条消息');

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: '已复制' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: '复制' })).toBeTruthy();
  });

  it('surfaces a toast instead of throwing when clipboard copy fails', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('blocked'));

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: '复制失败测试',
          timestamp: 1,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '复制' }));

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
    selectorState.stream.content = '流式正文';

    render(
      <ChatMessage
        message={{
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          reasoning: null,
          timestamp: 1,
          chatId: 'chat-1',
        }}
        isStreaming
        isLastMessage
      />,
    );

    expect(screen.getByText('流式正文')).toBeTruthy();

    selectorState.stream.content = '';
  });
});
