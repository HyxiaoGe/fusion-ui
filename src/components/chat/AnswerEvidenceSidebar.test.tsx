import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnswerEvidenceSidebarModel } from './answerEvidenceSidebarModel';
import AnswerEvidenceSidebar from './AnswerEvidenceSidebar';

const model: AnswerEvidenceSidebarModel = {
  summary: {
    usedCount: 2,
    searchCount: 1,
    urlCount: 1,
    issueCount: 2,
  },
  usedItems: [
    {
      id: 'search-0',
      kind: 'search',
      title: '搜索来源',
      url: 'https://search.example.com/a',
      domain: 'search.example.com',
      favicon: 'https://search.example.com/favicon.ico',
      sourceIndex: 0,
    },
    {
      id: 'url-url-1',
      kind: 'url_read',
      title: '读取来源',
      url: 'https://reader.example.com/a',
      domain: 'reader.example.com',
    },
  ],
  issueItems: [
    {
      id: 'issue-1',
      kind: 'url_read',
      title: '失败页面',
      url: 'https://failed.example.com',
      domain: 'failed.example.com',
      status: 'failed',
      reason: 'timeout',
    },
    {
      id: 'issue-2',
      kind: 'search',
      title: '降级搜索',
      status: 'degraded',
      reason: '部分内容不可用，已降级处理',
    },
  ],
  isRenderable: true,
};

describe('AnswerEvidenceSidebar', () => {
  it('closed 时不渲染侧栏内容', () => {
    const { container } = render(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={false}
        onClose={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-testid="answer-evidence-sidebar"]')).toBeNull();
  });

  it('渲染摘要、已使用来源和异常来源', () => {
    render(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '回答依据' })).toBeInTheDocument();
    expect(screen.getByText('已使用 2 条 · 搜索 1 条 · 读取 1 个网页')).toBeInTheDocument();
    expect(screen.getByText('2 个未使用')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '已使用来源' })).toBeInTheDocument();
    expect(screen.getByText('搜索来源')).toBeInTheDocument();
    expect(screen.getByAltText('')).toHaveAttribute('src', 'https://search.example.com/favicon.ico');
    expect(screen.getByText('读取来源')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '未使用或异常' })).toBeInTheDocument();
    expect(screen.getByText('失败页面')).toBeInTheDocument();
    expect(screen.getByText('timeout')).toBeInTheDocument();
    expect(screen.getByText('降级搜索')).toBeInTheDocument();
  });

  it('渲染联网诊断分区', () => {
    render(
      <AnswerEvidenceSidebar
        model={model}
        diagnostics={{
          summaryText: '联网诊断 · 搜索 1 次 · 用时 1.2s',
          issueItems: [],
          tools: [],
          canShowAdminDetails: false,
        }}
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId('network-diagnostics-panel')).toBeInTheDocument();
    expect(screen.getByText('联网诊断 · 搜索 1 次 · 用时 1.2s')).toBeInTheDocument();
  });

  it('打开时使用 dialog 语义并聚焦关闭按钮', () => {
    render(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: '回答依据' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('answer-evidence-sidebar')).toHaveClass('max-w-[100vw]');
    expect(screen.getByRole('button', { name: '关闭回答依据' })).toHaveFocus();
  });

  it('点击关闭按钮触发 onClose', () => {
    const onClose = vi.fn();

    render(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={true}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭回答依据' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('按 ESC 或点击遮罩触发 onClose', () => {
    const onClose = vi.fn();

    render(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={true}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByLabelText('关闭回答依据背景'));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('高亮指定的搜索来源', () => {
    render(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={true}
        onClose={vi.fn()}
        highlightIndex={0}
      />,
    );

    expect(screen.getByTestId('answer-evidence-used-search-0')).toHaveClass('border-l-info');
  });

  it('highlightTick 变化时重复滚动到同一个搜索来源', () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    const { rerender } = render(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={true}
        onClose={vi.fn()}
        highlightIndex={0}
        highlightTick={1}
      />,
    );

    vi.advanceTimersByTime(100);

    rerender(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={true}
        onClose={vi.fn()}
        highlightIndex={0}
        highlightTick={2}
      />,
    );
    vi.advanceTimersByTime(100);

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('外链按钮带正确 href 和 aria-label', () => {
    render(
      <AnswerEvidenceSidebar
        model={model}
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: '打开来源：搜索来源' })).toHaveAttribute(
      'href',
      'https://search.example.com/a',
    );
    expect(screen.getByRole('link', { name: '打开来源：读取来源' })).toHaveAttribute(
      'href',
      'https://reader.example.com/a',
    );
  });
});
