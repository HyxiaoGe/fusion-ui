import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dispatchMock,
  replaceMock,
  getTokenMock,
  useAppDispatchMock,
  setTokenMock,
  fetchUserProfileMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  replaceMock: vi.fn(),
  getTokenMock: vi.fn(),
  useAppDispatchMock: vi.fn(),
  setTokenMock: vi.fn((token: string) => ({ type: 'auth/setToken', payload: token })),
  fetchUserProfileMock: vi.fn(() => ({ type: 'auth/fetchUserProfile' })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => ({
    get: getTokenMock,
  }),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: useAppDispatchMock,
}));

vi.mock('@/redux/slices/authSlice', () => ({
  setToken: setTokenMock,
  fetchUserProfile: fetchUserProfileMock,
}));

import AuthCallbackPage from './page';

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    replaceMock.mockReset();
    getTokenMock.mockReset();
    useAppDispatchMock.mockReturnValue(dispatchMock);
    setTokenMock.mockClear();
    fetchUserProfileMock.mockClear();
  });

  it('stores token, fetches profile and redirects home when token exists', async () => {
    getTokenMock.mockReturnValue('jwt-token');

    render(React.createElement(AuthCallbackPage));

    await waitFor(() => {
      expect(setTokenMock).toHaveBeenCalledWith('jwt-token');
      expect(fetchUserProfileMock).toHaveBeenCalledTimes(1);
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/setToken', payload: 'jwt-token' });
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/fetchUserProfile' });
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('redirects home directly when token is missing', async () => {
    getTokenMock.mockReturnValue(null);

    render(React.createElement(AuthCallbackPage));

    await waitFor(() => {
      expect(setTokenMock).not.toHaveBeenCalled();
      expect(fetchUserProfileMock).not.toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });
});
