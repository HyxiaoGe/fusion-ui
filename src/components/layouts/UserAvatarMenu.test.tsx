import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import authReducer from '@/redux/slices/authSlice';
import conversationReducer from '@/redux/slices/conversationSlice';
import fileUploadReducer from '@/redux/slices/fileUploadSlice';
import modelsReducer from '@/redux/slices/modelsSlice';
import settingsReducer from '@/redux/slices/settingsSlice';
import streamReducer from '@/redux/slices/streamSlice';
import { useHasMounted } from '@/hooks/useHasMounted';
import { UserAvatarMenu } from './UserAvatarMenu';

vi.mock('@/components/auth/LoginDialog', () => ({
  LoginDialog: () => null,
}));

// Hydration gate: auth state is client-only (localStorage), so SSR + the first hydration frame
// cannot know it. Default the gate to "mounted" so the existing terminal-state assertions hold;
// a single test flips it to false to assert the pre-hydration neutral placeholder.
vi.mock('@/hooks/useHasMounted', () => ({ useHasMounted: vi.fn(() => true) }));

vi.mock('@/lib/auth/authService', () => ({
  completeSsoCallback: vi.fn(),
  revokeSsoSession: vi.fn(),
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
  beforeEach(() => {
    vi.mocked(useHasMounted).mockReturnValue(true);
  });

  // #4 root fix: SSR has no localStorage, so getInitialAuthState() yields isAuthenticated=false
  // and the server HTML paints the 登录 button; on a logged-in user that paints-then-swaps to the
  // avatar, flashing the login button for one frame. Until the client has hydrated we must render
  // NEITHER terminal state — only a neutral, same-footprint placeholder.
  it('before hydration (not yet mounted): renders a neutral placeholder, neither 登录 nor avatar', () => {
    vi.mocked(useHasMounted).mockReturnValue(false);
    renderMenu({
      isAuthenticated: false, // SSR/first-frame default — must NOT leak as the 登录 button
      token: null,
      status: 'idle',
      error: null,
      user: null,
    });

    expect(screen.getByTestId('avatar-menu-placeholder')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  // Regression (cross-app SSO / token-refresh window): on a fresh load where the user is signed
  // in at the IdP but fusion has no local token yet, isAuthenticated is false WHILE a silent SSO
  // recovery is in flight (sessionResolved=false). Even after mounting, the avatar must stay on
  // the neutral placeholder — showing the 登录 button here flashes it for a frame before the
  // silent login completes and swaps in the avatar. Only a DEFINITIVE logged-out verdict reveals 登录.
  it('while the session is unresolved (silent SSO recovery in flight): placeholder, not 登录', () => {
    renderMenu({
      isAuthenticated: false,
      token: null,
      status: 'idle',
      error: null,
      user: null,
      sessionResolved: false,
    });

    expect(screen.getByTestId('avatar-menu-placeholder')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '登录' })).toBeNull();
  });

  it('shows a clear login button when unauthenticated AND the session is resolved (logged-out)', () => {
    renderMenu({
      isAuthenticated: false,
      token: null,
      status: 'idle',
      error: null,
      user: null,
      sessionResolved: true,
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
