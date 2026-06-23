import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { currentState, useAppSelectorMock, toastMock, fetchPromptExamplesMock, preloadChatMessageListMock } = vi.hoisted(() => ({
  currentState: {
    auth: {
      isAuthenticated: true,
    },
  } as any,
  useAppSelectorMock: vi.fn(),
  toastMock: vi.fn(),
  fetchPromptExamplesMock: vi.fn(),
  preloadChatMessageListMock: vi.fn(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock('@/lib/api/prompts', () => ({
  fetchPromptExamples: fetchPromptExamplesMock,
}));

vi.mock('@/components/lazy/preloaders', () => ({
  preloadChatMessageList: preloadChatMessageListMock,
}));

import HomePage from './HomePage';

describe('HomePage', () => {
  beforeEach(() => {
    currentState.auth.isAuthenticated = true;
    useAppSelectorMock.mockImplementation((selector) => selector(currentState));
    toastMock.mockReset();
    preloadChatMessageListMock.mockReset();
    fetchPromptExamplesMock.mockReset();
    fetchPromptExamplesMock.mockResolvedValue({
      examples: [
        { question: '示例问题 1' },
        { question: '示例问题 2' },
        { question: '示例问题 3' },
      ],
    });
  });

  it('sends message when clicking an example', async () => {
    const onSendMessage = vi.fn();

    render(<HomePage onNewChat={vi.fn()} onSendMessage={onSendMessage} />);

    // loading=true 时只渲染骨架，等 fetchPromptExamples resolve 后按钮才出现
    const exampleButtons = await screen.findAllByRole('button');
    fireEvent.click(exampleButtons[0]);

    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it('shows fallback examples immediately while remote examples are loading', () => {
    const onSendMessage = vi.fn();
    fetchPromptExamplesMock.mockReturnValue(new Promise(() => {}));

    render(<HomePage onNewChat={vi.fn()} onSendMessage={onSendMessage} />);

    const fallbackExample = screen.getByRole('button', { name: '写一个 Python 快速排序函数' });
    fireEvent.click(fallbackExample);

    expect(onSendMessage).toHaveBeenCalledWith('写一个 Python 快速排序函数');
  });

  it('preloads the chat message list chunk from the home page', async () => {
    render(<HomePage onNewChat={vi.fn()} onSendMessage={vi.fn()} />);

    await waitFor(() => {
      expect(preloadChatMessageListMock).toHaveBeenCalledTimes(1);
    });
  });
});
