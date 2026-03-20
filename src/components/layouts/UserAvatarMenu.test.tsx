import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';

import authReducer from '@/redux/slices/authSlice';
import conversationReducer from '@/redux/slices/conversationSlice';
import fileUploadReducer from '@/redux/slices/fileUploadSlice';
import modelsReducer from '@/redux/slices/modelsSlice';
import settingsReducer from '@/redux/slices/settingsSlice';
import streamReducer from '@/redux/slices/streamSlice';
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
      conversation: conversationReducer,
      stream: streamReducer,
      fileUpload: fileUploadReducer,
      models: modelsReducer,
    },
    preloadedState: {
      auth: preloadedAuth,
    },
  } as any);

  return render(
    <Provider store={store}>
      <UserAvatarMenu />
    </Provider>
  );
}

describe('UserAvatarMenu', () => {
  it('shows a clear login button when unauthenticated', () => {
    renderMenu({
      isAuthenticated: false,
      token: null,
      status: 'idle',
      error: null,
      user: null,
    });

    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy();
  });

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
