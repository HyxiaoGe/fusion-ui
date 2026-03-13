import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentAuthState,
  appDispatchMock,
  reduxDispatchMock,
  useAppDispatchMock,
  useAppSelectorMock,
  initializeModelsMock,
  updateModelsMock,
  checkUserStateMock,
  fetchUserProfileMock,
  setGlobalToastMock,
} = vi.hoisted(() => ({
  currentAuthState: {
    isAuthenticated: false,
    status: 'idle',
  } as { isAuthenticated: boolean; status: 'idle' | 'loading' | 'succeeded' | 'failed' },
  appDispatchMock: vi.fn(),
  reduxDispatchMock: vi.fn(),
  useAppDispatchMock: vi.fn(),
  useAppSelectorMock: vi.fn(),
  initializeModelsMock: vi.fn(),
  updateModelsMock: vi.fn((models: unknown) => ({ type: 'models/updateModels', payload: models })),
  checkUserStateMock: vi.fn(() => ({ type: 'auth/checkUserState' })),
  fetchUserProfileMock: vi.fn(() => ({ type: 'auth/fetchUserProfile' })),
  setGlobalToastMock: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: useAppDispatchMock,
  useAppSelector: useAppSelectorMock,
}));

vi.mock('react-redux', async () => {
  const actual = await vi.importActual<typeof import('react-redux')>('react-redux');
  return {
    ...actual,
    useDispatch: () => reduxDispatchMock,
  };
});

vi.mock('@/lib/config/modelConfig', () => ({
  initializeModels: initializeModelsMock,
}));

vi.mock('@/redux/slices/modelsSlice', () => ({
  updateModels: updateModelsMock,
}));

vi.mock('@/redux/slices/authSlice', () => ({
  checkUserState: checkUserStateMock,
  fetchUserProfile: fetchUserProfileMock,
  setToken: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useToast: () => ({ show: vi.fn() }),
  setGlobalToast: setGlobalToastMock,
}));

vi.mock('@/components/auth/LoginDialog', () => ({
  LoginDialog: ({ open }: { open: boolean }) =>
    React.createElement('div', {
      'data-testid': 'login-dialog',
      'data-open': open ? 'true' : 'false',
    }),
}));

vi.mock('@/components/settings/SettingsDialog', () => ({
  SettingsDialog: () =>
    React.createElement('div', {
      'data-testid': 'settings-dialog',
    }),
}));

vi.mock('react-hot-toast', () => ({
  Toaster: () => null,
}));

import ClientLayout from './ClientLayout';

describe('ClientLayout', () => {
  beforeEach(() => {
    currentAuthState.isAuthenticated = false;
    currentAuthState.status = 'idle';
    appDispatchMock.mockReset();
    reduxDispatchMock.mockReset();
    useAppDispatchMock.mockReturnValue(appDispatchMock);
    useAppSelectorMock.mockImplementation(selector => selector({ auth: currentAuthState }));
    initializeModelsMock.mockReset();
    initializeModelsMock.mockResolvedValue([{ id: 'model-1' }]);
    updateModelsMock.mockClear();
    checkUserStateMock.mockClear();
    fetchUserProfileMock.mockClear();
    setGlobalToastMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes user profile when authenticated state is stale', async () => {
    currentAuthState.isAuthenticated = true;
    currentAuthState.status = 'idle';

    render(
      React.createElement(
        ClientLayout,
        null,
        React.createElement('div', null, 'child')
      )
    );

    await waitFor(() => {
      expect(checkUserStateMock).toHaveBeenCalledTimes(1);
      expect(fetchUserProfileMock).toHaveBeenCalledTimes(1);
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/checkUserState' });
      expect(appDispatchMock).toHaveBeenCalledWith({ type: 'auth/fetchUserProfile' });
    });
  });

  it('loads models and opens login dialog for unauthenticated users after delay', async () => {
    render(
      React.createElement(
        ClientLayout,
        null,
        React.createElement('div', null, 'child')
      )
    );

    await waitFor(() => {
      expect(initializeModelsMock).toHaveBeenCalledTimes(1);
      expect(updateModelsMock).toHaveBeenCalledWith([{ id: 'model-1' }]);
      expect(reduxDispatchMock).toHaveBeenCalledWith({
        type: 'models/updateModels',
        payload: [{ id: 'model-1' }],
      });
    });

    expect(screen.getByTestId('login-dialog').getAttribute('data-open')).toBe('false');

    await new Promise(resolve => setTimeout(resolve, 1100));

    await waitFor(() => {
      expect(screen.getByTestId('login-dialog').getAttribute('data-open')).toBe('true');
    });
  });
});
