import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const initializeStoreFromDBMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/initializeStore', () => ({
  default: initializeStoreFromDBMock,
}));

import { Providers } from './providers';

describe('Providers', () => {
  it('uses the unified app shell skeleton while restoring local state', async () => {
    let resolveInitialize: () => void = () => {};
    initializeStoreFromDBMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveInitialize = resolve;
      })
    );

    render(
      <Providers>
        <div>应用内容</div>
      </Providers>
    );

    expect(screen.getByTestId('chat-loading-app-shell')).toBeTruthy();
    expect(screen.queryByText('初始化中...')).toBeNull();

    resolveInitialize();
    await waitFor(() => expect(screen.getByText('应用内容')).toBeTruthy());
  });
});
