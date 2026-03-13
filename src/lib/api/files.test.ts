import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithAuthMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
}));

vi.mock('./fetchWithAuth', () => ({
  default: fetchWithAuthMock,
}));

import {
  deleteFile,
  getConversationFiles,
  getFileStatus,
  uploadFiles,
} from './files';

function createJsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('files api client', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
  });

  it('deduplicates same-name files during upload and posts form data', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createJsonResponse({
        file_ids: ['file-1'],
      })
    );

    const duplicateA = new File(['hello'], 'same-name.txt', { type: 'text/plain' });
    const duplicateB = new File(['world'], 'same-name.txt', { type: 'text/plain' });

    const fileIds = await uploadFiles('qwen', 'qwen-max', 'chat-1', [duplicateA, duplicateB]);

    expect(fileIds).toEqual(['file-1']);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchWithAuthMock.mock.calls[0];
    expect(url).toContain('/api/files/upload');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(FormData);

    const bodyEntries = Array.from((options.body as FormData).entries());
    const postedFiles = bodyEntries
      .filter(([key]) => key === 'files')
      .map(([, value]) => value as File);

    expect(bodyEntries).toContainEqual(['provider', 'qwen']);
    expect(bodyEntries).toContainEqual(['model', 'qwen-max']);
    expect(bodyEntries).toContainEqual(['conversation_id', 'chat-1']);
    expect(postedFiles).toHaveLength(1);
    expect(postedFiles[0].name).toBe('same-name.txt');
  });

  it('retries upload once when the first request fails and retryCount is set', async () => {
    fetchWithAuthMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(
        createJsonResponse({
          file_ids: ['file-2'],
        })
      );

    const fileIds = await uploadFiles(
      'qwen',
      'qwen-max',
      'chat-2',
      [new File(['retry'], 'retry.txt', { type: 'text/plain' })],
      undefined,
      1
    );

    expect(fileIds).toEqual(['file-2']);
    expect(fetchWithAuthMock).toHaveBeenCalledTimes(2);
  });

  it('returns conversation files from the authenticated endpoint', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createJsonResponse({
        files: [
          {
            id: 'file-1',
            filename: 'demo.txt',
            mimetype: 'text/plain',
            size: 12,
            created_at: '2026-03-13T00:00:00Z',
            status: 'processed',
            error_message: '',
          },
        ],
      })
    );

    const files = await getConversationFiles('chat-3');

    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/files/conversation/chat-3')
    );
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('demo.txt');
  });

  it('surfaces backend detail when file status lookup fails', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createJsonResponse(
        {
          detail: 'not found',
        },
        false,
        404
      )
    );

    await expect(getFileStatus('missing-file')).rejects.toThrow('not found');
  });

  it('sends delete requests through the authenticated client', async () => {
    fetchWithAuthMock.mockResolvedValue(new Response(null, { status: 204 }));

    await deleteFile('file-9');

    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/files/file-9'),
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});
