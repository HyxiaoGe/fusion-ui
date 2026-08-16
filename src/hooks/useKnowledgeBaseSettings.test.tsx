import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KnowledgeBase, KnowledgeDocument, KnowledgeTask } from '@/types/knowledge';

const api = vi.hoisted(() => ({
  createKnowledgeBase: vi.fn(),
  deleteKnowledgeBase: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  getKnowledgeTask: vi.fn(),
  listKnowledgeBases: vi.fn(),
  listKnowledgeDocuments: vi.fn(),
  rebuildKnowledgeDocument: vi.fn(),
  retryKnowledgeDocument: vi.fn(),
  updateKnowledgeBase: vi.fn(),
  uploadKnowledgeDocument: vi.fn(),
}));
const invalidateKnowledgeBaseCatalogMock = vi.hoisted(() => vi.fn());

let authSessionKey: string | null = 'user-a';

vi.mock('@/redux/hooks', () => ({
  useAppSelector: () => authSessionKey,
}));

vi.mock('@/redux/selectors', () => ({
  selectAuthSessionKey: vi.fn(),
}));

vi.mock('@/lib/api/knowledgeBases', () => api);

vi.mock('@/lib/chat/knowledgeBaseCatalogResource', () => ({
  invalidateKnowledgeBaseCatalog: invalidateKnowledgeBaseCatalogMock,
}));

import {
  KNOWLEDGE_POLL_MAX_CONSECUTIVE_FAILURES,
  knowledgePollingDelay,
  useKnowledgeBaseSettings,
} from './useKnowledgeBaseSettings';

function makeBase(id: string, name = id): KnowledgeBase {
  return {
    id,
    name,
    description: '',
    business_type: '',
    status: 'active',
    document_stats: { total: 0, ready: 0, processing: 0, failed: 0 },
    embedding_provider: 'litellm',
    embedding_model: 'text-embedding-v4',
    embedding_revision: 'dashscope-v4',
    embedding_dimension: 1024,
    distance_metric: 'COSINE',
    created_at: '2026-08-14T00:00:00Z',
    updated_at: '2026-08-14T00:00:00Z',
    deleted_at: null,
  };
}

function makeDocument(id: string, knowledgeBaseId: string): KnowledgeDocument {
  return {
    id,
    knowledge_base_id: knowledgeBaseId,
    filename: `${id}.txt`,
    mimetype: 'text/plain',
    size: 12,
    checksum_sha256: 'checksum',
    status: 'ready',
    parser_version: 'parser-v1',
    chunker_version: 'chunker-v2',
    embedding_provider: 'litellm',
    embedding_model: 'text-embedding-v4',
    embedding_revision: 'dashscope-v4',
    embedding_dimension: 1024,
    distance_metric: 'COSINE',
    desired_index_version: 'v1',
    active_index_version: 'v1',
    chunk_count: 1,
    error_code: null,
    error_summary: null,
    attempt_count: 1,
    created_at: '2026-08-14T00:00:00Z',
    updated_at: '2026-08-14T00:00:00Z',
    ready_at: '2026-08-14T00:00:00Z',
    deleted_at: null,
  };
}

function makeTask(id: string, status = 'pending'): KnowledgeTask {
  return {
    id,
    task_type: 'index_document',
    status,
    phase: 'queued',
    attempt_count: 0,
    max_attempts: 3,
    error_code: null,
    error_summary: null,
    created_at: '2026-08-14T00:00:00Z',
    updated_at: '2026-08-14T00:00:00Z',
  };
}

function mockPage(base: KnowledgeBase) {
  api.listKnowledgeBases.mockResolvedValue({
    items: [base],
    page: 1,
    page_size: 20,
    total: 1,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  });
  api.listKnowledgeDocuments.mockResolvedValue({
    items: [],
    page: 1,
    page_size: 20,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false,
  });
}

describe('useKnowledgeBaseSettings', () => {
  beforeEach(() => {
    authSessionKey = 'user-a';
    vi.clearAllMocks();
    mockPage(makeBase('base-a'));
  });

  it('加载知识库后选择首项并读取文档', async () => {
    const document = makeDocument('document-a', 'base-a');
    api.listKnowledgeDocuments.mockResolvedValue({
      items: [document],
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    });

    const { result } = renderHook(() => useKnowledgeBaseSettings());

    await waitFor(() => expect(result.current.selectedBaseId).toBe('base-a'));
    await waitFor(() => expect(result.current.documents.items).toEqual([document]));
    expect(api.listKnowledgeBases).toHaveBeenCalledWith(
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal),
    );
    expect(api.listKnowledgeDocuments).toHaveBeenCalledWith(
      'base-a',
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal),
    );
  });

  it('即使接口短暂返回已删除知识库也不会在列表中展示或选中', async () => {
    const activeBase = makeBase('base-a');
    const deletedBase = {
      ...makeBase('base-deleted'),
      status: 'deleted' as const,
      deleted_at: '2026-08-15T00:00:00Z',
    };
    api.listKnowledgeBases.mockResolvedValue({
      ...pageFor(activeBase),
      items: [deletedBase, activeBase],
      total: 21,
      total_pages: 2,
      has_next: true,
    });

    const { result } = renderHook(() => useKnowledgeBaseSettings());

    await waitFor(() => expect(result.current.selectedBaseId).toBe('base-a'));
    expect(result.current.bases.items).toEqual([activeBase]);
    expect(result.current.bases).toMatchObject({
      total: 21,
      total_pages: 2,
      has_next: true,
    });
    expect(api.listKnowledgeDocuments).not.toHaveBeenCalledWith(
      'base-deleted',
      expect.anything(),
      expect.anything(),
    );
  });

  it('账号切换时立即清空旧数据且拒绝旧请求迟到回写', async () => {
    let resolveOld: ((value: ReturnType<typeof pageFor>) => void) | undefined;
    const oldRequest = new Promise<ReturnType<typeof pageFor>>((resolve) => {
      resolveOld = resolve;
    });
    api.listKnowledgeBases.mockReturnValueOnce(oldRequest);

    const { result, rerender } = renderHook(() => useKnowledgeBaseSettings());
    await waitFor(() => expect(api.listKnowledgeBases).toHaveBeenCalledTimes(1));

    authSessionKey = 'user-b';
    api.listKnowledgeBases.mockResolvedValueOnce(pageFor(makeBase('base-b')));
    rerender();

    expect(result.current.bases.items).toEqual([]);
    await waitFor(() => expect(result.current.selectedBaseId).toBe('base-b'));

    await act(async () => {
      resolveOld?.(pageFor(makeBase('base-a')));
      await oldRequest;
    });

    expect(result.current.bases.items.map((item) => item.id)).toEqual(['base-b']);
  });

  it('上传返回 202 任务后展示排队文档并跟踪任务', async () => {
    const document = { ...makeDocument('document-a', 'base-a'), status: 'queued' as const };
    const task = makeTask('task-a');
    api.uploadKnowledgeDocument.mockResolvedValue({ document, task });

    const { result } = renderHook(() => useKnowledgeBaseSettings());
    await waitFor(() => expect(result.current.selectedBaseId).toBe('base-a'));

    await act(async () => {
      await result.current.uploadDocument('base-a', new File(['hello'], 'note.txt'));
    });

    expect(result.current.documents.items[0]).toEqual(document);
    expect(result.current.trackedTasks).toEqual([task]);
    expect(invalidateKnowledgeBaseCatalogMock).toHaveBeenCalledWith('user-a');
  });

  it('删除文档后仅标记删除中，不误判为已经完成', async () => {
    const document = makeDocument('document-a', 'base-a');
    api.listKnowledgeDocuments.mockResolvedValue({
      items: [document],
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    });
    api.deleteKnowledgeDocument.mockResolvedValue(makeTask('task-delete'));

    const { result } = renderHook(() => useKnowledgeBaseSettings());
    await waitFor(() => expect(result.current.documents.items).toHaveLength(1));

    await act(async () => {
      await result.current.removeDocument('base-a', 'document-a');
    });

    expect(result.current.documents.items[0].status).toBe('deleting');
    expect(result.current.trackedTasks[0].id).toBe('task-delete');
  });

  it('切换知识库会取消旧文档请求，且迟到响应不能覆盖新选择', async () => {
    const baseA = makeBase('base-a');
    const baseB = makeBase('base-b');
    api.listKnowledgeBases.mockResolvedValue({
      ...pageFor(baseA),
      items: [baseA, baseB],
      total: 2,
    });
    let resolveBaseA: ((value: ReturnType<typeof documentPageFor>) => void) | undefined;
    let baseASignal: AbortSignal | undefined;
    api.listKnowledgeDocuments.mockImplementation((baseId: string, _params, signal) => {
      if (baseId === 'base-a') {
        baseASignal = signal;
        return new Promise((resolve) => {
          resolveBaseA = resolve;
        });
      }
      return Promise.resolve(documentPageFor(makeDocument('document-b', 'base-b')));
    });

    const { result } = renderHook(() => useKnowledgeBaseSettings());
    await waitFor(() => expect(result.current.selectedBaseId).toBe('base-a'));
    await waitFor(() => expect(baseASignal).toBeDefined());

    act(() => result.current.setSelectedBaseId('base-b'));
    expect(baseASignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.documents.items[0]?.id).toBe('document-b'));

    await act(async () => {
      resolveBaseA?.(documentPageFor(makeDocument('document-a', 'base-a')));
      await Promise.resolve();
    });
    expect(result.current.selectedBaseId).toBe('base-b');
    expect(result.current.documents.items[0]?.id).toBe('document-b');
  });

  it('组件卸载时取消仍在执行的请求', async () => {
    let requestSignal: AbortSignal | undefined;
    api.listKnowledgeBases.mockImplementation((_params, signal) => {
      requestSignal = signal;
      return new Promise(() => undefined);
    });

    const { unmount } = renderHook(() => useKnowledgeBaseSettings());
    await waitFor(() => expect(requestSignal).toBeDefined());
    unmount();

    expect(requestSignal?.aborted).toBe(true);
  });

  it('轮询退避有上限', () => {
    expect(knowledgePollingDelay(0)).toBe(2_000);
    expect(knowledgePollingDelay(1)).toBe(4_000);
    expect(knowledgePollingDelay(2)).toBe(8_000);
    expect(knowledgePollingDelay(10)).toBe(30_000);
    expect(KNOWLEDGE_POLL_MAX_CONSECUTIVE_FAILURES).toBe(5);
  });

  it('连续五次轮询失败后暂停，避免无限请求', async () => {
    vi.useFakeTimers();
    try {
      api.listKnowledgeBases
        .mockResolvedValueOnce(pageFor({ ...makeBase('base-a'), status: 'deleting' }))
        .mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useKnowledgeBaseSettings());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      for (const delay of [2_000, 4_000, 8_000, 16_000, 30_000]) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(delay);
        });
      }

      expect(api.listKnowledgeBases).toHaveBeenCalledTimes(6);
      expect(result.current.pollingPaused).toBe(true);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(api.listKnowledgeBases).toHaveBeenCalledTimes(6);

      api.listKnowledgeBases.mockResolvedValue(
        pageFor({ ...makeBase('base-a'), status: 'deleting' }),
      );
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.pollingPaused).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('任务失败后停止跟踪并暴露稳定的可见告警', async () => {
    vi.useFakeTimers();
    try {
      const document = { ...makeDocument('document-a', 'base-a'), status: 'queued' as const };
      api.uploadKnowledgeDocument.mockResolvedValue({ document, task: makeTask('task-a') });
      api.getKnowledgeTask.mockResolvedValue({
        ...makeTask('task-a', 'failed'),
        error_code: 'INTERNAL_VECTOR_DETAILS',
        error_summary: 'Milvus internal endpoint failed',
      });

      const { result } = renderHook(() => useKnowledgeBaseSettings());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.uploadDocument('base-a', new File(['hello'], 'note.txt'));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(result.current.trackedTasks).toEqual([]);
      expect(result.current.pollingWarning).toBe('KNOWLEDGE_TASK_FAILED');
      expect(String(result.current.pollingWarning)).not.toContain('Milvus');
    } finally {
      vi.useRealTimers();
    }
  });

  it('任务完成后停止跟踪且不再继续查询终态任务', async () => {
    vi.useFakeTimers();
    try {
      const document = { ...makeDocument('document-a', 'base-a'), status: 'queued' as const };
      api.uploadKnowledgeDocument.mockResolvedValue({ document, task: makeTask('task-a') });
      api.getKnowledgeTask.mockResolvedValue(makeTask('task-a', 'completed'));

      const { result } = renderHook(() => useKnowledgeBaseSettings());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        await result.current.uploadDocument('base-a', new File(['hello'], 'note.txt'));
      });
      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(result.current.trackedTasks).toEqual([]);
      expect(api.getKnowledgeTask).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(api.getKnowledgeTask).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('首次加载失败后手动刷新成功会清除旧错误', async () => {
    api.listKnowledgeBases.mockRejectedValueOnce(new Error('disabled details'));
    const { result } = renderHook(() => useKnowledgeBaseSettings());
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    api.listKnowledgeBases.mockResolvedValue(pageFor(makeBase('base-a')));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.bases.items[0]?.id).toBe('base-a');
  });

  it('页面隐藏时取消轮询请求，恢复可见后重新拉取', async () => {
    vi.useFakeTimers();
    const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
      let pollingSignal: AbortSignal | undefined;
      api.listKnowledgeBases
        .mockResolvedValueOnce(pageFor({ ...makeBase('base-a'), status: 'deleting' }))
        .mockImplementationOnce((_params, signal: AbortSignal) => {
          pollingSignal = signal;
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          });
        })
        .mockResolvedValue(pageFor({ ...makeBase('base-a'), status: 'deleting' }));

      renderHook(() => useKnowledgeBaseSettings());
      for (let index = 0; index < 3; index += 1) {
        await act(async () => {
          await Promise.resolve();
        });
      }
      expect(api.listKnowledgeBases).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(pollingSignal).toBeDefined();

      hidden = true;
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(pollingSignal?.aborted).toBe(true);

      hidden = false;
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await Promise.resolve();
      });
      expect(api.listKnowledgeBases).toHaveBeenCalledTimes(3);
    } finally {
      if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
      vi.useRealTimers();
    }
  });
});

function pageFor(base: KnowledgeBase) {
  return {
    items: [base],
    page: 1,
    page_size: 20,
    total: 1,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  };
}

function documentPageFor(document: KnowledgeDocument) {
  return {
    items: [document],
    page: 1,
    page_size: 20,
    total: 1,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  };
}
