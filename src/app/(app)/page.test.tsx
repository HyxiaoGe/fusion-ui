import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import Home from './page';

describe('Home page 路由规范化', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('/ 重定向到 /chat/new', async () => {
    await Home({
      searchParams: Promise.resolve({}),
    });

    expect(redirectMock).toHaveBeenCalledWith('/chat/new');
  });

  it('/?new=true&model=deepseek-chat 重定向到 /chat/new?model=deepseek-chat', async () => {
    await Home({
      searchParams: Promise.resolve({
        new: 'true',
        model: 'deepseek-chat',
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/chat/new?model=deepseek-chat');
  });
});
