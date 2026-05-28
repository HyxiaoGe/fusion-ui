import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import { fetchStreamStatus } from './streamStatus';

describe('fetchStreamStatus', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('passes abort signal when checking stream status', async () => {
    const controller = new AbortController();
    apiRequestMock.mockResolvedValue({ status: 'done' });

    await fetchStreamStatus('chat-1', controller.signal);

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/stream-status/chat-1'),
      { signal: controller.signal },
    );
  });

  it('rethrows abort errors so callers can ignore stale checks', async () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' });
    apiRequestMock.mockRejectedValue(error);

    await expect(fetchStreamStatus('chat-1')).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('keeps treating normal request failures as not found', async () => {
    apiRequestMock.mockRejectedValue(new Error('network'));

    await expect(fetchStreamStatus('chat-1')).resolves.toEqual({
      status: 'not_found',
    });
  });
});
