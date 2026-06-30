import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MessageActions from './MessageActions';

describe('MessageActions', () => {
  it('渲染 assistant 的复制和重新生成操作', () => {
    const onCopy = vi.fn();
    const onRetry = vi.fn();
    const timestamp = new Date('2026-01-01T13:14:15').getTime();
    const expectedTime = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const { rerender } = render(
      <MessageActions
        timestamp={timestamp}
        copied={false}
        onCopy={onCopy}
        onRetry={onRetry}
        retryLabel="重新生成"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    fireEvent.click(screen.getByRole('button', { name: '重新生成' }));

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(expectedTime)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();

    rerender(
      <MessageActions
        timestamp={timestamp}
        copied
        onCopy={onCopy}
        onRetry={onRetry}
        retryLabel="重新生成"
      />,
    );

    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument();
  });

  it('渲染 user 的编辑和重新发送操作', () => {
    const onEdit = vi.fn();
    const onRetry = vi.fn();

    render(
      <MessageActions
        timestamp={1}
        onEdit={onEdit}
        onRetry={onRetry}
        retryLabel="重新发送"
      />,
    );

    expect(screen.queryByRole('button', { name: '复制' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '编辑' }));
    fireEvent.click(screen.getByRole('button', { name: '重新发送' }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('无效 timestamp 不显示时间', () => {
    render(
      <MessageActions
        timestamp={Number.NaN}
        onRetry={vi.fn()}
        retryLabel="重新生成"
      />,
    );

    expect(screen.queryByText(/^\d{2}:\d{2}:\d{2}$/)).toBeNull();
  });
});
