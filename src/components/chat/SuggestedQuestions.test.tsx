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

  it('将推荐问题展示为完成态后的轻量 follow-up 区域', () => {
    const { container } = render(
      <SuggestedQuestions
        questions={['问题一']}
        isLoading={false}
        onSelectQuestion={vi.fn()}
        className="custom-follow-up"
      />
    );

    const root = container.firstElementChild;
    expect(root?.className).toContain('border-t');
    expect(root?.className).toContain('border-border/40');
    expect(root?.className).toContain('pt-3');
    expect(root?.className).toContain('custom-follow-up');
  });

  it('使用紧凑低权重的推荐问题按钮样式', () => {
    render(
      <SuggestedQuestions
        questions={['问题一']}
        isLoading={false}
        onSelectQuestion={vi.fn()}
      />
    );

    const question = screen.getByRole('button', { name: /问题一/ });
    expect(question.className).not.toContain('py-2.5');
    expect(question.className).toContain('rounded-md');
    expect(question.className).toContain('py-1.5');
    expect(question.className).toContain('border-border/50');
    expect(question.className).toContain('bg-transparent');
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

  it('shows completion-state loading copy while generating suggestions', () => {
    render(
      <SuggestedQuestions
        questions={[]}
        isLoading={true}
        onSelectQuestion={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText('正在生成可继续追问的问题...')).toBeTruthy();
  });

  it('uses stronger pending affordance after selecting a question', () => {
    const onSelectQuestion = vi.fn();

    render(
      <SuggestedQuestions
        questions={['继续解释搜索结果']}
        isLoading={false}
        onSelectQuestion={onSelectQuestion}
      />,
    );

    const question = screen.getByRole('button', { name: /继续解释搜索结果/ });
    fireEvent.click(question);

    const pending = screen.getByRole('button', { name: /发送中/ });
    expect(pending.className).toContain('border-info-border');
    expect(pending.className).toContain('bg-info-bg');
  });
});
