import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getChatCapabilitiesMock, listKnowledgeBasesMock } = vi.hoisted(() => ({
  getChatCapabilitiesMock: vi.fn(),
  listKnowledgeBasesMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  getChatCapabilities: getChatCapabilitiesMock,
}));

vi.mock('@/lib/api/knowledgeBases', () => ({
  listKnowledgeBases: listKnowledgeBasesMock,
}));

import {
  ensureKnowledgeBaseCatalog,
  getKnowledgeBaseCatalogSnapshot,
  invalidateKnowledgeBaseCatalog,
  resetKnowledgeBaseCatalogResource,
} from './knowledgeBaseCatalogResource';

function page(id: string) {
  return {
    items: [{
      id,
      name: `知识库 ${id}`,
      description: '',
      business_type: '',
      status: 'active',
      document_stats: { total: 1, ready: 1, processing: 0, failed: 0 },
      embedding_provider: 'dashscope',
      embedding_model: 'text-embedding-v4',
      embedding_revision: 'v1',
      embedding_dimension: 1024,
      distance_metric: 'COSINE',
      created_at: '2026-08-15T00:00:00Z',
      updated_at: '2026-08-15T00:00:00Z',
      deleted_at: null,
    }],
    page: 1,
    page_size: 100,
    total: 1,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('knowledgeBaseCatalogResource', () => {
  beforeEach(() => {
    resetKnowledgeBaseCatalogResource();
    getChatCapabilitiesMock.mockReset();
    getChatCapabilitiesMock.mockResolvedValue({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
    });
    listKnowledgeBasesMock.mockReset();
  });

  it('同一账号的知识库目录使用新鲜缓存和 singleflight', async () => {
    listKnowledgeBasesMock.mockResolvedValue(page('kb-1'));

    const first = ensureKnowledgeBaseCatalog('user-a');
    const concurrent = ensureKnowledgeBaseCatalog('user-a');
    expect(first).toBe(concurrent);
    await first;
    await ensureKnowledgeBaseCatalog('user-a');

    expect(getChatCapabilitiesMock).toHaveBeenCalledTimes(1);
    expect(listKnowledgeBasesMock).toHaveBeenCalledTimes(1);
    expect(getKnowledgeBaseCatalogSnapshot('user-a').data?.items[0]?.id).toBe('kb-1');
  });

  it('失效后后台刷新保留旧目录，完成后再原位更新', async () => {
    listKnowledgeBasesMock.mockResolvedValueOnce(page('kb-old'));
    await ensureKnowledgeBaseCatalog('user-a');
    invalidateKnowledgeBaseCatalog('user-a');

    const refresh = deferred<ReturnType<typeof page>>();
    listKnowledgeBasesMock.mockReturnValueOnce(refresh.promise);
    const request = ensureKnowledgeBaseCatalog('user-a');

    expect(getKnowledgeBaseCatalogSnapshot('user-a')).toMatchObject({
      data: { items: [expect.objectContaining({ id: 'kb-old' })] },
      isLoading: false,
      updatedAt: 0,
    });

    refresh.resolve(page('kb-new'));
    await request;
    expect(getKnowledgeBaseCatalogSnapshot('user-a').data?.items[0]?.id).toBe('kb-new');
  });

  it('账号作用域隔离，旧账号迟到结果不会污染新账号目录', async () => {
    const oldRequest = deferred<ReturnType<typeof page>>();
    listKnowledgeBasesMock
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce(page('kb-new-user'));

    const oldLoad = ensureKnowledgeBaseCatalog('user-a');
    await ensureKnowledgeBaseCatalog('user-b');
    oldRequest.resolve(page('kb-old-user'));
    await oldLoad;

    expect(getKnowledgeBaseCatalogSnapshot('user-b').data?.items[0]?.id).toBe('kb-new-user');
    expect(getKnowledgeBaseCatalogSnapshot('user-a').data?.items[0]?.id).toBe('kb-old-user');
  });
});
