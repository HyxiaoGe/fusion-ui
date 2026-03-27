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

  it('sends message when clicking an example', async () => {
    const onSendMessage = vi.fn();

    render(<HomePage onNewChat={vi.fn()} onSendMessage={onSendMessage} />);

    const exampleButtons = screen.getAllByRole('button');
    fireEvent.click(exampleButtons[0]);

    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });
});
