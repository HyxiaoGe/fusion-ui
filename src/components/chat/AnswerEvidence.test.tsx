import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnswerEvidenceModel } from './answerEvidenceModel';
import { deriveAnswerEvidence } from './answerEvidenceModel';
import AnswerEvidence from './AnswerEvidence';

function evidence(overrides: Partial<AnswerEvidenceModel>): AnswerEvidenceModel {
  return {
    items: [],
    previewItems: [],
    searchCount: 0,
    urlCount: 0,
    totalCount: 0,
    hiddenSearchCount: 0,
    hiddenUrlCount: 0,
    summary: '回答依据',
    hasSearchSources: false,
    ...overrides,
  };
}

describe('AnswerEvidence', () => {
  it('evidence 为 null 时不渲染', () => {
    const { container } = render(
      <AnswerEvidence evidence={null} onSourceClick={vi.fn()} onOpenSources={vi.fn()} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('evidence 非 null 但 totalCount=0 时不渲染', () => {
    const { container } = render(
      <AnswerEvidence evidence={evidence({})} onSourceClick={vi.fn()} onOpenSources={vi.fn()} />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('显示搜索来源摘要并支持点击来源', () => {
    const onSourceClick = vi.fn();

    render(
      <AnswerEvidence
        evidence={deriveAnswerEvidence({
          searchSources: [{ title: '标题', url: 'https://example.com' }],
          urlBlocks: [],
        })}
        onSourceClick={onSourceClick}
        onOpenSources={vi.fn()}
      />,
    );

    expect(screen.getByText('回答依据 · 搜索 1 条')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看来源：标题' }));
    expect(onSourceClick).toHaveBeenCalledWith(0);
  });

  it('使用低权重 metadata strip 和轻量依据项样式', () => {
    const { container } = render(
      <AnswerEvidence
        evidence={evidence({
          items: [
            {
              id: 'search-0',
              kind: 'search_source',
              title: '搜索标题',
              url: 'https://search.example.com',
              domain: 'search.example.com',
              sourceIndex: 0,
            },
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: '网页标题',
              url: 'https://example.com/article',
              domain: 'example.com',
            },
          ],
          previewItems: [
            {
              id: 'search-0',
              kind: 'search_source',
              title: '搜索标题',
              url: 'https://search.example.com',
              domain: 'search.example.com',
              sourceIndex: 0,
            },
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: '网页标题',
              url: 'https://example.com/article',
              domain: 'example.com',
            },
          ],
          searchCount: 1,
          urlCount: 1,
          totalCount: 2,
          summary: '回答依据 · 搜索 1 条 · 读取 1 个网页',
          hasSearchSources: true,
        })}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
      />,
    );

    expect(container.querySelector('section')).toHaveClass(
      'mb-2',
      'rounded-md',
      'border',
      'border-border/30',
      'bg-transparent',
      'px-2.5',
      'py-2',
      'text-xs',
      'text-muted-foreground',
    );

    const sourceButton = screen.getByRole('button', { name: '查看来源：搜索标题' });
    expect(sourceButton).toHaveClass(
      'inline-flex',
      'min-w-0',
      'max-w-full',
      'items-center',
      'gap-1.5',
      'rounded-md',
      'border',
      'border-border/30',
      'bg-muted/10',
      'px-2',
      'py-1',
      'text-left',
      'transition-colors',
      'hover:bg-muted/30',
    );

    const urlLink = screen.getByRole('link', { name: '打开网页：网页标题' });
    expect(urlLink).toHaveClass(
      'inline-flex',
      'gap-1.5',
      'border-border/30',
      'bg-muted/10',
      'py-1',
      'hover:bg-muted/30',
      'no-underline',
    );
  });

  it('显示 URL 读取摘要并渲染外部链接', () => {
    render(
      <AnswerEvidence
        evidence={evidence({
          items: [
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: '标题',
              url: 'https://example.com/article',
              domain: 'example.com',
            },
          ],
          previewItems: [
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: '标题',
              url: 'https://example.com/article',
              domain: 'example.com',
            },
          ],
          urlCount: 1,
          totalCount: 1,
          summary: '回答依据 · 读取 1 个网页',
        })}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
      />,
    );

    expect(screen.getByText('回答依据 · 读取 1 个网页')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '打开网页：标题' });
    expect(link).toHaveAttribute('href', 'https://example.com/article');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('搜索和 URL 同时存在时显示组合摘要并渲染 URL link', () => {
    render(
      <AnswerEvidence
        evidence={evidence({
          items: [
            {
              id: 'search-0',
              kind: 'search_source',
              title: '搜索标题',
              url: 'https://search.example.com',
              domain: 'search.example.com',
              sourceIndex: 0,
            },
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: '网页标题',
              url: 'https://example.com/article',
              domain: 'example.com',
            },
          ],
          previewItems: [
            {
              id: 'search-0',
              kind: 'search_source',
              title: '搜索标题',
              url: 'https://search.example.com',
              domain: 'search.example.com',
              sourceIndex: 0,
            },
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: '网页标题',
              url: 'https://example.com/article',
              domain: 'example.com',
            },
          ],
          searchCount: 1,
          urlCount: 1,
          totalCount: 2,
          hiddenSearchCount: 0,
          summary: '回答依据 · 搜索 1 条 · 读取 1 个网页',
          hasSearchSources: true,
        })}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
      />,
    );

    expect(screen.getByText('回答依据 · 搜索 1 条 · 读取 1 个网页')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开网页：网页标题' })).toBeInTheDocument();
  });

  it('存在更多搜索来源时支持查看全部搜索来源', () => {
    const onOpenSources = vi.fn();

    render(
      <AnswerEvidence
        evidence={evidence({
          items: [
            {
              id: 'search-0',
              kind: 'search_source',
              title: '标题 1',
              url: 'https://one.example.com',
              domain: 'one.example.com',
              sourceIndex: 0,
            },
            {
              id: 'search-1',
              kind: 'search_source',
              title: '标题 2',
              url: 'https://two.example.com',
              domain: 'two.example.com',
              sourceIndex: 1,
            },
          ],
          previewItems: [
            {
              id: 'search-0',
              kind: 'search_source',
              title: '标题 1',
              url: 'https://one.example.com',
              domain: 'one.example.com',
              sourceIndex: 0,
            },
          ],
          searchCount: 2,
          totalCount: 2,
          hiddenSearchCount: 1,
          summary: '回答依据 · 搜索 2 条',
          hasSearchSources: true,
        })}
        onSourceClick={vi.fn()}
        onOpenSources={onOpenSources}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看全部搜索来源' }));
    expect(onOpenSources).toHaveBeenCalledTimes(1);
    expect(screen.getByText('查看全部搜索来源')).toBeInTheDocument();
  });

  it('5 条搜索来源默认预览 3 条时提示隐藏搜索来源并保留侧栏入口', () => {
    const onOpenSources = vi.fn();

    render(
      <AnswerEvidence
        evidence={deriveAnswerEvidence({
          searchSources: Array.from({ length: 5 }, (_, index) => ({
            title: `搜索 ${index + 1}`,
            url: `https://search-${index + 1}.example.com`,
          })),
          urlBlocks: [],
          previewLimit: 3,
        })}
        onSourceClick={vi.fn()}
        onOpenSources={onOpenSources}
      />,
    );

    expect(screen.getByText('回答依据 · 搜索 5 条')).toBeInTheDocument();
    expect(screen.getByText('另有 2 条搜索来源')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查看全部搜索来源' }));
    expect(onOpenSources).toHaveBeenCalledTimes(1);
  });

  it('只有 URL 超过预览上限时显示隐藏网页数量', () => {
    render(
      <AnswerEvidence
        evidence={evidence({
          items: [
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: '标题 1',
              url: 'https://one.example.com',
              domain: 'one.example.com',
            },
            {
              id: 'url-url-2',
              kind: 'url_read',
              title: '标题 2',
              url: 'https://two.example.com',
              domain: 'two.example.com',
            },
          ],
          previewItems: [
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: '标题 1',
              url: 'https://one.example.com',
              domain: 'one.example.com',
            },
          ],
          urlCount: 2,
          totalCount: 2,
          hiddenUrlCount: 1,
          summary: '回答依据 · 读取 2 个网页',
        })}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
      />,
    );

    expect(screen.getByText('另有 1 个网页')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看全部搜索来源' })).toBeNull();
  });

  it('混合依据中搜索少 URL 多时补足 URL 外链且不显示搜索侧栏按钮', () => {
    render(
      <AnswerEvidence
        evidence={deriveAnswerEvidence({
          searchSources: [{ title: '搜索标题', url: 'https://search.example.com' }],
          urlBlocks: [
            { type: 'url_read', id: 'url-1', title: '网页 1', url: 'https://one.example.com' },
            { type: 'url_read', id: 'url-2', title: '网页 2', url: 'https://two.example.com' },
            { type: 'url_read', id: 'url-3', title: '网页 3', url: 'https://three.example.com' },
            { type: 'url_read', id: 'url-4', title: '网页 4', url: 'https://four.example.com' },
          ],
          previewLimit: 3,
        })}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: '打开网页：网页 1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '打开网页：网页 2' })).toBeInTheDocument();
    expect(screen.getByText('另有 2 个网页')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看全部搜索来源' })).toBeNull();
    expect(screen.queryByRole('button', { name: '查看全部参考资料' })).toBeNull();
  });

  it('混合依据中搜索被隐藏时显示搜索侧栏按钮并提示隐藏 URL', () => {
    const onOpenSources = vi.fn();

    render(
      <AnswerEvidence
        evidence={deriveAnswerEvidence({
          searchSources: [
            { title: '搜索 1', url: 'https://search-one.example.com' },
            { title: '搜索 2', url: 'https://search-two.example.com' },
            { title: '搜索 3', url: 'https://search-three.example.com' },
            { title: '搜索 4', url: 'https://search-four.example.com' },
          ],
          urlBlocks: [
            { type: 'url_read', id: 'url-1', title: '网页 1', url: 'https://one.example.com' },
            { type: 'url_read', id: 'url-2', title: '网页 2', url: 'https://two.example.com' },
          ],
          previewLimit: 3,
        })}
        onSourceClick={vi.fn()}
        onOpenSources={onOpenSources}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '查看全部搜索来源' }));
    expect(onOpenSources).toHaveBeenCalledTimes(1);
    expect(screen.getByText('另有 1 个网页')).toBeInTheDocument();
  });

  it('同时隐藏搜索来源和 URL 时两个提示都显示', () => {
    render(
      <AnswerEvidence
        evidence={deriveAnswerEvidence({
          searchSources: [
            { title: '搜索 1', url: 'https://search-one.example.com' },
            { title: '搜索 2', url: 'https://search-two.example.com' },
            { title: '搜索 3', url: 'https://search-three.example.com' },
            { title: '搜索 4', url: 'https://search-four.example.com' },
          ],
          urlBlocks: [
            { type: 'url_read', id: 'url-1', title: '网页 1', url: 'https://one.example.com' },
            { type: 'url_read', id: 'url-2', title: '网页 2', url: 'https://two.example.com' },
            { type: 'url_read', id: 'url-3', title: '网页 3', url: 'https://three.example.com' },
          ],
          previewLimit: 3,
        })}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
      />,
    );

    expect(screen.getByText('另有 2 条搜索来源')).toBeInTheDocument();
    expect(screen.getByText('另有 2 个网页')).toBeInTheDocument();
  });

  it('长标题文本节点保留 title 属性和 truncate class', () => {
    const longTitle = '一段非常非常非常长的网页标题'.repeat(10);

    const { container } = render(
      <AnswerEvidence
        evidence={evidence({
          items: [
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: longTitle,
              url: 'https://example.com/article',
              domain: 'example.com',
            },
          ],
          previewItems: [
            {
              id: 'url-url-1',
              kind: 'url_read',
              title: longTitle,
              url: 'https://example.com/article',
              domain: 'example.com',
            },
          ],
          urlCount: 1,
          totalCount: 1,
          summary: '回答依据 · 读取 1 个网页',
        })}
        onSourceClick={vi.fn()}
        onOpenSources={vi.fn()}
      />,
    );

    const titleNode = container.querySelector('span[title]');
    expect(titleNode).toHaveAttribute('title', longTitle);
    expect(titleNode).toHaveClass('truncate');
  });
});
