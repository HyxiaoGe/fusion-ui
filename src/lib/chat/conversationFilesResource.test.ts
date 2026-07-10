import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileInfo } from '@/lib/api/files';

const getConversationFilesMock = vi.fn();

import {
  getConversationFilesCacheEntry,
  getOrStartConversationFilesRequest,
  invalidateAllConversationFiles,
  resetConversationFilesResource,
} from './conversationFilesResource';

function createFile(id: string): FileInfo {
  return {
    id,
    filename: `${id}.txt`,
    mimetype: 'text/plain',
    size: 128,
    created_at: '2026-07-03T00:00:00Z',
    status: 'processed',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('conversationFilesResource', () => {
  beforeEach(() => {
    resetConversationFilesResource();
    getConversationFilesMock.mockReset();
  });

  it('资料成功缓存最多保留 100 个 conversation，超过后淘汰最早条目', async () => {
    getConversationFilesMock.mockImplementation((conversationId: string) => (
      Promise.resolve([createFile(`${conversationId}-file`)])
    ));

    for (let index = 0; index <= 100; index += 1) {
      await getOrStartConversationFilesRequest(
        `chat-${index}`,
        false,
        getConversationFilesMock,
      ).promise;
    }

    expect(getConversationFilesCacheEntry('chat-0')).toBeNull();
    expect(getConversationFilesCacheEntry('chat-1')?.files).toEqual([createFile('chat-1-file')]);
    expect(getConversationFilesCacheEntry('chat-100')?.files).toEqual([createFile('chat-100-file')]);
  });

  it('全量 invalidation 清空缓存和 singleflight，旧请求迟到不会回写且后续真实 GET', async () => {
    const oldRequest = deferred<FileInfo[]>();
    const newRequest = deferred<FileInfo[]>();
    getConversationFilesMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const staleLoad = getOrStartConversationFilesRequest(
      'chat-a',
      false,
      getConversationFilesMock,
    );

    invalidateAllConversationFiles();

    const freshLoad = getOrStartConversationFilesRequest(
      'chat-a',
      false,
      getConversationFilesMock,
    );
    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);

    oldRequest.resolve([createFile('stale-file')]);
    await expect(staleLoad.promise).resolves.toMatchObject({ accepted: false });
    expect(getConversationFilesCacheEntry('chat-a')).toBeNull();

    const freshFiles = [createFile('fresh-file')];
    newRequest.resolve(freshFiles);
    await expect(freshLoad.promise).resolves.toMatchObject({ accepted: true, files: freshFiles });
    expect(getConversationFilesCacheEntry('chat-a')?.files).toEqual(freshFiles);
  });

  it('全量 invalidation 清空已成功缓存，下一次读取必须真实 GET', async () => {
    const initialFiles = [createFile('initial-file')];
    const refreshedFiles = [createFile('refreshed-file')];
    getConversationFilesMock
      .mockResolvedValueOnce(initialFiles)
      .mockResolvedValueOnce(refreshedFiles);

    await getOrStartConversationFilesRequest('chat-a', false, getConversationFilesMock).promise;
    expect(getConversationFilesCacheEntry('chat-a')?.files).toEqual(initialFiles);

    invalidateAllConversationFiles();
    expect(getConversationFilesCacheEntry('chat-a')).toBeNull();

    await getOrStartConversationFilesRequest('chat-a', false, getConversationFilesMock).promise;
    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);
    expect(getConversationFilesCacheEntry('chat-a')?.files).toEqual(refreshedFiles);
  });
});
