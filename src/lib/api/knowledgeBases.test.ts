import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/types/api';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  getKnowledgeBase,
  getKnowledgeDocument,
  getKnowledgeTask,
  listKnowledgeBases,
  listKnowledgeDocuments,
  rebuildKnowledgeDocument,
  retryKnowledgeDocument,
  updateKnowledgeBase,
  uploadKnowledgeDocument,
} from './knowledgeBases';

describe('知识库 API client', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('创建知识库时保留集合端点末尾斜杠并解出 knowledge_base', async () => {
    const knowledgeBase = { id: 'kb-1', name: '产品知识' };
    apiRequestMock.mockResolvedValue({ knowledge_base: knowledgeBase });

    await expect(createKnowledgeBase({
      name: '产品知识',
      description: '产品资料',
      business_type: 'product',
    })).resolves.toBe(knowledgeBase);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/knowledge-bases/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '产品知识',
        description: '产品资料',
        business_type: 'product',
      }),
    });
  });

  it('使用 URLSearchParams 构造知识库分页查询并保留集合端点末尾斜杠', async () => {
    const page = { items: [], page: 2, page_size: 40, total: 0, total_pages: 0, has_next: false, has_prev: true };
    const controller = new AbortController();
    apiRequestMock.mockResolvedValue(page);

    await expect(listKnowledgeBases({ page: 2, pageSize: 40 }, controller.signal)).resolves.toBe(page);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/knowledge-bases/?page=2&page_size=40', {
      signal: controller.signal,
    });
  });

  it('读取知识库详情时编码路径 ID', async () => {
    const knowledgeBase = { id: 'kb/一', name: '产品知识' };
    apiRequestMock.mockResolvedValue({ knowledge_base: knowledgeBase });

    await expect(getKnowledgeBase('kb/一')).resolves.toBe(knowledgeBase);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/knowledge-bases/kb%2F%E4%B8%80');
  });

  it('PATCH 编码路径 ID，且不会发送 null 或 undefined 字段', async () => {
    const knowledgeBase = { id: 'kb/1', name: '新名称' };
    apiRequestMock.mockResolvedValue({ knowledge_base: knowledgeBase });

    await expect(updateKnowledgeBase('kb/1', {
      name: '新名称',
      description: null,
      business_type: undefined,
    } as never)).resolves.toBe(knowledgeBase);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/knowledge-bases/kb%2F1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '新名称' }),
    });
  });

  it('删除知识库时编码路径 ID 并解出异步任务', async () => {
    const task = { id: 'task-1', status: 'pending' };
    apiRequestMock.mockResolvedValue({ task });

    await expect(deleteKnowledgeBase('kb/1')).resolves.toBe(task);

    expect(apiRequestMock).toHaveBeenCalledWith('/api/knowledge-bases/kb%2F1', {
      method: 'DELETE',
    });
  });

  it('使用分页参数读取文档列表，并编码知识库 ID', async () => {
    const page = { items: [], page: 3, page_size: 25, total: 0, total_pages: 0, has_next: false, has_prev: true };
    apiRequestMock.mockResolvedValue(page);

    await expect(listKnowledgeDocuments('kb/1', { page: 3, pageSize: 25 })).resolves.toBe(page);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/knowledge-bases/kb%2F1/documents?page=3&page_size=25',
    );
  });

  it('读取文档详情时编码知识库和文档 ID', async () => {
    const document = { id: 'doc/一', knowledge_base_id: 'kb/1', filename: '说明.md' };
    apiRequestMock.mockResolvedValue({ document });

    await expect(getKnowledgeDocument('kb/1', 'doc/一')).resolves.toBe(document);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/knowledge-bases/kb%2F1/documents/doc%2F%E4%B8%80',
    );
  });

  it('通过单个 file 字段上传 FormData，且不手写 Content-Type', async () => {
    const result = {
      document: { id: 'doc-1', status: 'queued' },
      task: { id: 'task-1', status: 'pending' },
    };
    const file = new File(['# 说明'], 'README.md', { type: 'text/markdown' });
    const controller = new AbortController();
    apiRequestMock.mockResolvedValue(result);

    await expect(uploadKnowledgeDocument('kb/1', file, controller.signal)).resolves.toBe(result);

    const [url, options] = apiRequestMock.mock.calls[0];
    expect(url).toBe('/api/knowledge-bases/kb%2F1/documents');
    expect(options).toEqual({
      method: 'POST',
      body: expect.any(FormData),
      signal: controller.signal,
    });
    expect(options).not.toHaveProperty('headers');
    expect(Array.from((options.body as FormData).entries())).toEqual([['file', file]]);
  });

  it.each([
    ['删除', deleteKnowledgeDocument, 'DELETE', ''],
    ['重试', retryKnowledgeDocument, 'POST', '/retry'],
    ['重建', rebuildKnowledgeDocument, 'POST', '/rebuild'],
  ] as const)('%s文档时编码全部路径 ID 并解出任务', async (_label, request, method, suffix) => {
    const task = { id: 'task-2', status: 'pending' };
    apiRequestMock.mockResolvedValue({ task });

    await expect(request('kb/1', 'doc/一')).resolves.toBe(task);

    expect(apiRequestMock).toHaveBeenCalledWith(
      `/api/knowledge-bases/kb%2F1/documents/doc%2F%E4%B8%80${suffix}`,
      { method },
    );
  });

  it('查询任务时编码任务 ID 并解出 task', async () => {
    const task = { id: 'task/一', status: 'running' };
    const controller = new AbortController();
    apiRequestMock.mockResolvedValue({ task });

    await expect(getKnowledgeTask('task/一', controller.signal)).resolves.toBe(task);

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/knowledge-bases/tasks/task%2F%E4%B8%80',
      { signal: controller.signal },
    );
  });

  it('不改写 apiRequest 抛出的统一错误', async () => {
    const error = new ApiError('KNOWLEDGE_BASE_DISABLED', '知识库功能尚未启用', 'req-1');
    apiRequestMock.mockRejectedValue(error);

    await expect(listKnowledgeBases()).rejects.toBe(error);
  });
});
