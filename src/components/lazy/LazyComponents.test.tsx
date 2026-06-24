import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LazyWrapper } from './LazyComponents';

function SuspendedChild(): React.ReactNode {
  throw new Promise(() => {});
}

describe('LazyWrapper', () => {
  it('uses the unified chat skeleton instead of a generic spinner fallback', () => {
    render(
      <LazyWrapper>
        <SuspendedChild />
      </LazyWrapper>
    );

    expect(screen.getByTestId('chat-loading-surface')).toBeTruthy();
    expect(screen.queryByText('加载中...')).toBeNull();
  });
});
