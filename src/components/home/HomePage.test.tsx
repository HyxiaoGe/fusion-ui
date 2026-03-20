import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { currentState, useAppSelectorMock, toastMock } = vi.hoisted(() => ({
  currentState: {
    auth: {
      isAuthenticated: true,
    },
  } as any,
  useAppSelectorMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

import HomePage from './HomePage';

describe('HomePage', () => {
  beforeEach(() => {
    currentState.auth.isAuthenticated = true;
    useAppSelectorMock.mockImplementation((selector) => selector(currentState));
    toastMock.mockReset();
  });

  it('only sends one example message while the first example launch is pending', async () => {
    let resolveSend: (() => void) | null = null;
    const onSendMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );

    render(<HomePage onNewChat={vi.fn()} onSendMessage={onSendMessage} />);

    const exampleButton = screen.getByRole('button', { name: '生成工作周报模板' });
    fireEvent.click(exampleButton);
    fireEvent.click(exampleButton);

    expect(onSendMessage).toHaveBeenCalledTimes(1);

    resolveSend?.();
  });
});
