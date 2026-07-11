import { fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CodeBlock from './CodeBlock';

const highlightMock = vi.hoisted(() => vi.fn((value: string) => ({
  value: `<mark>${value}</mark>`,
})));
const highlightAutoMock = vi.hoisted(() => vi.fn((value: string) => ({
  value: `<em>${value}</em>`,
})));
const getLanguageMock = vi.hoisted(() => vi.fn((language: string) => language !== 'unknown'));

vi.mock('highlight.js', () => ({
  default: {
    getLanguage: getLanguageMock,
    highlight: highlightMock,
    highlightAuto: highlightAutoMock,
  },
}));

describe('CodeBlock', () => {
  beforeEach(() => {
    highlightMock.mockClear();
    highlightAutoMock.mockClear();
    getLanguageMock.mockClear();
  });

  it('首个 HTML commit 已包含高亮代码，不经过空内容占位', () => {
    const html = renderToString(
      <CodeBlock language="ts" value="const answer = 42;" />,
    );

    expect(html).toContain('<mark>const answer = 42;</mark>');
    expect(highlightMock).toHaveBeenCalledTimes(1);
  });

  it('每次流式 value 增量只执行一次高亮', () => {
    const { rerender } = render(
      <CodeBlock language="ts" value={'const a = 1;\nconst b = 2;'} maxLines={12} />,
    );

    expect(highlightMock).toHaveBeenCalledTimes(1);

    rerender(
      <CodeBlock language="ts" value={'const a = 1;\nconst b = 2;\nconst c = 3;'} maxLines={12} />,
    );

    expect(highlightMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('3 行')).toBeInTheDocument();
  });

  it('长代码默认折叠，只高亮可见行且可以展开', () => {
    render(
      <CodeBlock language="ts" value={'line 1\nline 2\nline 3'} maxLines={2} />,
    );

    expect(screen.getByText('2/3 行')).toBeInTheDocument();
    expect(screen.getByText('显示剩余 1 行代码')).toBeInTheDocument();
    const code = document.querySelector('code.language-ts');
    expect(code?.textContent).toBe('line 1\nline 2');
    expect(code?.textContent).not.toContain('line 3');
    expect(highlightMock).toHaveBeenCalledTimes(1);
    expect(highlightMock).toHaveBeenLastCalledWith('line 1\nline 2', { language: 'typescript' });

    fireEvent.click(screen.getByTitle('展开代码'));

    expect(screen.getByText('3 行')).toBeInTheDocument();
    expect(code?.textContent).toBe('line 1\nline 2\nline 3');
  });

  it('未知语言回退自动检测并同步渲染结果', () => {
    const html = renderToString(
      <CodeBlock language="unknown" value="some code" showLineNumbers={false} />,
    );

    expect(html).toContain('<em>some code</em>');
    expect(highlightAutoMock).toHaveBeenCalledTimes(1);
    expect(highlightMock).not.toHaveBeenCalled();
  });
});
