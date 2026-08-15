import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { KnowledgeDocument, KnowledgeDocumentChunkPage } from '@/types/knowledge';
import { ApiError } from '@/types/api';

const hookState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@/hooks/useKnowledgeDocumentChunks', () => ({
  useKnowledgeDocumentChunks: () => hookState.current,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'knowledgeBase.chunkPreview.title': `分块预览 · ${options?.name ?? ''}`,
        'knowledgeBase.chunkPreview.description': '查看当前生效索引中的文档分块。',
        'knowledgeBase.chunkPreview.close': '关闭分块预览',
        'knowledgeBase.chunkPreview.loading': '正在加载分块',
        'knowledgeBase.chunkPreview.empty': '当前索引没有可预览的分块',
        'knowledgeBase.chunkPreview.total': `共 ${options?.count ?? 0} 个分块`,
        'knowledgeBase.chunkPreview.config': `切片器 ${options?.version ?? ''} · 大小 ${options?.size ?? 0} · 重叠 ${options?.overlap ?? 0}`,
        'knowledgeBase.chunkPreview.ordinal': `第 ${options?.number ?? 0} 块`,
        'knowledgeBase.chunkPreview.section': `章节：${options?.section ?? ''}`,
        'knowledgeBase.chunkPreview.page': `第 ${options?.page ?? 0} 页`,
        'knowledgeBase.chunkPreview.range': `字符 ${options?.start ?? 0}–${options?.end ?? 0}`,
        'knowledgeBase.chunkPreview.retry': '重试',
        'knowledgeBase.chunkPreview.previous': '上一页',
        'knowledgeBase.chunkPreview.next': '下一页',
        'knowledgeBase.chunkPreview.errors.notFound': '文档不存在或已被删除。',
        'knowledgeBase.chunkPreview.errors.notReady': '文档索引尚未就绪，请刷新后重试。',
        'knowledgeBase.chunkPreview.errors.forbidden': '当前账号无权查看该文档。',
        'knowledgeBase.chunkPreview.errors.unauthorized': '登录状态已失效，请重新登录后重试。',
        'knowledgeBase.chunkPreview.errors.unavailable': '分块预览暂时不可用，请稍后重试。',
      };
      return labels[key] ?? key;
    },
  }),
}));

import KnowledgeChunkPreviewDialog from './KnowledgeChunkPreviewDialog';

function makeDocument(): KnowledgeDocument {
  return {
    id: 'document-a',
    knowledge_base_id: 'base-a',
    filename: '说明.md',
    mimetype: 'text/markdown',
    size: 100,
    checksum_sha256: 'checksum',
    status: 'ready',
    parser_version: 'parser-v1',
    chunker_version: 'chunker-v2',
    embedding_provider: 'litellm',
    embedding_model: 'text-embedding-v4',
    embedding_revision: 'dashscope-v4',
    embedding_dimension: 1024,
    distance_metric: 'COSINE',
    desired_index_version: 'index-v1',
    active_index_version: 'index-v1',
    chunk_count: 2,
    error_code: null,
    error_summary: null,
    attempt_count: 1,
    created_at: '2026-08-15T00:00:00Z',
    updated_at: '2026-08-15T00:00:00Z',
    ready_at: '2026-08-15T00:00:00Z',
    deleted_at: null,
  };
}

function page(items = defaultItems): KnowledgeDocumentChunkPage {
  return {
    document_id: 'document-a',
    active_index_version: 'index-v1',
    chunker_version: 'chunker-v2',
    chunk_size: 1000,
    chunk_overlap: 100,
    items,
    page: 1,
    page_size: 10,
    total: items.length,
    total_pages: items.length > 0 ? 2 : 0,
    has_next: items.length > 0,
    has_prev: false,
  };
}

const defaultItems = [
  {
    chunk_id: 'chunk-a',
    ordinal: 0,
    text: '# 标题\n<script>alert("x")</script> [链接](https://internal.example)',
    char_start: 0,
    char_end: 60,
    page: 3,
    section: '介绍',
  },
];

function baseHookState() {
  return {
    data: page(),
    page: 1,
    loading: false,
    error: null,
    setPage: vi.fn(),
    retry: vi.fn(),
  };
}

describe('KnowledgeChunkPreviewDialog', () => {
  beforeEach(() => {
    hookState.current = baseHookState();
  });

  it('展示分块总数、配置、位置元数据和纯文本正文', () => {
    render(
      <KnowledgeChunkPreviewDialog
        open
        knowledgeBaseId="base-a"
        document={makeDocument()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('共 1 个分块');
    expect(screen.getByText('切片器 chunker-v2 · 大小 1000 · 重叠 100')).toBeInTheDocument();
    expect(screen.getByText('第 1 块')).toBeInTheDocument();
    expect(screen.getByText('章节：介绍')).toBeInTheDocument();
    expect(screen.getByText('第 3 页')).toBeInTheDocument();
    expect(screen.getByText('字符 0–60')).toBeInTheDocument();
    expect(screen.getByText(/<script>alert/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '链接' })).toBeNull();
    expect(globalThis.document.querySelector('script')).toBeNull();
  });

  it('为相邻分块提供不同的视觉标识和独立可访问名称', () => {
    hookState.current = {
      ...baseHookState(),
      data: page([
        defaultItems[0],
        {
          ...defaultItems[0],
          chunk_id: 'chunk-b',
          ordinal: 1,
          text: '第二个分块正文',
          char_start: 50,
          char_end: 110,
        },
      ]),
    };

    render(
      <KnowledgeChunkPreviewDialog
        open
        knowledgeBaseId="base-a"
        document={makeDocument()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('article', { name: '第 1 块' })).toHaveAttribute(
      'data-chunk-accent',
      '0',
    );
    expect(screen.getByRole('article', { name: '第 2 块' })).toHaveAttribute(
      'data-chunk-accent',
      '1',
    );
  });

  it('覆盖加载、空态和安全错误，并支持重试', () => {
    hookState.current = { ...baseHookState(), data: null, loading: true };
    const { rerender } = render(
      <KnowledgeChunkPreviewDialog
        open
        knowledgeBaseId="base-a"
        document={makeDocument()}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('status', { name: '正在加载分块' })).toBeInTheDocument();

    hookState.current = { ...baseHookState(), data: page([]) };
    rerender(
      <KnowledgeChunkPreviewDialog
        open
        knowledgeBaseId="base-a"
        document={makeDocument()}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText('当前索引没有可预览的分块')).toBeInTheDocument();

    const retry = vi.fn();
    hookState.current = {
      ...baseHookState(),
      data: null,
      error: new ApiError('KNOWLEDGE_STORAGE_UNAVAILABLE', 'Milvus 192.168.1.54 failed', 'req-secret'),
      retry,
    };
    rerender(
      <KnowledgeChunkPreviewDialog
        open
        knowledgeBaseId="base-a"
        document={makeDocument()}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText('分块预览暂时不可用，请稍后重试。')).toBeInTheDocument();
    expect(screen.queryByText(/Milvus|192\.168|req-secret/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('分页时调用 hook，并在切页加载失败时保留已有内容', () => {
    const setPage = vi.fn();
    hookState.current = {
      ...baseHookState(),
      loading: false,
      error: new ApiError('CONFLICT', 'active index changed', 'req-a'),
      setPage,
    };
    render(
      <KnowledgeChunkPreviewDialog
        open
        knowledgeBaseId="base-a"
        document={makeDocument()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/<script>alert/)).toBeInTheDocument();
    expect(screen.getByText('文档索引尚未就绪，请刷新后重试。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(setPage).toHaveBeenCalledWith(2);
  });

  it('关闭内层预览时不关闭外层设置对话框', () => {
    const closePreview = vi.fn();
    const closeSettings = vi.fn();
    render(
      <Dialog open onOpenChange={closeSettings}>
        <DialogContent>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>设置内容说明</DialogDescription>
          <span>设置内容</span>
          <KnowledgeChunkPreviewDialog
            open
            knowledgeBaseId="base-a"
            document={makeDocument()}
            onOpenChange={closePreview}
          />
        </DialogContent>
      </Dialog>,
    );

    const previewDialog = screen.getByRole('dialog', { name: /分块预览/ });
    fireEvent.click(within(previewDialog).getByRole('button', { name: '关闭分块预览' }));
    expect(closePreview).toHaveBeenCalledWith(false);
    expect(closeSettings).not.toHaveBeenCalled();
    expect(screen.getByText('设置内容')).toBeInTheDocument();
  });
});
