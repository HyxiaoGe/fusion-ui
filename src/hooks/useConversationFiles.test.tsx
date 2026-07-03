import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileInfo } from '@/lib/api/files';

const { getConversationFilesMock } = vi.hoisted(() => ({
  getConversationFilesMock: vi.fn(),
}));

vi.mock('@/lib/api/files', () => ({
  getConversationFiles: getConversationFilesMock,
}));

import { useConversationFiles } from './useConversationFiles';

function createFile(id: string, filename = `${id}.txt`): FileInfo {
  return {
    id,
    filename,
    mimetype: 'text/plain',
    size: 128,
    created_at: '2026-07-03T00:00:00Z',
    status: 'processed',
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe('useConversationFiles', () => {
  beforeEach(() => {
    getConversationFilesMock.mockReset();
  });

  it('active conversation 挂载后加载资料列表', async () => {
    const files = [createFile('file-1'), createFile('file-2')];
    getConversationFilesMock.mockResolvedValue(files);

    const { result } = renderHook(() => useConversationFiles('chat-1'));

    expect(getConversationFilesMock).toHaveBeenCalledWith('chat-1');
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.files).toEqual(files);
    expect(result.current.error).toBeNull();
  });

  it('加载失败时清空资料并展示 Error.message', async () => {
    getConversationFilesMock.mockRejectedValue(new Error('后端不可用'));

    const { result } = renderHook(() => useConversationFiles('chat-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBe('后端不可用');
  });

  it('加载失败且不是 Error 时展示默认错误文案', async () => {
    getConversationFilesMock.mockRejectedValue('bad response');

    const { result } = renderHook(() => useConversationFiles('chat-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBe('资料列表加载失败');
  });

  it('conversationId 为 null 时不请求并清空已有状态', async () => {
    getConversationFilesMock.mockResolvedValue([createFile('file-1')]);

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string | null }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-1' as string | null } },
    );

    await waitFor(() => {
      expect(result.current.files).toHaveLength(1);
    });

    rerender({ conversationId: null });

    expect(getConversationFilesMock).toHaveBeenCalledTimes(1);
    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('pending 请求后切到 null 时旧结果不会写回', async () => {
    const pendingRequest = createDeferred<FileInfo[]>();
    getConversationFilesMock.mockReturnValue(pendingRequest.promise);

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string | null }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-1' as string | null } },
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    rerender({ conversationId: null });

    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);

    await act(async () => {
      pendingRequest.resolve([createFile('stale-file')]);
      await pendingRequest.promise;
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('refresh 会重新拉取当前 conversation 的资料列表', async () => {
    const initialFiles = [createFile('file-1')];
    const refreshedFiles = [createFile('file-2')];
    getConversationFilesMock
      .mockResolvedValueOnce(initialFiles)
      .mockResolvedValueOnce(refreshedFiles);

    const { result } = renderHook(() => useConversationFiles('chat-1'));

    await waitFor(() => {
      expect(result.current.files).toEqual(initialFiles);
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);
    expect(getConversationFilesMock).toHaveBeenLastCalledWith('chat-1');
    expect(result.current.files).toEqual(refreshedFiles);
    expect(result.current.error).toBeNull();
  });

  it('旧 refresh 引用不会在切换会话后写回旧会话资料', async () => {
    const oldFiles = [createFile('old-file')];
    const newFiles = [createFile('new-file')];
    getConversationFilesMock
      .mockResolvedValueOnce(oldFiles)
      .mockResolvedValueOnce(newFiles)
      .mockResolvedValueOnce(newFiles);

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-old' } },
    );

    await waitFor(() => {
      expect(result.current.files).toEqual(oldFiles);
    });
    const staleRefresh = result.current.refresh;

    rerender({ conversationId: 'chat-new' });
    await waitFor(() => {
      expect(result.current.files).toEqual(newFiles);
    });

    await act(async () => {
      await staleRefresh();
    });

    expect(getConversationFilesMock).toHaveBeenLastCalledWith('chat-new');
    expect(result.current.files).toEqual(newFiles);
  });

  it('removeFile 只从本地列表移除资料', async () => {
    const files = [createFile('file-1'), createFile('file-2')];
    getConversationFilesMock.mockResolvedValue(files);

    const { result } = renderHook(() => useConversationFiles('chat-1'));

    await waitFor(() => {
      expect(result.current.files).toEqual(files);
    });

    act(() => {
      result.current.removeFile('file-1');
    });

    expect(result.current.files).toEqual([files[1]]);
    expect(getConversationFilesMock).toHaveBeenCalledTimes(1);
  });

  it('旧 conversation 请求晚返回时不会覆盖新 conversation 结果', async () => {
    const oldRequest = createDeferred<FileInfo[]>();
    const newRequest = createDeferred<FileInfo[]>();
    const oldFiles = [createFile('old-file')];
    const newFiles = [createFile('new-file')];

    getConversationFilesMock.mockImplementation((conversationId: string) => {
      if (conversationId === 'chat-old') {
        return oldRequest.promise;
      }
      return newRequest.promise;
    });

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-old' } },
    );

    await waitFor(() => {
      expect(getConversationFilesMock).toHaveBeenCalledWith('chat-old');
    });

    rerender({ conversationId: 'chat-new' });

    await waitFor(() => {
      expect(getConversationFilesMock).toHaveBeenCalledWith('chat-new');
    });

    await act(async () => {
      newRequest.resolve(newFiles);
      await newRequest.promise;
    });

    await waitFor(() => {
      expect(result.current.files).toEqual(newFiles);
    });

    await act(async () => {
      oldRequest.resolve(oldFiles);
      await oldRequest.promise;
    });

    expect(result.current.files).toEqual(newFiles);
    expect(result.current.error).toBeNull();
  });

  it('切换到新 conversation 后立即清空旧资料', async () => {
    const newRequest = createDeferred<FileInfo[]>();
    getConversationFilesMock
      .mockResolvedValueOnce([createFile('old-file')])
      .mockReturnValueOnce(newRequest.promise);

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-old' } },
    );

    await waitFor(() => {
      expect(result.current.files).toHaveLength(1);
    });

    rerender({ conversationId: 'chat-new' });

    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('旧请求在切换会话后立即返回也不会写回', async () => {
    const oldRequest = createDeferred<FileInfo[]>();
    const newRequest = createDeferred<FileInfo[]>();
    getConversationFilesMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-old' } },
    );

    await waitFor(() => {
      expect(getConversationFilesMock).toHaveBeenCalledWith('chat-old');
    });

    rerender({ conversationId: 'chat-new' });

    await act(async () => {
      oldRequest.resolve([createFile('stale-file')]);
      await oldRequest.promise;
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });
});
