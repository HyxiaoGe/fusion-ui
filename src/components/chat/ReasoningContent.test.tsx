import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReasoningContent from './ReasoningContent';

vi.mock('./CodeBlock', () => ({
  default: ({ language, value }: { language: string; value: string }) => (
    <pre data-testid="reasoning-code-block" data-language={language}>{value}</pre>
  ),
}));

describe('ReasoningContent', () => {
  it('完成态使用低权重透明容器并保留折叠与耗时文案', () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ReasoningContent
        content="已经完成的思考"
        isStreaming={false}
        isVisible={false}
        onToggle={onToggle}
        duration="1.2"
      />,
    );

    expect(container.firstElementChild).toHaveClass(
      'rounded-lg',
      'border',
      'mb-2',
      'overflow-hidden',
      'transition-all',
      'duration-300',
      'border-border/40',
      'bg-transparent',
    );
    expect(screen.getByText('已深度思考（用时 1.2 秒）')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('streaming 态保留 info 色调但容器仍是紧凑辅助层', () => {
    const { container } = render(
      <ReasoningContent
        content="正在推理"
        isStreaming={true}
        isVisible={false}
        onToggle={vi.fn()}
      />,
    );

    expect(container.firstElementChild).toHaveClass(
      'rounded-lg',
      'border',
      'mb-2',
      'border-info-border',
      'bg-info-bg',
    );
    expect(screen.getByText('正在深度思考...')).toBeInTheDocument();
  });

  it('裸 URL 后接中文说明时不把说明吞进链接', () => {
    const { container } = render(
      <ReasoningContent
        content="读取 https://example.com/a?froms=ggmp，原因是需要核验。"
        isStreaming={false}
        isVisible={true}
        onToggle={vi.fn()}
      />,
    );

    const link = screen.getByRole('link', { name: 'https://example.com/a?froms=ggmp' });
    expect(link.getAttribute('href')).toBe('https://example.com/a?froms=ggmp');
    expect(container.textContent).toContain('，原因是需要核验。');
  });

  it('流式 reasoning 的 fenced code 增量更新时不重挂代码块', () => {
    const { rerender } = render(
      <ReasoningContent
        content={'```ts\nconst a = 1;\nconst b = 2;\n```'}
        isStreaming={true}
        isVisible={true}
        onToggle={vi.fn()}
      />,
    );
    const firstCodeBlock = screen.getByTestId('reasoning-code-block');

    rerender(
      <ReasoningContent
        content={'```ts\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```'}
        isStreaming={true}
        isVisible={true}
        onToggle={vi.fn()}
      />,
    );

    expect(firstCodeBlock).toBeTruthy();
    expect(screen.getByTestId('reasoning-code-block')).toBe(firstCodeBlock);
    expect(screen.getByTestId('reasoning-code-block').textContent).toContain('const c = 3;');
  });

  it('将工具协议标记显示为普通文本，不创建未知 DOM 标签', () => {
    const { container } = render(
      <ReasoningContent
        content={'准备 <strong>核对</strong> 工具调用：\n<function name="web_search">\n<parameter name="query">深圳天气</parameter>\n</function>'}
        isStreaming={false}
        isVisible={true}
        onToggle={vi.fn()}
      />,
    );

    expect(container.querySelector('function')).toBeNull();
    expect(container.querySelector('parameter')).toBeNull();
    expect(container.textContent).toContain('<function name="web_search">');
    expect(container.textContent).toContain('<parameter name="query">深圳天气</parameter>');
    expect(screen.getByText('核对').tagName).toBe('STRONG');
  });

  it('不改写 fenced code 中的工具协议示例', () => {
    render(
      <ReasoningContent
        content={'```xml\n<function>\n<parameter name="query">深圳天气</parameter>\n</function>\n```'}
        isStreaming={false}
        isVisible={true}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTestId('reasoning-code-block').textContent).toBe(
      '<function>\n<parameter name="query">深圳天气</parameter>\n</function>',
    );
  });
});
