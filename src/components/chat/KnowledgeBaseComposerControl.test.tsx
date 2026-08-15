import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => ({
      'knowledgeBase.composer.trigger': '知识库',
      'knowledgeBase.composer.title': '选择知识库',
      'knowledgeBase.composer.description': '最多选择 5 个可用知识库',
      'knowledgeBase.composer.loading': '正在加载知识库',
      'knowledgeBase.composer.empty': '暂无可用于问答的知识库',
      'knowledgeBase.composer.failed': '知识库列表加载失败',
      'knowledgeBase.composer.retry': '重试',
      'knowledgeBase.composer.clear': '清空',
      'knowledgeBase.composer.selectedCount': `已选择 ${options?.count ?? 0} 个`,
      'knowledgeBase.composer.limit': '最多只能选择 5 个知识库',
      'knowledgeBase.composer.strict': '严格知识库模式',
      'knowledgeBase.composer.remove': `移除知识库 ${options?.name ?? ''}`,
      'knowledgeBase.composer.validating': '正在确认知识库',
      'knowledgeBase.composer.validationFailed': '知识库状态待确认',
      'knowledgeBase.composer.validatingHint': '正在确认所选知识库是否可用，请稍后。',
      'knowledgeBase.composer.failedSelectionHint': '知识库列表加载失败，请重试后再发送。',
      'knowledgeBase.composer.unavailable': '知识库已不可用',
      'knowledgeBase.composer.unavailableHint': '已选知识库已不可用，请移除后再发送。',
    } as Record<string, string>)[key] ?? key,
  }),
}));

import KnowledgeBaseComposerControl from './KnowledgeBaseComposerControl';

function page(items: Array<Record<string, unknown>>) {
  return {
    items,
    page: 1,
    page_size: 100,
    total: items.length,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  };
}

function base(id: string, overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('KnowledgeBaseComposerControl', () => {
  beforeEach(() => {
    getChatCapabilitiesMock.mockReset();
    getChatCapabilitiesMock.mockResolvedValue({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
    });
    listKnowledgeBasesMock.mockReset();
  });

  it('旧服务端缺少能力握手时不加载或允许选择知识库', async () => {
    getChatCapabilitiesMock.mockRejectedValue(new Error('404'));
    render(
      <KnowledgeBaseComposerControl selectedIds={[]} onChange={vi.fn()} disabled={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '知识库' }));
    await screen.findByText('知识库列表加载失败');
    expect(listKnowledgeBasesMock).not.toHaveBeenCalled();
  });

  it('只列出 active 且至少一个 ready 文档的知识库，并限制最多选择 5 个', async () => {
    listKnowledgeBasesMock.mockResolvedValue(page([
      ...Array.from({ length: 6 }, (_, index) => base(`kb-${index + 1}`)),
      base('processing', { document_stats: { total: 1, ready: 0, processing: 1, failed: 0 } }),
      base('deleting', { status: 'deleting' }),
    ]));
    const onChange = vi.fn();
    const { rerender } = render(
      <KnowledgeBaseComposerControl selectedIds={[]} onChange={onChange} disabled={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '知识库' }));
    await screen.findByText('知识库 kb-1');
    expect(screen.queryByText('知识库 processing')).toBeNull();
    expect(screen.queryByText('知识库 deleting')).toBeNull();

    let selected: string[] = [];
    for (let index = 1; index <= 5; index += 1) {
      fireEvent.click(screen.getByRole('checkbox', { name: `知识库 kb-${index}` }));
      selected = [...selected, `kb-${index}`];
      expect(onChange).toHaveBeenLastCalledWith(selected);
      rerender(
        <KnowledgeBaseComposerControl selectedIds={selected} onChange={onChange} disabled={false} />,
      );
    }

    expect(screen.getByRole('checkbox', { name: '知识库 kb-6' })).toBeDisabled();
  });

  it('忽略快速切换作用域后的迟到列表请求', async () => {
    let resolveOld!: (value: ReturnType<typeof page>) => void;
    const oldRequest = new Promise<ReturnType<typeof page>>((resolve) => { resolveOld = resolve; });
    listKnowledgeBasesMock
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce(page([base('new')]));

    const { rerender } = render(
      <KnowledgeBaseComposerControl scopeKey="chat-a" selectedIds={[]} onChange={vi.fn()} disabled={false} />,
    );
    rerender(
      <KnowledgeBaseComposerControl scopeKey="chat-b" selectedIds={[]} onChange={vi.fn()} disabled={false} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '知识库' }));
    await screen.findByText('知识库 new');

    await act(async () => {
      resolveOld(page([base('old')]));
    });

    expect(screen.queryByText('知识库 old')).toBeNull();
    expect(screen.getByText('知识库 new')).toBeInTheDocument();
  });

  it('服务端持续返回 has_next 时最多拉取 20 页', async () => {
    listKnowledgeBasesMock.mockImplementation(async ({ page: requestedPage }: { page: number }) => ({
      ...page([]),
      page: requestedPage,
      total_pages: 999,
      has_next: true,
    }));

    render(
      <KnowledgeBaseComposerControl selectedIds={[]} onChange={vi.fn()} disabled={false} />,
    );

    await waitFor(() => {
      expect(listKnowledgeBasesMock).toHaveBeenCalledTimes(20);
    });
    expect(listKnowledgeBasesMock).toHaveBeenLastCalledWith(
      { page: 20, pageSize: 100 },
      expect.any(AbortSignal),
    );
  });

  it('知识库分页累计扫描最多 1000 项', async () => {
    listKnowledgeBasesMock.mockImplementation(async ({ page: requestedPage }: { page: number }) => ({
      ...page(Array.from({ length: 100 }, (_, index) => base(
        `${requestedPage}-${index}`,
        { status: 'deleting' },
      ))),
      page: requestedPage,
      total: 10_000,
      total_pages: 100,
      has_next: true,
    }));

    render(
      <KnowledgeBaseComposerControl selectedIds={[]} onChange={vi.fn()} disabled={false} />,
    );

    await waitFor(() => {
      expect(listKnowledgeBasesMock).toHaveBeenCalledTimes(10);
    });
    expect(listKnowledgeBasesMock).toHaveBeenLastCalledWith(
      { page: 10, pageSize: 100 },
      expect.any(AbortSignal),
    );
  });

  it('保留但标记服务端恢复后已不可用的选择，并要求先移除', async () => {
    listKnowledgeBasesMock.mockResolvedValue(page([base('kb-ready')]));
    render(
      <KnowledgeBaseComposerControl
        selectedIds={['kb-deleted']}
        onChange={vi.fn()}
        disabled={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('知识库已不可用')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('已选知识库已不可用，请移除后再发送。');
  });

  it('恢复选择后在列表加载与失败阶段保持安全阻断反馈', async () => {
    let rejectRequest!: (error: Error) => void;
    listKnowledgeBasesMock.mockReturnValue(new Promise((_, reject) => {
      rejectRequest = reject;
    }));
    const onSelectionStatusChange = vi.fn();
    render(
      <KnowledgeBaseComposerControl
        selectedIds={['kb-1']}
        onChange={vi.fn()}
        disabled={false}
        onSelectionStatusChange={onSelectionStatusChange}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('正在确认所选知识库是否可用，请稍后。');
    expect(onSelectionStatusChange).toHaveBeenLastCalledWith('loading');

    await act(async () => {
      rejectRequest(new Error('network failed'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('知识库列表加载失败，请重试后再发送。');
    expect(onSelectionStatusChange).toHaveBeenLastCalledWith('failed');
  });
});
