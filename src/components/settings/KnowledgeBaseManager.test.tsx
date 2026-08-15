import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { KnowledgeBase, KnowledgeDocument } from '@/types/knowledge';
import { ApiError } from '@/types/api';

const hookState = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const toastMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useKnowledgeBaseSettings', () => ({
  useKnowledgeBaseSettings: () => hookState.current,
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'zh-CN' },
    t: (key: string, options?: { defaultValue?: string; count?: number; name?: string }) => {
      const labels: Record<string, string> = {
        'knowledgeBase.title': '知识库',
        'knowledgeBase.description': '管理知识库',
        'knowledgeBase.refresh': '刷新',
        'knowledgeBase.create': '新建知识库',
        'knowledgeBase.createTitle': '新建知识库',
        'knowledgeBase.editTitle': '编辑知识库',
        'knowledgeBase.formDescription': '表单说明',
        'knowledgeBase.name': '名称',
        'knowledgeBase.baseDescription': '描述',
        'knowledgeBase.businessType': '业务类型',
        'knowledgeBase.businessTypePlaceholder': 'product_docs',
        'knowledgeBase.save': '保存',
        'knowledgeBase.cancel': '取消',
        'knowledgeBase.edit': '编辑',
        'knowledgeBase.delete': '删除',
        'knowledgeBase.listTitle': '知识库列表',
        'knowledgeBase.documents': '文档',
        'knowledgeBase.supportedTypes': '支持文件类型',
        'knowledgeBase.upload': '上传文档',
        'knowledgeBase.retry': '重试',
        'knowledgeBase.rebuild': '重建索引',
        'knowledgeBase.confirmRebuildTitle': '重建文档索引？',
        'knowledgeBase.confirmRebuildDescription': '重建可能产生费用',
        'knowledgeBase.confirmRetryTitle': '重试文档处理？',
        'knowledgeBase.confirmRetryDescription': '重试可能产生费用',
        'knowledgeBase.confirmDeleteDocumentTitle': '删除文档？',
        'knowledgeBase.confirmDeleteBaseTitle': '删除知识库？',
        'knowledgeBase.confirmDeleteDescription': '异步删除',
        'knowledgeBase.pollingPaused': '自动刷新已暂停',
        'knowledgeBase.chunks': '个切片',
        'knowledgeBase.loading': '加载中',
        'knowledgeBase.updatedAt': '更新于',
        'knowledgeBase.backToBases': '返回知识库列表',
        'knowledgeBase.stats.total': '全部',
        'knowledgeBase.stats.ready': '可用',
        'knowledgeBase.stats.processing': '处理中',
        'knowledgeBase.stats.failed': '失败',
        'knowledgeBase.status.ready': '可用',
        'knowledgeBase.status.failed': '失败',
        'knowledgeBase.status.active': '可用',
        'knowledgeBase.status.queued': '排队中',
        'knowledgeBase.status.unknown': '状态更新中',
        'knowledgeBase.toast.created': '知识库已创建',
        'knowledgeBase.toast.unsupportedFile': '不支持的文件',
        'knowledgeBase.toast.invalidText': '文本字段不能包含 NUL 字符',
        'knowledgeBase.toast.operationFailed': '操作失败',
        'knowledgeBase.errors.documentFailed': '文档处理失败',
        'knowledgeBase.errors.disabled': '知识库功能尚未启用',
        'knowledgeBase.errors.taskFailed': '异步任务执行失败',
      };
      return labels[key] ?? options?.defaultValue ?? key.replace('{{name}}', options?.name ?? '');
    },
  }),
}));

import KnowledgeBaseManager, { prepareKnowledgeFile } from './KnowledgeBaseManager';

function makeBase(): KnowledgeBase {
  return {
    id: 'base-a',
    name: '产品手册',
    description: '产品知识',
    business_type: 'product_docs',
    status: 'active',
    document_stats: { total: 2, ready: 1, processing: 0, failed: 1 },
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

function makeDocument(id: string, status: 'ready' | 'failed'): KnowledgeDocument {
  return {
    id,
    knowledge_base_id: 'base-a',
    filename: `${id}.txt`,
    mimetype: 'text/plain',
    size: 12,
    checksum_sha256: id,
    status,
    parser_version: 'parser-v1',
    chunker_version: 'chunker-v2',
    embedding_provider: 'litellm',
    embedding_model: 'text-embedding-v4',
    embedding_revision: 'dashscope-v4',
    embedding_dimension: 1024,
    distance_metric: 'COSINE',
    desired_index_version: 'v1',
    active_index_version: status === 'ready' ? 'v1' : null,
    chunk_count: status === 'ready' ? 1 : 0,
    error_code: status === 'failed' ? 'PARSE_FAILED' : null,
    error_summary: status === 'failed' ? '解析失败' : null,
    attempt_count: 1,
    created_at: '2026-08-14T00:00:00Z',
    updated_at: '2026-08-14T00:00:00Z',
    ready_at: status === 'ready' ? '2026-08-14T00:00:00Z' : null,
    deleted_at: null,
  };
}

function makeState() {
  const base = makeBase();
  return {
    bases: {
      items: [base],
      page: 1,
      page_size: 20,
      total: 1,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    },
    documents: {
      items: [makeDocument('ready-document', 'ready'), makeDocument('failed-document', 'failed')],
      page: 1,
      page_size: 20,
      total: 2,
      total_pages: 1,
      has_next: false,
      has_prev: false,
    },
    selectedBase: base,
    selectedBaseId: base.id,
    loadingBases: false,
    loadingDocuments: false,
    mutation: null,
    error: null,
    pollingWarning: null,
    pollingPaused: false,
    trackedTasks: [],
    setSelectedBaseId: vi.fn(),
    setBasePage: vi.fn(),
    setDocumentPage: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
    createBase: vi.fn().mockResolvedValue(base),
    updateBase: vi.fn().mockResolvedValue(base),
    removeBase: vi.fn().mockResolvedValue({}),
    uploadDocument: vi.fn().mockResolvedValue(undefined),
    removeDocument: vi.fn().mockResolvedValue(undefined),
    retryDocument: vi.fn().mockResolvedValue(undefined),
    rebuildDocument: vi.fn().mockResolvedValue(undefined),
  };
}

describe('KnowledgeBaseManager', () => {
  beforeEach(() => {
    toastMock.mockReset();
    hookState.current = makeState();
  });

  it('展示知识库统计、文档状态和失败重试入口', () => {
    render(<KnowledgeBaseManager />);

    expect(screen.getByRole('heading', { name: '知识库' })).toBeInTheDocument();
    expect(screen.getAllByText('产品手册')).toHaveLength(2);
    expect(screen.getByText('ready-document.txt')).toBeInTheDocument();
    expect(screen.getByText('文档处理失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重建索引' })).toBeInTheDocument();
  });

  it('创建知识库时提交经过修剪的字段', async () => {
    render(<KnowledgeBaseManager />);

    fireEvent.click(screen.getByRole('button', { name: '新建知识库' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '  新知识库  ' } });
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: '  测试描述  ' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(hookState.current.createBase).toHaveBeenCalledWith({
        name: '新知识库',
        description: '测试描述',
        business_type: 'general',
      }),
    );
    expect(toastMock).toHaveBeenCalledWith({ message: '知识库已创建', type: 'success' });
  });

  it('为浏览器未识别 MIME 的 Markdown 文件补齐受控类型后上传', async () => {
    render(<KnowledgeBaseManager />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['# title'], 'guide.MD', { type: '' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(hookState.current.uploadDocument).toHaveBeenCalledTimes(1));
    const uploaded = vi.mocked(hookState.current.uploadDocument as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as File;
    expect(uploaded.name).toBe('guide.MD');
    expect(uploaded.type).toBe('text/markdown');
  });

  it('允许后端契约支持的 markdown 长扩展名', () => {
    const file = new File(['# title'], 'guide.markdown', { type: '' });

    const prepared = prepareKnowledgeFile(file);

    expect(prepared.name).toBe('guide.markdown');
    expect(prepared.type).toBe('text/markdown');
  });

  it('允许一次选择多个文档并逐个提交', async () => {
    render(<KnowledgeBaseManager />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [
      new File(['first'], 'first.txt', { type: 'text/plain' }),
      new File(['# second'], 'second.md', { type: 'text/markdown' }),
      new File(['third'], 'third.txt', { type: 'text/plain' }),
    ];

    expect(input.multiple).toBe(true);
    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(hookState.current.uploadDocument).toHaveBeenCalledTimes(3));
    expect(
      vi
        .mocked(hookState.current.uploadDocument as ReturnType<typeof vi.fn>)
        .mock.calls.map((call) => (call[1] as File).name),
    ).toEqual(['first.txt', 'second.md', 'third.txt']);
  });

  it('多选上传中单个文件失败时继续提交其余文件', async () => {
    render(<KnowledgeBaseManager />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const uploadDocument = vi.mocked(
      hookState.current.uploadDocument as ReturnType<typeof vi.fn>,
    );
    uploadDocument.mockRejectedValueOnce(new Error('first upload failed'));

    fireEvent.change(input, {
      target: {
        files: [
          new File(['first'], 'first.txt', { type: 'text/plain' }),
          new File(['second'], 'second.txt', { type: 'text/plain' }),
        ],
      },
    });

    await waitFor(() => expect(uploadDocument).toHaveBeenCalledTimes(2));
    expect(toastMock).toHaveBeenCalledWith({
      message: 'knowledgeBase.toast.uploadFailed',
      type: 'error',
    });
  });

  it('在发请求前拒绝不支持的扩展名', () => {
    render(<KnowledgeBaseManager />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'payload.exe', { type: 'application/octet-stream' })] },
    });

    expect(hookState.current.uploadDocument).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({ message: '不支持的文件', type: 'error' });
  });

  it('重试和重建索引都需要二次确认', async () => {
    render(<KnowledgeBaseManager />);

    fireEvent.click(screen.getByRole('button', { name: '重建索引' }));
    expect(hookState.current.rebuildDocument).not.toHaveBeenCalled();
    let dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('重建文档索引？')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '重建索引' }));
    await waitFor(() =>
      expect(hookState.current.rebuildDocument).toHaveBeenCalledWith(
        'base-a',
        'ready-document',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(hookState.current.retryDocument).not.toHaveBeenCalled();
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('重试文档处理？')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '重试' }));
    await waitFor(() =>
      expect(hookState.current.retryDocument).toHaveBeenCalledWith(
        'base-a',
        'failed-document',
      ),
    );
  });

  it('功能未启用时显示可恢复提示且不暴露后端原始消息', () => {
    hookState.current = {
      ...makeState(),
      error: new ApiError('KNOWLEDGE_BASE_DISABLED', 'internal milvus details', 'request-a'),
    };

    render(<KnowledgeBaseManager />);

    expect(screen.getByText('知识库功能尚未启用')).toBeInTheDocument();
    expect(screen.queryByText('internal milvus details')).toBeNull();
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新建知识库' })).toBeDisabled();
  });

  it('自动轮询暂停时提示用户手动刷新', () => {
    hookState.current = { ...makeState(), pollingPaused: true };
    render(<KnowledgeBaseManager />);
    expect(screen.getByText('自动刷新已暂停')).toBeInTheDocument();
  });

  it('提交前拒绝表单中的 NUL 字符', () => {
    render(<KnowledgeBaseManager />);
    fireEvent.click(screen.getByRole('button', { name: '新建知识库' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '非法\0名称' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(hookState.current.createBase).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      message: '文本字段不能包含 NUL 字符',
      type: 'error',
    });
  });

  it('小屏提供列表与详情的显式切换', () => {
    render(<KnowledgeBaseManager />);
    const list = screen.getByTestId('knowledge-base-list');
    const detail = screen.getByTestId('knowledge-base-detail');
    expect(detail).toHaveClass('hidden');

    fireEvent.click(screen.getAllByText('产品手册')[0]);
    expect(list).toHaveClass('hidden');
    expect(detail).not.toHaveClass('hidden');
    fireEvent.click(screen.getByRole('button', { name: '返回知识库列表' }));
    expect(list).not.toHaveClass('hidden');
    expect(detail).toHaveClass('hidden');
  });
});

describe('prepareKnowledgeFile', () => {
  it('保留已经匹配的 MIME，并拒绝超过 50 MB 的文件', () => {
    const textFile = new File(['hello'], 'note.txt', { type: 'text/plain' });
    expect(prepareKnowledgeFile(textFile)).toBe(textFile);

    const largeFile = new File([], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(largeFile, 'size', { value: 50 * 1024 * 1024 + 1 });
    expect(() => prepareKnowledgeFile(largeFile)).toThrow('FILE_TOO_LARGE');
  });
});
