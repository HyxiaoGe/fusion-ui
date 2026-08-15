import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listKnowledgeDocumentChunksMock } = vi.hoisted(() => ({
  listKnowledgeDocumentChunksMock: vi.fn(),
}));

vi.mock('@/lib/api/knowledgeBases', () => ({
  listKnowledgeDocumentChunks: listKnowledgeDocumentChunksMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => ({
      'knowledgeBase.answerEvidence.openSource': `查看知识来源 ${options?.name ?? ''}`,
      'knowledgeBase.answerEvidence.viewChunk': '查看引用分块',
      'knowledgeBase.answerEvidence.loadingSource': '正在加载引用分块',
      'knowledgeBase.answerEvidence.sourceUnavailable': '该来源已删除或不可用',
      'knowledgeBase.answerEvidence.retry': '重试',
      'knowledgeBase.chunkPreview.ordinal': `第 ${options?.number ?? ''} 块`,
      'knowledgeBase.chunkPreview.section': `章节：${options?.section ?? ''}`,
      'knowledgeBase.chunkPreview.page': `第 ${options?.page ?? ''} 页`,
    } as Record<string, string>)[key] ?? key,
  }),
}));

import KnowledgeEvidenceSourcePreview from './KnowledgeEvidenceSourcePreview';
import type { KnowledgeAnswerEvidenceItem } from './answerEvidenceModel';

const source: KnowledgeAnswerEvidenceItem = {
  id: 'knowledge-1',
  kind: 'knowledge',
  title: '手册.md',
  url: '',
  domain: '产品手册',
  sourceIndex: 0,
  citationIndex: 1,
  knowledgeBaseId: 'kb-1',
  knowledgeBaseName: '产品手册',
  documentId: 'doc-1',
  indexVersion: 'v2',
  chunkId: 'chunk-12',
  ordinal: 12,
  filename: '手册.md',
  page: 5,
  section: '安装',
  charStart: 200,
  charEnd: 350,
};

function chunkPage(activeIndexVersion: string) {
  return {
    document_id: 'doc-1',
    active_index_version: activeIndexVersion,
    chunker_version: 'v1',
    chunk_size: 800,
    chunk_overlap: 120,
    items: [{
      chunk_id: 'chunk-12',
      ordinal: 12,
      text: '必须先安装依赖，再启动服务。',
      char_start: 200,
      char_end: 350,
      page: 5,
      section: '安装',
    }],
    page: 2,
    page_size: 10,
    total: 20,
    total_pages: 2,
    has_next: false,
    has_prev: true,
  };
}

describe('KnowledgeEvidenceSourcePreview', () => {
  beforeEach(() => listKnowledgeDocumentChunksMock.mockReset());

  it('按 ordinal 定位页并在版本、chunk_id、ordinal 全部匹配后展示正文', async () => {
    listKnowledgeDocumentChunksMock.mockResolvedValue(chunkPage('v2'));
    render(<KnowledgeEvidenceSourcePreview source={source} />);

    fireEvent.click(screen.getByRole('button', { name: '查看知识来源 手册.md' }));

    expect(await screen.findByText('必须先安装依赖，再启动服务。')).toBeInTheDocument();
    expect(listKnowledgeDocumentChunksMock).toHaveBeenCalledWith(
      'kb-1',
      'doc-1',
      { page: 2, pageSize: 10 },
      expect.any(AbortSignal),
    );
  });

  it('active version 漂移时不展示新版本同序号正文', async () => {
    listKnowledgeDocumentChunksMock.mockResolvedValue(chunkPage('v3'));
    render(<KnowledgeEvidenceSourcePreview source={source} />);

    fireEvent.click(screen.getByRole('button', { name: '查看知识来源 手册.md' }));

    expect(await screen.findByText('该来源已删除或不可用')).toBeInTheDocument();
    expect(screen.queryByText('必须先安装依赖，再启动服务。')).toBeNull();
  });

  it('点击引用后可由侧栏高亮信号自动打开目标分块', async () => {
    listKnowledgeDocumentChunksMock.mockResolvedValue(chunkPage('v2'));
    render(
      <KnowledgeEvidenceSourcePreview source={source} autoOpen autoOpenTick={1} />,
    );

    expect(await screen.findByText('必须先安装依赖，再启动服务。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看知识来源 手册.md' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('React StrictMode 重放 Effect 后仍会重新加载自动打开的分块', async () => {
    listKnowledgeDocumentChunksMock
      .mockImplementationOnce((...args: unknown[]) => {
        const signal = args[3] as AbortSignal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      })
      .mockResolvedValueOnce(chunkPage('v2'));

    render(
      <React.StrictMode>
        <KnowledgeEvidenceSourcePreview source={source} autoOpen autoOpenTick={1} />
      </React.StrictMode>,
    );

    expect(await screen.findByText('必须先安装依赖，再启动服务。')).toBeInTheDocument();
    expect(listKnowledgeDocumentChunksMock).toHaveBeenCalledTimes(2);
  });

  it('自动打开的来源不可用时停在安全提示，不会循环请求', async () => {
    listKnowledgeDocumentChunksMock
      .mockResolvedValueOnce(chunkPage('v3'))
      .mockResolvedValue(chunkPage('v2'));

    render(
      <KnowledgeEvidenceSourcePreview source={source} autoOpen autoOpenTick={1} />,
    );

    expect(await screen.findByText('该来源已删除或不可用')).toBeInTheDocument();
    await waitFor(() => expect(listKnowledgeDocumentChunksMock).toHaveBeenCalledTimes(1));
  });
});
