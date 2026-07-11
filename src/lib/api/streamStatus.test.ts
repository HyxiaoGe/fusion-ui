import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import { fetchStreamStatus, StreamStatusRequestError } from './streamStatus';

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

  it('keeps a real backend not_found status', async () => {
    apiRequestMock.mockResolvedValue({ status: 'not_found' });

    await expect(fetchStreamStatus('chat-1')).resolves.toEqual({
      status: 'not_found',
    });
  });

  it('preserves continuation stream mode from backend', async () => {
    apiRequestMock.mockResolvedValue({
      status: 'streaming',
      message_id: 'assistant-1',
      stream_mode: 'continuation',
    });

    await expect(fetchStreamStatus('chat-1')).resolves.toEqual({
      status: 'streaming',
      message_id: 'assistant-1',
      stream_mode: 'continuation',
    });
  });

  it('wraps network failures as typed recoverable errors instead of not_found', async () => {
    apiRequestMock.mockRejectedValue(new Error('network'));

    await expect(fetchStreamStatus('chat-1')).rejects.toEqual(
      expect.objectContaining({
        name: 'StreamStatusRequestError',
        recoverable: true,
      }),
    );
  });

  it('wraps authentication failures as typed nonrecoverable errors', async () => {
    apiRequestMock.mockRejectedValue(new ApiError('UNAUTHORIZED', '请重新登录', 'req-1'));

    const promise = fetchStreamStatus('chat-1');
    await expect(promise).rejects.toBeInstanceOf(StreamStatusRequestError);
    await expect(promise).rejects.toEqual(
      expect.objectContaining({
        recoverable: false,
        code: 'UNAUTHORIZED',
      }),
    );
  });
});
