import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dispatchMock,
  replaceMock,
  getSearchParamMock,
  useAppDispatchMock,
  setTokenMock,
  fetchUserProfileMock,
  exchangeAuthCodeMock,
  storeAuthSessionMock,
  toastMock,
} = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  replaceMock: vi.fn(),
  getSearchParamMock: vi.fn(),
  useAppDispatchMock: vi.fn(),
  setTokenMock: vi.fn((token: string) => ({ type: 'auth/setToken', payload: token })),
  fetchUserProfileMock: vi.fn(() => ({ type: 'auth/fetchUserProfile' })),
  exchangeAuthCodeMock: vi.fn(),
  storeAuthSessionMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
  useSearchParams: () => ({
    get: getSearchParamMock,
  }),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: useAppDispatchMock,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock('@/redux/slices/authSlice', () => ({
  setToken: setTokenMock,
  fetchUserProfile: fetchUserProfileMock,
}));

vi.mock('@/lib/auth/authService', () => ({
  exchangeAuthCode: exchangeAuthCodeMock,
  storeAuthSession: storeAuthSessionMock,
}));

import AuthCallbackPage from './page';

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    replaceMock.mockReset();
    getSearchParamMock.mockReset();
    useAppDispatchMock.mockReturnValue(dispatchMock);
    setTokenMock.mockClear();
    fetchUserProfileMock.mockClear();
    exchangeAuthCodeMock.mockReset();
    storeAuthSessionMock.mockReset();
    toastMock.mockReset();
  });

  it('exchanges auth code, stores session and redirects home', async () => {
    getSearchParamMock.mockImplementation((key: string) => {
      if (key === 'code') return 'auth-code';
      return null;
    });
    exchangeAuthCodeMock.mockResolvedValue({
      access_token: 'jwt-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    });

    render(React.createElement(AuthCallbackPage));

    await waitFor(() => {
      expect(exchangeAuthCodeMock).toHaveBeenCalledWith('auth-code');
      expect(storeAuthSessionMock).toHaveBeenCalledWith({
        access_token: 'jwt-token',
        refresh_token: 'refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
      });
      expect(setTokenMock).toHaveBeenCalledWith('jwt-token');
      expect(fetchUserProfileMock).toHaveBeenCalledTimes(1);
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/setToken', payload: 'jwt-token' });
      expect(dispatchMock).toHaveBeenCalledWith({ type: 'auth/fetchUserProfile' });
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('still accepts legacy token callbacks', async () => {
    getSearchParamMock.mockImplementation((key: string) => {
      if (key === 'token') return 'legacy-token';
      return null;
    });

    render(React.createElement(AuthCallbackPage));

    await waitFor(() => {
      expect(exchangeAuthCodeMock).not.toHaveBeenCalled();
      expect(setTokenMock).toHaveBeenCalledWith('legacy-token');
      expect(fetchUserProfileMock).toHaveBeenCalledTimes(1);
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });

  it('redirects home directly when auth params are missing', async () => {
    getSearchParamMock.mockReturnValue(null);

    render(React.createElement(AuthCallbackPage));

    await waitFor(() => {
      expect(setTokenMock).not.toHaveBeenCalled();
      expect(fetchUserProfileMock).not.toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
  });
});
