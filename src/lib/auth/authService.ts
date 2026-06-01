/**
 * Auth helpers for fusion-ui — thin adapter over the shared SSO SDK (auth-client-web).
 *
 * The token lifecycle (PKCE login, callback exchange, on-demand refresh, revoke) lives in
 * the SDK; this module only wires fusion's call sites to it and keeps the localStorage
 * helpers that fusion's Redux slice + fetch layer already depend on. fusion keeps fetching
 * its own richer profile from fusion-api (`/api/auth/me`); the SDK only owns the tokens.
 */

import {
  getAccessToken as sdkGetAccessToken,
  handleCallback as sdkHandleCallback,
  login as sdkLogin,
  logout as sdkLogout,
  refresh as sdkRefresh,
  type CallbackResult,
} from 'auth-client-web';
import { configureAuth } from './auth-sdk';

const ACCESS_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const EXPIRES_AT_KEY = 'auth_token_expiry';
const SDK_USER_KEY = 'auth_user_info';
const USER_PROFILE_KEY = 'user_profile';
const USER_PROFILE_TIMESTAMP_KEY = 'user_profile_timestamp';

type OAuthProvider = 'github' | 'google';

/** Interactive login: top-level redirect to /auth/authorize (PKCE + state). */
export async function startSsoLogin(
  provider: OAuthProvider,
  redirectPath?: string
): Promise<void> {
  configureAuth();
  await sdkLogin(provider, redirectPath ? { redirectPath } : undefined);
}

/** Complete the auth-service callback on the redirect_uri page (CSRF + PKCE enforced). */
export async function completeSsoCallback(): Promise<CallbackResult> {
  configureAuth();
  return sdkHandleCallback();
}

/** Valid access token, auto-refreshing if within the expiry skew. May throw on transient network errors. */
export async function getValidAccessToken(): Promise<string | null> {
  configureAuth();
  return sdkGetAccessToken();
}

/** Force a token refresh (coalesced). Returns null only on a definitive refresh failure. */
export function forceRefreshAccessToken(): Promise<string | null> {
  configureAuth();
  return sdkRefresh();
}

/** Best-effort revoke of this app's refresh token + clear of the SDK-managed session. */
export async function revokeSsoSession(): Promise<void> {
  configureAuth();
  await sdkLogout();
}

export function clearAuthStorage(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(SDK_USER_KEY);
  localStorage.removeItem(USER_PROFILE_KEY);
  localStorage.removeItem(USER_PROFILE_TIMESTAMP_KEY);
}

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}
