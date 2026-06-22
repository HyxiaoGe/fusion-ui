import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReasoningContent from './ReasoningContent';

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
});
