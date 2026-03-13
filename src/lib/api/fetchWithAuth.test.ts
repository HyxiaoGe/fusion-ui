import fetchWithAuth from './fetchWithAuth';

describe('fetchWithAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('adds bearer token when auth_token exists', async () => {
    localStorage.setItem('auth_token', 'token-123');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200 })
    );

    await fetchWithAuth('/api/test', {
      method: 'POST',
      headers: {
        'X-Test': 'yes',
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const headers = new Headers(options?.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('X-Test')).toBe('yes');
  });

  it('clears local auth data and throws on 401', async () => {
    localStorage.setItem('auth_token', 'token-123');
    localStorage.setItem('user_profile', '{"id":"user-1"}');
    localStorage.setItem('user_profile_timestamp', '123');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }));

    await expect(fetchWithAuth('/api/test')).rejects.toThrow('Unauthorized');

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_profile')).toBeNull();
    expect(localStorage.getItem('user_profile_timestamp')).toBeNull();
  });
});
