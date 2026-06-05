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
import { clearSsoReturn } from './sso-probe';
import { API_CONFIG } from '../config';

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
  // 交互式登录前清掉残留的静默探测原始路径，避免被放弃的探测劫持本次登录的重定向目标。
  clearSsoReturn();
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

/**
 * Read-only single-logout liveness probe. Hits a denylist-protected fusion-api endpoint
 * (`/api/auth/me` → `get_current_user`, which consults the shared-Redis SLO revocation marker)
 * with the supplied access token, DELIBERATELY using a raw fetch instead of fetchWithAuth — the
 * latter force-refreshes on 401, which is exactly the rotation churn we are removing from the
 * focus path. A token revoked by a logout in another app still has a valid RS256 signature but is
 * rejected here with 401. Throws an Error whose message carries the HTTP status on any non-2xx, so
 * the caller can tell a definitive auth rejection (401/403 → logged out elsewhere) apart from a
 * transient failure (5xx / network throw → keep the session). This performs NO token rotation.
 */
export async function probeSessionLiveness(token: string): Promise<void> {
  const response = await fetch(`${API_CONFIG.BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`liveness probe failed (${response.status})`);
  }
}

/**
 * Best-effort GLOBAL single-logout: revoke this app's refresh token + clear the SDK session,
 * then top-level POST-form to /auth/logout to destroy the shared IdP session — so logging out
 * of fusion logs the user out of every SSO app（一处登出、处处登出）, not just fusion. Without
 * `{ global: true }` the IdP session would survive and silently re-log-in the user on next load.
 */
export async function revokeSsoSession(): Promise<void> {
  configureAuth();
  await sdkLogout({ global: true });
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
