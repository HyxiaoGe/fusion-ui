import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import authReducer from '@/redux/slices/authSlice';
import settingsReducer from '@/redux/slices/settingsSlice';
import chatReducer from '@/redux/slices/chatSlice';
import fileUploadReducer from '@/redux/slices/fileUploadSlice';
import modelsReducer from '@/redux/slices/modelsSlice';
import { UserAvatarMenu } from './UserAvatarMenu';

vi.mock('@/components/auth/LoginDialog', () => ({
  LoginDialog: () => null,
}));

vi.mock('@/lib/auth/authService', () => ({
  revokeAuthSession: vi.fn(),
  getStoredAccessToken: vi.fn(() => null),
  clearAuthStorage: vi.fn(),
}));

function renderMenu(preloadedAuth: unknown) {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      settings: settingsReducer,
      chat: chatReducer,
      fileUpload: fileUploadReducer,
      models: modelsReducer,
    },
    preloadedState: {
      auth: preloadedAuth,
    },
  });

  return render(
    <Provider store={store}>
      <UserAvatarMenu />
    </Provider>
  );
}

describe('UserAvatarMenu', () => {
  it('prefers nickname over username for authenticated users', () => {
    renderMenu({
      isAuthenticated: true,
      token: 'token',
      status: 'succeeded',
      error: null,
      user: {
        id: 'user-1',
        username: '18889592303',
        nickname: 'Sean',
        avatar: null,
        email: 'sean@example.com',
        mobile: null,
      },
    });

    expect(screen.getByRole('button').textContent).toContain('S');
  });
});
