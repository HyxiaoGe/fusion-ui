import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchMock, replaceMock, completeLoginMock, toastMock, unwrapMock } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  replaceMock: vi.fn(),
  completeLoginMock: vi.fn(() => ({ type: 'auth/completeLogin' })),
  toastMock: vi.fn(),
  unwrapMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock('@/redux/slices/authSlice', () => ({
  completeLogin: completeLoginMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

import AuthCallbackPage from './page';

describe('AuthCallbackPage (SDK callback)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // dispatch(completeLogin()) returns a thenable with .unwrap() (RTK thunk dispatch)
    dispatchMock.mockReturnValue({ unwrap: unwrapMock });
  });

  it('dispatches completeLogin and redirects to the resolved path on success', async () => {
    unwrapMock.mockResolvedValue({ redirectPath: '/chat/9' });

    render(React.createElement(AuthCallbackPage));

    await waitFor(() => {
      expect(completeLoginMock).toHaveBeenCalledTimes(1);
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/completeLogin' });
      expect(replaceMock).toHaveBeenCalledWith('/chat/9');
      expect(toastMock).not.toHaveBeenCalled();
    });
  });

  it('toasts an error and soft-lands at "/" when the callback fails', async () => {
    unwrapMock.mockRejectedValue('state mismatch');

    render(React.createElement(AuthCallbackPage));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledTimes(1);
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });
});
