import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MarkdownRenderer from './MarkdownRenderer';

// mock CodeBlock，避免拉入 syntax-highlighter 重量依赖
vi.mock('./CodeBlock', () => ({
  default: ({ value }: { value: string }) => <pre data-testid="code-block">{value}</pre>,
}));

const mockSources = [
  { url: 'https://a.com', title: 'Source A', favicon: '' },
  { url: 'https://b.com', title: 'Source B', favicon: '' },
];

describe('MarkdownRenderer — citation 行为（contract §9）', () => {
  it('文本里的 [1] 渲染为可点击 chip（button 包含数字 1）', () => {
    render(
      <MarkdownRenderer
        content="Hello [1] world"
        sources={mockSources}
        onCitationClick={vi.fn()}
      />
    );
    // chip 是 button，aria-label 含"参考资料 1"
    const chip = screen.getByRole('button', { name: /参考资料 1/ });
    expect(chip).toBeTruthy();
    expect(chip.textContent).toBe('1');
  });

  it('点击 [1] chip 触发 onCitationClick(0)（0-based）', () => {
    const onCite = vi.fn();
    render(
      <MarkdownRenderer
        content="See [1]"
        sources={mockSources}
        onCitationClick={onCite}
      />
    );
    const chip = screen.getByRole('button', { name: /参考资料 1/ });
    fireEvent.click(chip);
    expect(onCite).toHaveBeenCalledTimes(1);
    expect(onCite).toHaveBeenCalledWith(0);
  });

  it('未在 sources 范围内的 [99] 保留原文不转 chip', () => {
    const { container } = render(
      <MarkdownRenderer
        content="Foo [99] bar"
        sources={mockSources}
        onCitationClick={vi.fn()}
      />
    );
    // 原文 [99] 应出现在 DOM 文本中
    expect(container.textContent).toContain('[99]');
    // 不应渲染 button
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('行内代码块内的 `[1]` 不转 chip（code 组件不经 processChildren）', () => {
    const { container } = render(
      <MarkdownRenderer
        content="Use `[1]` syntax"
        sources={mockSources}
        onCitationClick={vi.fn()}
      />
    );
    // preprocessCitations 会把 [1] 转为 ⟦1⟧ 占位符（全文替换）
    // 但 code 组件不经 processChildren，所以占位符不会进一步转为 button chip
    const codeEl = container.querySelector('code');
    expect(codeEl).toBeTruthy();
    // code 里是占位符 ⟦1⟧，不是 chip button
    expect(codeEl!.textContent).not.toBe('1');
    // 整个渲染结果没有 citation button
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });
});
