import { beforeEach, describe, expect, it, vi } from 'vitest';

// The probe redirects via the SDK's silentLogin (prompt=none). Fake that boundary + configureAuth
// so the test asserts the guard/capture logic, not the SDK redirect itself.
vi.mock('auth-client-web', () => ({
  silentLogin: vi.fn(async () => undefined),
}));
vi.mock('@/lib/auth/auth-sdk', () => ({
  configureAuth: vi.fn(),
}));

import { silentLogin } from 'auth-client-web';
import { configureAuth } from '@/lib/auth/auth-sdk';

import { clearSsoReturn, isSafeReturnPath, markSsoProbed, maybeSilentLogin, takeSsoReturnPath } from './sso-probe';

const mockedSilentLogin = vi.mocked(silentLogin);
const mockedConfigureAuth = vi.mocked(configureAuth);

const PROBED_KEY = 'fusion_sso_probed';
const RETURN_KEY = 'fusion_sso_return';
const ACCESS_TOKEN_KEY = 'auth_token';

describe('sso-probe: one-shot silent SSO on app load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('fires once when there is no token, captures the origin path and sets the loop guard', () => {
    const fired = maybeSilentLogin('/chat/42?tab=files');

    expect(fired).toBe(true);
    expect(mockedConfigureAuth).toHaveBeenCalledTimes(1);
    expect(mockedSilentLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(PROBED_KEY)).toBe('1');
    expect(sessionStorage.getItem(RETURN_KEY)).toBe('/chat/42?tab=files');
  });

  it('does NOT capture a protocol-relative path (open-redirect guard): stores "/" instead of //evil.com', () => {
    // window.location.pathname can literally be "//evil.com/x" (browsers do not collapse the
    // leading double slash); fed unchecked to router.replace it navigates off-origin.
    const fired = maybeSilentLogin('//evil.com/x?a=1');

    expect(fired).toBe(true); // probe still fires (user has no token)
    expect(sessionStorage.getItem(RETURN_KEY)).toBe('/'); // but the off-origin path is rejected
  });

  it('normalizes a backslash-prefixed path that resolves off-origin to a safe "/" capture', () => {
    maybeSilentLogin('/\\evil.com');

    expect(sessionStorage.getItem(RETURN_KEY)).toBe('/');
  });

  it('does NOT fire when a local access token already exists', () => {
    localStorage.setItem(ACCESS_TOKEN_KEY, 'tok');

    expect(maybeSilentLogin('/chat')).toBe(false);
    expect(mockedSilentLogin).not.toHaveBeenCalled();
  });

  it('does NOT fire a second time once the guard is set (no redirect loop)', () => {
    sessionStorage.setItem(PROBED_KEY, '1');

    expect(maybeSilentLogin('/chat')).toBe(false);
    expect(mockedSilentLogin).not.toHaveBeenCalled();
  });

  it('does NOT fire while on the callback path (mid token-exchange)', () => {
    expect(maybeSilentLogin('/auth/callback?code=abc&state=xyz')).toBe(false);
    expect(mockedSilentLogin).not.toHaveBeenCalled();
  });

  it('markSsoProbed suppresses any later probe (used by logout to block silent re-login)', () => {
    markSsoProbed();
    expect(sessionStorage.getItem(PROBED_KEY)).toBe('1');
    expect(maybeSilentLogin('/chat')).toBe(false);
    expect(mockedSilentLogin).not.toHaveBeenCalled();
  });

  it('takeSsoReturnPath reads and clears the captured origin', () => {
    sessionStorage.setItem(RETURN_KEY, '/settings');
    expect(takeSsoReturnPath()).toBe('/settings');
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
    expect(takeSsoReturnPath()).toBeNull();
  });

  it('clearSsoReturn drops a stale captured origin (so it cannot hijack a later interactive login)', () => {
    sessionStorage.setItem(RETURN_KEY, '/chat');
    clearSsoReturn();
    expect(sessionStorage.getItem(RETURN_KEY)).toBeNull();
  });

  it('writes the PROBED guard BEFORE firing the redirect (anti-loop ordering invariant)', () => {
    // The #1 invariant: the guard must be persisted before the top-level redirect, else a real
    // browser could navigate away before the guard lands and re-probe in a loop.
    let probedAtRedirect: string | null = 'UNSET';
    mockedSilentLogin.mockImplementation(async () => {
      probedAtRedirect = sessionStorage.getItem(PROBED_KEY);
    });

    maybeSilentLogin('/chat');

    expect(probedAtRedirect).toBe('1');
  });

  it('gives up (returns false, no redirect) when sessionStorage write throws — never risk a loop', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(maybeSilentLogin('/chat')).toBe(false);
    expect(mockedSilentLogin).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  it('isSafeReturnPath accepts same-origin relative paths and rejects off-origin vectors', () => {
    expect(isSafeReturnPath('/chat/42?tab=files')).toBe(true);
    expect(isSafeReturnPath('/')).toBe(true);
    expect(isSafeReturnPath('//evil.com')).toBe(false);
    expect(isSafeReturnPath('/\\evil.com')).toBe(false);
    expect(isSafeReturnPath('///evil.com')).toBe(false);
  });
});
