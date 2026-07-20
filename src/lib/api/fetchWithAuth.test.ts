import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getValidAccessTokenMock,
  forceRefreshAccessTokenMock,
  getStoredAccessTokenMock,
  clearAuthStorageMock,
} = vi.hoisted(() => ({
  getValidAccessTokenMock: vi.fn(),
  forceRefreshAccessTokenMock: vi.fn(),
  getStoredAccessTokenMock: vi.fn(),
  clearAuthStorageMock: vi.fn(),
}));

vi.mock('@/lib/auth/authService', () => ({
  getValidAccessToken: getValidAccessTokenMock,
  forceRefreshAccessToken: forceRefreshAccessTokenMock,
  getStoredAccessToken: getStoredAccessTokenMock,
  clearAuthStorage: clearAuthStorageMock,
}));

import fetchWithAuth, { apiRequest } from './fetchWithAuth';
import {
  beginAuthSessionTransition,
  completeAuthSessionTransition,
  resetAuthSessionTransitionForTests,
} from '@/lib/auth/sessionTransition';

const res = (status: number) => new Response('{}', { status });

describe('fetchWithAuth (shared-SDK token lifecycle)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthSessionTransitionForTests();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the SDK-provided access token as a bearer header and preserves caller headers', async () => {
    getValidAccessTokenMock.mockResolvedValue('valid-token');
    fetchMock.mockResolvedValue(res(200));

    await fetchWithAuth('/api/test', { method: 'POST', headers: { 'X-Test': 'yes' } });

    const init = fetchMock.mock.calls[0][1];
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer valid-token');
    expect(headers.get('X-Test')).toBe('yes');
  });

  it('force-refreshes and retries once with the rotated token on 401', async () => {
    getValidAccessTokenMock.mockResolvedValue('stale-token');
    forceRefreshAccessTokenMock.mockResolvedValue('rotated-token');
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200));

    const out = await fetchWithAuth('/api/test');

    expect(out.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('Authorization')).toBe(
      'Bearer rotated-token'
    );
    expect(clearAuthStorageMock).not.toHaveBeenCalled();
  });

  it('clears storage and throws when a 401 refresh fails definitively', async () => {
    getValidAccessTokenMock.mockResolvedValue('stale-token');
    forceRefreshAccessTokenMock.mockResolvedValue(null);
    fetchMock.mockResolvedValueOnce(res(401));

    await expect(fetchWithAuth('/api/test')).rejects.toThrow('Unauthorized');
    expect(clearAuthStorageMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the session (no clear) when the 401 refresh fails on a TRANSIENT network error', async () => {
    getValidAccessTokenMock.mockResolvedValue('stale-token');
    forceRefreshAccessTokenMock.mockRejectedValue(new TypeError('network down'));
    fetchMock.mockResolvedValueOnce(res(401));

    await expect(fetchWithAuth('/api/test')).rejects.toThrow('Unauthorized');
    expect(clearAuthStorageMock).not.toHaveBeenCalled();
  });

  it('falls back to the stored token when proactive refresh throws transiently', async () => {
    getValidAccessTokenMock.mockRejectedValue(new TypeError('network blip'));
    getStoredAccessTokenMock.mockReturnValue('stored-token');
    fetchMock.mockResolvedValue(res(200));

    await fetchWithAuth('/api/test');

    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe(
      'Bearer stored-token'
    );
  });

  it('clears fusion storage when proactive resolution yields null (definitive SDK teardown), even without a 401', async () => {
    // SDK refresh failed definitively and already wiped its own keys; getValidAccessToken returns null.
    // The request still goes out (unauthenticated). For a PUBLIC endpoint it returns 200, so the 401
    // cleanup never runs — fusion's profile keys must be cleared here to stay symmetric with the 401 path.
    getValidAccessTokenMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(res(200));

    await fetchWithAuth('/api/models/');

    expect(clearAuthStorageMock).toHaveBeenCalledTimes(1);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBeNull();
  });

  it('取到 A token 期间即使 B 已完成切换，也不会把 A token 注册到 B epoch', async () => {
    let resolveToken!: (token: string) => void;
    getValidAccessTokenMock.mockReturnValue(new Promise<string>((resolve) => {
      resolveToken = resolve;
    }));

    const pending = fetchWithAuth('/api/private');
    beginAuthSessionTransition();
    completeAuthSessionTransition();
    resolveToken('token-a');

    await expect(pending).rejects.toMatchObject({ code: 'AUTH_SESSION_TRANSITION' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('apiRequest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getValidAccessTokenMock.mockResolvedValue('valid-token');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('将 HTML 错误页转换成可读的 API 错误', async () => {
    fetchMock.mockResolvedValue(
      new Response('<!DOCTYPE html><html><body>Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    await expect(apiRequest('/api/admin/search-usage')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'BAD_RESPONSE',
      message: '请求返回了非 JSON 内容',
    });
  });
});
