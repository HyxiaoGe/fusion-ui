/**
 * Bootstraps the shared SSO SDK (auth-client-web) for fusion-ui.
 *
 * configure() is bound to fusion's PRE-EXISTING localStorage keys (`auth_token` /
 * `auth_refresh_token`) so the migration is zero-logout: an already-signed-in user has no
 * `auth_token_expiry` yet, so the SDK treats the token as expired on first use and silently
 * refreshes (one round-trip) using the still-valid refresh token instead of logging out.
 *
 * The SDK's own user cache is kept on a separate key (`auth_user_info`) so it never clobbers
 * fusion's richer fusion-api profile (`user_profile`). Must run client-side (it reads
 * window.location.origin for the callback URL) and exactly once; both are enforced here so
 * callers can invoke it freely before any SDK use.
 */

import { configure } from 'auth-client-web';
import { AUTH_SERVICE_CONFIG, getAuthCallbackUrl } from '@/lib/config';

let configured = false;

/** Whether auth-service base URL + client_id are both wired up (env present). */
export function isAuthConfigured(): boolean {
  return Boolean(AUTH_SERVICE_CONFIG.BASE_URL && AUTH_SERVICE_CONFIG.CLIENT_ID);
}

export function configureAuth(): void {
  if (configured || typeof window === 'undefined') return;
  configure({
    authUrl: AUTH_SERVICE_CONFIG.BASE_URL,
    clientId: AUTH_SERVICE_CONFIG.CLIENT_ID,
    redirectUri: getAuthCallbackUrl(),
    storageKeys: {
      accessToken: 'auth_token',
      refreshToken: 'auth_refresh_token',
      expiresAt: 'auth_token_expiry',
      user: 'auth_user_info',
    },
  });
  configured = true;
}
