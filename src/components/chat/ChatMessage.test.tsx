import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
