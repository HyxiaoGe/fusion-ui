import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteFile,
  getConversationFiles,
  getFileStatus,
  getUploadTimeoutMs,
  uploadFiles,
} from './files';
import type { FileInfo } from './files';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

function createEnvelopeResponse(
  data: unknown,
  { code = 'SUCCESS', message = '', status = 200 }: { code?: string; message?: string; status?: number } = {}
): Response {
  const body = {
    code,
    message,
    data,
    request_id: 'test-request',
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('files api client', () => {
  it('deduplicates same-name files during upload and posts form data', async () => {
    fetchMock.mockResolvedValue(
      createEnvelopeResponse({
        files: [{ file_id: 'file-1' }],
      })
    );

    const duplicateA = new File(['hello'], 'same-name.txt', { type: 'text/plain' });
    const duplicateB = new File(['world'], 'same-name.txt', { type: 'text/plain' });

    const uploaded = await uploadFiles('qwen', 'qwen-max', 'chat-1', [duplicateA, duplicateB]);

    expect(uploaded).toEqual([{ file_id: 'file-1' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
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
    fetchMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(
        createEnvelopeResponse({
          files: [{ file_id: 'file-2' }],
        })
      );

    const uploaded = await uploadFiles(
      'qwen',
      'qwen-max',
      'chat-2',
      [new File(['retry'], 'retry.txt', { type: 'text/plain' })],
      undefined,
      1
    );

    expect(uploaded).toEqual([{ file_id: 'file-2' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('computes a timeout that keeps large single-file uploads alive past the old 25 second limit', () => {
    const largeFile = new File(
      [new Uint8Array(2 * 1024 * 1024)],
      'large-image.png',
      { type: 'image/png' }
    );

    expect(getUploadTimeoutMs([largeFile])).toBeGreaterThan(25000);
    expect(getUploadTimeoutMs([largeFile])).toBeGreaterThanOrEqual(120000);
  });

  it('surfaces a readable timeout message when upload aborts', async () => {
    const abortError = new DOMException('signal is aborted without reason', 'AbortError');
    fetchMock.mockRejectedValue(abortError);

    await expect(
      uploadFiles(
        'qwen',
        'qwen-max',
        'chat-timeout',
        [new File(['timeout'], 'timeout.png', { type: 'image/png' })]
      )
    ).rejects.toThrow('文件上传超时，请检查网络后重试');
  });

  it('returns conversation files from the authenticated endpoint', async () => {
    const backendFiles = [
      {
        id: 'file-1',
        filename: 'demo.png',
        mimetype: 'image/png',
        size: 12,
        created_at: null,
        status: 'processed',
        error_message: null,
        thumbnail_url: 'https://cdn.example.com/thumbs/file-1.png',
        thumbnail_key: 'thumbs/file-1.png',
        width: 640,
        height: 360,
      },
    ] satisfies FileInfo[];

    fetchMock.mockResolvedValue(
      createEnvelopeResponse({
        files: backendFiles,
      })
    );

    const files = await getConversationFiles('chat-3');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/files/conversation/chat-3'),
      expect.anything()
    );
    expect(files).toEqual([
      expect.objectContaining({
        id: 'file-1',
        filename: 'demo.png',
        thumbnail_url: 'https://cdn.example.com/thumbs/file-1.png',
        thumbnail_key: 'thumbs/file-1.png',
        width: 640,
        height: 360,
        created_at: null,
        error_message: null,
      }),
    ]);
  });

  it('surfaces backend detail when file status lookup fails', async () => {
    fetchMock.mockResolvedValue(
      createEnvelopeResponse(null, {
        code: 'NOT_FOUND',
        message: 'not found',
        status: 404,
      })
    );

    await expect(getFileStatus('missing-file')).rejects.toThrow('not found');
  });

  it('sends delete requests through the authenticated client', async () => {
    fetchMock.mockResolvedValue(createEnvelopeResponse(null));

    await deleteFile('file-9');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/files/file-9'),
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});
