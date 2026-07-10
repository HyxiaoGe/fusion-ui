import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LazyWrapper } from './LazyComponents';

function SuspendedChild(): React.ReactNode {
  throw new Promise(() => {});
}

describe('LazyWrapper', () => {
  it('uses a blank chat placeholder instead of a generic spinner fallback', () => {
    render(
      <LazyWrapper>
        <SuspendedChild />
      </LazyWrapper>
    );

    expect(screen.getByTestId('chat-loading-surface')).toBeTruthy();
    expect(screen.queryByTestId('chat-loading-user-bubble')).toBeNull();
    expect(screen.queryByText('加载中...')).toBeNull();
  });

  it('允许消息场景提供真实内容作为 suspense fallback', () => {
    render(
      <LazyWrapper fallback={<div aria-label="用户消息内容">即时消息</div>}>
        <SuspendedChild />
      </LazyWrapper>
    );

    expect(screen.getByLabelText('用户消息内容')).toHaveTextContent('即时消息');
    expect(screen.queryByTestId('chat-loading-surface')).toBeNull();
  });
});
