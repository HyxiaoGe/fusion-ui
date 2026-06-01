import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configureMock } = vi.hoisted(() => ({ configureMock: vi.fn() }));

vi.mock('auth-client-web', () => ({ configure: configureMock }));

vi.mock('@/lib/config', () => ({
  AUTH_SERVICE_CONFIG: {
    BASE_URL: 'https://auth.dev.example',
    CLIENT_ID: 'fusion-app',
    CALLBACK_URL: '',
  },
  getAuthCallbackUrl: () => 'https://fusion.dev.example/auth/callback',
}));

describe('configureAuth (fusion shared-SDK adapter)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("binds the SDK to fusion's existing localStorage keys (zero-logout migration)", async () => {
    const { configureAuth } = await import('./auth-sdk');

    configureAuth();

    expect(configureMock).toHaveBeenCalledWith({
      authUrl: 'https://auth.dev.example',
      clientId: 'fusion-app',
      redirectUri: 'https://fusion.dev.example/auth/callback',
      storageKeys: {
        accessToken: 'auth_token',
        refreshToken: 'auth_refresh_token',
        expiresAt: 'auth_token_expiry',
        user: 'auth_user_info',
      },
    });
  });

  it('configures the SDK at most once across repeated calls', async () => {
    const { configureAuth } = await import('./auth-sdk');

    configureAuth();
    configureAuth();
    configureAuth();

    expect(configureMock).toHaveBeenCalledTimes(1);
  });

  it('reports configured when auth base url and client id are both present', async () => {
    const { isAuthConfigured } = await import('./auth-sdk');

    expect(isAuthConfigured()).toBe(true);
  });
});
