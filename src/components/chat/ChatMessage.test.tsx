import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dispatchMock = vi.fn();
const selectorState = {
  chat: {
    activeChatId: 'chat-1',
    streamingReasoningStartTime: null,
    streamingReasoningEndTime: null,
    isStreamingReasoning: false,
    chats: [{ id: 'chat-1', model: 'model-1', provider: 'qwen' }],
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

    const button = screen.getByRole('button', { name: '复制消息' });
    fireEvent.click(button);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('复制这条消息');

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: '已复制!' })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: '复制消息' })).toBeTruthy();
  });
});
