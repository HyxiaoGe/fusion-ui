import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KnowledgeDocumentChunkPage } from '@/types/knowledge';

const listKnowledgeDocumentChunks = vi.hoisted(() => vi.fn());

let authSessionKey: string | null = 'user-a';

vi.mock('@/redux/hooks', () => ({
  useAppSelector: () => authSessionKey,
}));

vi.mock('@/redux/selectors', () => ({
  selectAuthSessionKey: vi.fn(),
}));

vi.mock('@/lib/api/knowledgeBases', () => ({
  listKnowledgeDocumentChunks,
}));

import { useKnowledgeDocumentChunks } from './useKnowledgeDocumentChunks';

function chunkPage(
  documentId: string,
  page = 1,
  text = `${documentId}-${page}`,
): KnowledgeDocumentChunkPage {
  return {
    document_id: documentId,
    active_index_version: 'index-v1',
    chunker_version: 'chunker-v2',
    chunk_size: 1000,
    chunk_overlap: 100,
    items: [
      {
        chunk_id: `${documentId}-chunk-${page}`,
        ordinal: page - 1,
        text,
        char_start: 0,
        char_end: text.length,
        page: null,
        section: null,
      },
    ],
    page,
    page_size: 10,
    total: 20,
    total_pages: 2,
    has_next: page < 2,
    has_prev: page > 1,
  };
}

describe('useKnowledgeDocumentChunks', () => {
  beforeEach(() => {
    authSessionKey = 'user-a';
    listKnowledgeDocumentChunks.mockReset();
    listKnowledgeDocumentChunks.mockResolvedValue(chunkPage('document-a'));
  });

  it('仅在打开时按每页 10 条读取第一页', async () => {
    const { result, rerender } = renderHook(
      ({ open }) =>
        useKnowledgeDocumentChunks({
          open,
          knowledgeBaseId: 'base-a',
          documentId: 'document-a',
        }),
      { initialProps: { open: false } },
    );

    expect(listKnowledgeDocumentChunks).not.toHaveBeenCalled();
    rerender({ open: true });

    await waitFor(() => expect(result.current.data?.document_id).toBe('document-a'));
    expect(listKnowledgeDocumentChunks).toHaveBeenCalledWith(
      'base-a',
      'document-a',
      { page: 1, pageSize: 10 },
      expect.any(AbortSignal),
    );
  });

  it('切页会取消旧请求，迟到响应不能覆盖新页', async () => {
    let resolveSecondPage: ((page: KnowledgeDocumentChunkPage) => void) | undefined;
    let secondPageSignal: AbortSignal | undefined;
    listKnowledgeDocumentChunks
      .mockResolvedValueOnce(chunkPage('document-a', 1))
      .mockImplementationOnce((_baseId, _documentId, params, signal) => {
        expect(params).toEqual({ page: 2, pageSize: 10 });
        secondPageSignal = signal;
        return new Promise((resolve) => {
          resolveSecondPage = resolve;
        });
      })
      .mockResolvedValueOnce(chunkPage('document-a', 1, 'refreshed-page-one'));

    const { result } = renderHook(() =>
      useKnowledgeDocumentChunks({
        open: true,
        knowledgeBaseId: 'base-a',
        documentId: 'document-a',
      }),
    );
    await waitFor(() => expect(result.current.page).toBe(1));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(secondPageSignal).toBeDefined());
    act(() => result.current.setPage(1));
    expect(secondPageSignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.data?.items[0].text).toBe('refreshed-page-one'));

    await act(async () => {
      resolveSecondPage?.(chunkPage('document-a', 2, 'stale-page-two'));
      await Promise.resolve();
    });
    expect(result.current.page).toBe(1);
    expect(result.current.data?.items[0].text).toBe('refreshed-page-one');
  });

  it('切页失败时保留已有内容并允许重试当前页', async () => {
    listKnowledgeDocumentChunks
      .mockResolvedValueOnce(chunkPage('document-a', 1))
      .mockRejectedValueOnce(new Error('internal database details'))
      .mockResolvedValueOnce(chunkPage('document-a', 2, 'retried'));

    const { result } = renderHook(() =>
      useKnowledgeDocumentChunks({
        open: true,
        knowledgeBaseId: 'base-a',
        documentId: 'document-a',
      }),
    );
    await waitFor(() => expect(result.current.data?.items[0].text).toBe('document-a-1'));

    act(() => result.current.setPage(2));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.page).toBe(1);
    expect(result.current.data?.items[0].text).toBe('document-a-1');

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.data?.items[0].text).toBe('retried'));
    expect(result.current.page).toBe(2);
    expect(listKnowledgeDocumentChunks).toHaveBeenLastCalledWith(
      'base-a',
      'document-a',
      { page: 2, pageSize: 10 },
      expect.any(AbortSignal),
    );
  });

  it('切换账号后立即隐藏旧内容，并拒绝旧账号响应迟到回写', async () => {
    let resolveUserA: ((page: KnowledgeDocumentChunkPage) => void) | undefined;
    let userASignal: AbortSignal | undefined;
    listKnowledgeDocumentChunks
      .mockImplementationOnce((_baseId, _documentId, _params, signal) => {
        userASignal = signal;
        return new Promise((resolve) => {
          resolveUserA = resolve;
        });
      })
      .mockResolvedValueOnce(chunkPage('document-a', 1, 'user-b-content'));

    const { result, rerender } = renderHook(() =>
      useKnowledgeDocumentChunks({
        open: true,
        knowledgeBaseId: 'base-a',
        documentId: 'document-a',
      }),
    );
    await waitFor(() => expect(userASignal).toBeDefined());

    authSessionKey = 'user-b';
    rerender();
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(userASignal?.aborted).toBe(true));
    await waitFor(() =>
      expect(result.current.data?.items[0].text).toBe('user-b-content'),
    );

    await act(async () => {
      resolveUserA?.(chunkPage('document-a', 1, 'stale-user-a-content'));
      await Promise.resolve();
    });
    expect(result.current.data?.items[0].text).toBe('user-b-content');
  });

  it('关闭、换文档、切账号和卸载都会取消请求并隐藏旧内容', async () => {
    const signals: AbortSignal[] = [];
    listKnowledgeDocumentChunks.mockImplementation((_baseId, _documentId, _params, signal) => {
      signals.push(signal);
      return new Promise(() => undefined);
    });

    const { result, rerender, unmount } = renderHook(
      ({ open, documentId }) =>
        useKnowledgeDocumentChunks({ open, knowledgeBaseId: 'base-a', documentId }),
      { initialProps: { open: true, documentId: 'document-a' } },
    );
    await waitFor(() => expect(signals).toHaveLength(1));

    rerender({ open: false, documentId: 'document-a' });
    await waitFor(() => expect(signals[0].aborted).toBe(true));
    expect(result.current.data).toBeNull();

    rerender({ open: true, documentId: 'document-a' });
    await waitFor(() => expect(signals).toHaveLength(2));
    rerender({ open: true, documentId: 'document-b' });
    await waitFor(() => expect(signals[1].aborted).toBe(true));
    await waitFor(() => expect(signals).toHaveLength(3));

    authSessionKey = 'user-b';
    rerender({ open: true, documentId: 'document-b' });
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(signals[2].aborted).toBe(true));
    await waitFor(() => expect(signals).toHaveLength(4));

    unmount();
    expect(signals[3].aborted).toBe(true);
  });
});
