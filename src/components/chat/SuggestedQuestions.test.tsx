import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentState,
  useAppSelectorMock,
  toastMock,
  triggerLoginDialogMock,
} = vi.hoisted(() => ({
  currentState: {
    auth: {
      isAuthenticated: true,
    },
  } as any,
  useAppSelectorMock: vi.fn(),
  toastMock: vi.fn(),
  triggerLoginDialogMock: vi.fn(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

import SuggestedQuestions from './SuggestedQuestions';

describe('SuggestedQuestions', () => {
  beforeEach(() => {
    useAppSelectorMock.mockImplementation((selector) => selector(currentState));
    toastMock.mockReset();
    triggerLoginDialogMock.mockReset();
    currentState.auth.isAuthenticated = true;
    vi.stubGlobal('triggerLoginDialog', triggerLoginDialogMock);
  });

  it('disables repeated selection after a question is chosen', () => {
    const onSelectQuestion = vi.fn();

    render(
      <SuggestedQuestions
        questions={['问题一', '问题二']}
        isLoading={false}
        onSelectQuestion={onSelectQuestion}
      />
    );

    const firstQuestion = screen.getByRole('button', { name: /问题一/ });
    fireEvent.click(firstQuestion);
    fireEvent.click(firstQuestion);

    expect(onSelectQuestion).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /发送中/ }).hasAttribute('disabled')).toBe(true);
  });

  it('blocks selection for unauthenticated users', () => {
    currentState.auth.isAuthenticated = false;
    const onSelectQuestion = vi.fn();

    render(
      <SuggestedQuestions
        questions={['问题一']}
        isLoading={false}
        onSelectQuestion={onSelectQuestion}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /问题一/ }));

    expect(onSelectQuestion).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '请先登录后再使用聊天功能',
        type: 'warning',
      })
    );
    expect(triggerLoginDialogMock).toHaveBeenCalledTimes(1);
  });

  it('shows refresh busy state while loading', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <SuggestedQuestions
        questions={['问题一']}
        isLoading={false}
        onSelectQuestion={vi.fn()}
        onRefresh={onRefresh}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /换一批/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(
      <SuggestedQuestions
        questions={['问题一']}
        isLoading={true}
        onSelectQuestion={vi.fn()}
        onRefresh={onRefresh}
      />
    );

    expect(screen.getByRole('button', { name: /更新中/ }).hasAttribute('disabled')).toBe(true);
  });

  it('renders nothing when questions are empty and not loading', () => {
    const { container } = render(
      <SuggestedQuestions
        questions={[]}
        isLoading={false}
        onSelectQuestion={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(container.innerHTML).toBe('');
  });
});
