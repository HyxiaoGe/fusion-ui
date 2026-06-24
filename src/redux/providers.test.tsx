import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const initializeStoreFromDBMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/initializeStore', () => ({
  default: initializeStoreFromDBMock,
}));

import { Providers } from './providers';

describe('Providers', () => {
  it('renders children immediately while restoring local state in the background', async () => {
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

    expect(screen.getByText('应用内容')).toBeTruthy();
    expect(screen.queryByTestId('chat-loading-app-shell')).toBeNull();
    expect(screen.queryByText('初始化中...')).toBeNull();
    expect(initializeStoreFromDBMock).toHaveBeenCalledTimes(1);
    expect(initializeStoreFromDBMock).toHaveBeenCalledWith(expect.any(Function), { includeChats: false });

    resolveInitialize();
    await waitFor(() => expect(screen.getByText('应用内容')).toBeTruthy());
  });
});
