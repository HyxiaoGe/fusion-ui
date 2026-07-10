import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileInfo } from '@/lib/api/files';

const { getConversationFilesMock } = vi.hoisted(() => ({
  getConversationFilesMock: vi.fn(),
}));

vi.mock('@/lib/api/files', () => ({
  getConversationFiles: getConversationFilesMock,
}));

import {
  __resetConversationFilesCacheForTest,
  useConversationFiles,
} from './useConversationFiles';
import { invalidateAllConversationFiles } from '@/lib/chat/conversationFilesResource';

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
    __resetConversationFilesCacheForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('热切换回已成功加载的 conversation 时立即复用缓存且不二次 GET', async () => {
    const files = [createFile('file-1')];
    getConversationFilesMock.mockResolvedValue(files);

    const firstHook = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(firstHook.result.current.files).toEqual(files);
    });
    firstHook.unmount();

    const secondHook = renderHook(() => useConversationFiles('chat-1'));

    expect(secondHook.result.current.files).toEqual(files);
    expect(secondHook.result.current.isLoading).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getConversationFilesMock).toHaveBeenCalledTimes(1);
  });

  it('缓存超过 TTL 后先展示旧成功结果并在后台重新验证', async () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const initialFiles = [createFile('initial-file')];
    const refreshedFiles = [createFile('refreshed-file')];
    const revalidationRequest = createDeferred<FileInfo[]>();
    getConversationFilesMock
      .mockResolvedValueOnce(initialFiles)
      .mockReturnValueOnce(revalidationRequest.promise);

    const firstHook = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(firstHook.result.current.files).toEqual(initialFiles);
    });
    firstHook.unmount();

    now += 30_001;
    const secondHook = renderHook(() => useConversationFiles('chat-1'));

    expect(secondHook.result.current.files).toEqual(initialFiles);
    expect(secondHook.result.current.isLoading).toBe(false);
    await waitFor(() => {
      expect(getConversationFilesMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      revalidationRequest.resolve(refreshedFiles);
      await revalidationRequest.promise;
    });

    expect(secondHook.result.current.files).toEqual(refreshedFiles);
  });

  it('A-B-A 切换命中 A 的成功缓存且 B 的迟到响应不会串入 A', async () => {
    const chatBRequest = createDeferred<FileInfo[]>();
    const chatAFiles = [createFile('chat-a-file')];
    getConversationFilesMock.mockImplementation((conversationId: string) => {
      if (conversationId === 'chat-a') {
        return Promise.resolve(chatAFiles);
      }
      return chatBRequest.promise;
    });

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-a' } },
    );

    await waitFor(() => {
      expect(result.current.files).toEqual(chatAFiles);
    });

    rerender({ conversationId: 'chat-b' });
    await waitFor(() => {
      expect(getConversationFilesMock).toHaveBeenCalledWith('chat-b');
    });

    rerender({ conversationId: 'chat-a' });

    expect(result.current.files).toEqual(chatAFiles);
    expect(result.current.isLoading).toBe(false);
    expect(getConversationFilesMock.mock.calls.filter(([id]) => id === 'chat-a')).toHaveLength(1);

    await act(async () => {
      chatBRequest.resolve([createFile('chat-b-file')]);
      await chatBRequest.promise;
    });

    expect(result.current.files).toEqual(chatAFiles);
  });

  it('同一 conversation 的并发挂载共享单个 GET', async () => {
    const pendingRequest = createDeferred<FileInfo[]>();
    const files = [createFile('shared-file')];
    getConversationFilesMock.mockReturnValue(pendingRequest.promise);

    const firstHook = renderHook(() => useConversationFiles('chat-1'));
    const secondHook = renderHook(() => useConversationFiles('chat-1'));

    expect(getConversationFilesMock).toHaveBeenCalledTimes(1);
    expect(firstHook.result.current.isLoading).toBe(true);
    expect(secondHook.result.current.isLoading).toBe(true);

    await act(async () => {
      pendingRequest.resolve(files);
      await pendingRequest.promise;
    });

    await waitFor(() => {
      expect(firstHook.result.current.files).toEqual(files);
      expect(secondHook.result.current.files).toEqual(files);
    });
    expect(firstHook.result.current.isLoading).toBe(false);
    expect(secondHook.result.current.isLoading).toBe(false);
  });

  it('同一 conversation 的显式 refresh 会同步更新所有已挂载 hook', async () => {
    const initialFiles = [createFile('initial-file')];
    const refreshedFiles = [createFile('refreshed-file')];
    const refreshRequest = createDeferred<FileInfo[]>();
    getConversationFilesMock
      .mockResolvedValueOnce(initialFiles)
      .mockReturnValueOnce(refreshRequest.promise);

    const firstHook = renderHook(() => useConversationFiles('chat-1'));
    const secondHook = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(firstHook.result.current.files).toEqual(initialFiles);
      expect(secondHook.result.current.files).toEqual(initialFiles);
    });

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = firstHook.result.current.refresh();
    });

    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);
    expect(firstHook.result.current.files).toEqual(initialFiles);
    expect(secondHook.result.current.files).toEqual(initialFiles);

    await act(async () => {
      refreshRequest.resolve(refreshedFiles);
      await refreshPromise;
    });

    expect(firstHook.result.current.files).toEqual(refreshedFiles);
    expect(secondHook.result.current.files).toEqual(refreshedFiles);
  });

  it('同一 conversation 的 refresh 失败和后续恢复会同步 error 与 files', async () => {
    const initialFiles = [createFile('initial-file')];
    const recoveredFiles = [createFile('recovered-file')];
    getConversationFilesMock
      .mockResolvedValueOnce(initialFiles)
      .mockRejectedValueOnce(new Error('刷新失败'))
      .mockResolvedValueOnce(recoveredFiles);

    const firstHook = renderHook(() => useConversationFiles('chat-1'));
    const secondHook = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(firstHook.result.current.files).toEqual(initialFiles);
      expect(secondHook.result.current.files).toEqual(initialFiles);
    });

    await act(async () => {
      await firstHook.result.current.refresh();
    });

    expect(firstHook.result.current.files).toEqual(initialFiles);
    expect(secondHook.result.current.files).toEqual(initialFiles);
    expect(firstHook.result.current.error).toBe('刷新失败');
    expect(secondHook.result.current.error).toBe('刷新失败');

    await act(async () => {
      await secondHook.result.current.refresh();
    });

    expect(firstHook.result.current.files).toEqual(recoveredFiles);
    expect(secondHook.result.current.files).toEqual(recoveredFiles);
    expect(firstHook.result.current.error).toBeNull();
    expect(secondHook.result.current.error).toBeNull();
  });

  it('失败结果不进入长期缓存，重新挂载会真实重试', async () => {
    const recoveredFiles = [createFile('recovered-file')];
    getConversationFilesMock
      .mockRejectedValueOnce(new Error('后端不可用'))
      .mockResolvedValueOnce(recoveredFiles);

    const firstHook = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(firstHook.result.current.error).toBe('后端不可用');
    });
    firstHook.unmount();

    const secondHook = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(secondHook.result.current.files).toEqual(recoveredFiles);
    });

    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);
    expect(secondHook.result.current.error).toBeNull();
  });

  it('全局 reset 会让已挂载 hook 立即丢弃旧资料且不自动 GET，显式 refresh 才恢复', async () => {
    const initialFiles = [createFile('initial-file')];
    const refreshedFiles = [createFile('refreshed-file')];
    const revalidationRequest = createDeferred<FileInfo[]>();
    getConversationFilesMock
      .mockResolvedValueOnce(initialFiles)
      .mockReturnValueOnce(revalidationRequest.promise);

    const { result } = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(result.current.files).toEqual(initialFiles);
    });

    act(() => {
      invalidateAllConversationFiles();
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getConversationFilesMock).toHaveBeenCalledTimes(1);

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      revalidationRequest.resolve(refreshedFiles);
      await refreshPromise;
    });

    expect(result.current.files).toEqual(refreshedFiles);
  });

  it('auth session A 切到 B 时清旧资料，并只为新 session 发起一次 GET', async () => {
    const userAFiles = [createFile('user-a-file')];
    const userBFiles = [createFile('user-b-file')];
    getConversationFilesMock
      .mockResolvedValueOnce(userAFiles)
      .mockResolvedValueOnce(userBFiles);

    const { result, rerender } = renderHook(
      ({ sessionKey }: { sessionKey: string }) => useConversationFiles(
        'chat-1',
        { enabled: true, sessionKey },
      ),
      { initialProps: { sessionKey: 'user-a' } },
    );
    await waitFor(() => {
      expect(result.current.files).toEqual(userAFiles);
    });

    act(() => {
      invalidateAllConversationFiles();
    });
    expect(result.current.files).toEqual([]);
    expect(getConversationFilesMock).toHaveBeenCalledTimes(1);

    rerender({ sessionKey: 'user-b' });

    await waitFor(() => {
      expect(result.current.files).toEqual(userBFiles);
    });
    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);
  });

  it('logout 禁用后不请求，后续重新启用才为当前 session 真实 GET', async () => {
    const initialFiles = [createFile('initial-file')];
    const restoredFiles = [createFile('restored-file')];
    getConversationFilesMock
      .mockResolvedValueOnce(initialFiles)
      .mockResolvedValueOnce(restoredFiles);

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useConversationFiles(
        'chat-1',
        { enabled, sessionKey: enabled ? 'user-a' : null },
      ),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => {
      expect(result.current.files).toEqual(initialFiles);
    });
    const staleRefresh = result.current.refresh;

    let logoutRaceRefresh!: Promise<void>;
    act(() => {
      invalidateAllConversationFiles();
      logoutRaceRefresh = staleRefresh('chat-old');
      rerender({ enabled: false });
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      await logoutRaceRefresh;
      await Promise.resolve();
    });
    expect(getConversationFilesMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await staleRefresh('chat-old');
      await result.current.refresh();
    });
    expect(getConversationFilesMock).toHaveBeenCalledTimes(1);

    rerender({ enabled: true });
    await waitFor(() => {
      expect(result.current.files).toEqual(restoredFiles);
    });
    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);
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

  it('初始 GET 未完成时显式 refresh 会失效旧请求并以新 GET 为准', async () => {
    const initialRequest = createDeferred<FileInfo[]>();
    const refreshRequest = createDeferred<FileInfo[]>();
    const refreshedFiles = [createFile('fresh-file')];
    getConversationFilesMock
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(refreshRequest.promise);

    const { result } = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(getConversationFilesMock).toHaveBeenCalledTimes(1);
    });

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    expect(getConversationFilesMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      refreshRequest.resolve(refreshedFiles);
      await refreshPromise;
    });

    expect(result.current.files).toEqual(refreshedFiles);

    await act(async () => {
      initialRequest.resolve([createFile('stale-file')]);
      await initialRequest.promise;
    });

    expect(result.current.files).toEqual(refreshedFiles);
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

  it('显式 refresh 指定旧 conversation 时只刷新目标缓存，不污染当前 conversation', async () => {
    const oldFiles = [createFile('old-file')];
    const refreshedOldFiles = [createFile('refreshed-old-file')];
    const newFiles = [createFile('new-file')];
    getConversationFilesMock.mockImplementation((conversationId: string) => {
      if (conversationId === 'chat-old') {
        const oldCallCount = getConversationFilesMock.mock.calls.filter(([id]) => id === 'chat-old').length;
        return Promise.resolve(oldCallCount === 1 ? oldFiles : refreshedOldFiles);
      }
      return Promise.resolve(newFiles);
    });

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-old' } },
    );

    await waitFor(() => {
      expect(result.current.files).toEqual(oldFiles);
    });
    rerender({ conversationId: 'chat-new' });
    await waitFor(() => {
      expect(result.current.files).toEqual(newFiles);
    });

    await act(async () => {
      await result.current.refresh('chat-old');
    });

    expect(result.current.files).toEqual(newFiles);
    expect(getConversationFilesMock.mock.calls.filter(([id]) => id === 'chat-old')).toHaveLength(2);

    rerender({ conversationId: 'chat-old' });
    expect(result.current.files).toEqual(refreshedOldFiles);
    expect(getConversationFilesMock.mock.calls.filter(([id]) => id === 'chat-old')).toHaveLength(2);
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

  it('removeFile 会同步更新并失效缓存，重新挂载后保留乐观结果并真实 GET', async () => {
    const initialFiles = [createFile('file-1'), createFile('file-2')];
    const serverFiles = [createFile('file-2')];
    const revalidationRequest = createDeferred<FileInfo[]>();
    getConversationFilesMock
      .mockResolvedValueOnce(initialFiles)
      .mockReturnValueOnce(revalidationRequest.promise);

    const firstHook = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(firstHook.result.current.files).toEqual(initialFiles);
    });

    act(() => {
      firstHook.result.current.removeFile('file-1');
    });
    expect(firstHook.result.current.files).toEqual(serverFiles);
    firstHook.unmount();

    const secondHook = renderHook(() => useConversationFiles('chat-1'));

    expect(secondHook.result.current.files).toEqual(serverFiles);
    expect(secondHook.result.current.isLoading).toBe(false);
    await waitFor(() => {
      expect(getConversationFilesMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      revalidationRequest.resolve(serverFiles);
      await revalidationRequest.promise;
    });

    expect(secondHook.result.current.files).toEqual(serverFiles);
  });

  it('显式 removeFile 指定旧 conversation 时不会误删当前 conversation 的同 ID 资料', async () => {
    const oldFiles = [createFile('shared-file', '旧会话资料.txt')];
    const newFiles = [createFile('shared-file', '新会话资料.txt')];
    getConversationFilesMock.mockImplementation((conversationId: string) => (
      Promise.resolve(conversationId === 'chat-old' ? oldFiles : newFiles)
    ));

    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string }) => useConversationFiles(conversationId),
      { initialProps: { conversationId: 'chat-old' } },
    );

    await waitFor(() => {
      expect(result.current.files).toEqual(oldFiles);
    });
    rerender({ conversationId: 'chat-new' });
    await waitFor(() => {
      expect(result.current.files).toEqual(newFiles);
    });

    act(() => {
      result.current.removeFile('shared-file', 'chat-old');
    });

    expect(result.current.files).toEqual(newFiles);
  });

  it('同一 conversation 的 removeFile 会立即同步所有已挂载 hook', async () => {
    const files = [createFile('file-1'), createFile('file-2')];
    getConversationFilesMock.mockResolvedValue(files);

    const firstHook = renderHook(() => useConversationFiles('chat-1'));
    const secondHook = renderHook(() => useConversationFiles('chat-1'));
    await waitFor(() => {
      expect(firstHook.result.current.files).toEqual(files);
      expect(secondHook.result.current.files).toEqual(files);
    });

    act(() => {
      firstHook.result.current.removeFile('file-1');
    });

    expect(firstHook.result.current.files).toEqual([files[1]]);
    expect(secondHook.result.current.files).toEqual([files[1]]);
    expect(firstHook.result.current.error).toBeNull();
    expect(secondHook.result.current.error).toBeNull();
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
