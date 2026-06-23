import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  routerPushMock,
  useAppSelectorMock,
  usePathnameMock,
  homeChatSurfaceMock,
} = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  useAppSelectorMock: vi.fn(),
  usePathnameMock: vi.fn(),
  homeChatSurfaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/components/layouts/MainLayout', () => ({
  default: ({ children, sidebar }: { children: React.ReactNode; sidebar?: React.ReactNode }) => (
    <div>
      <aside>{sidebar}</aside>
      <main>{children}</main>
    </div>
  ),
}));

vi.mock('@/components/lazy/LazyComponents', () => ({
  ChatSidebarLazy: ({ onNewChat }: { onNewChat: () => void }) => (
    <button type="button" onClick={onNewChat}>
      新对话
    </button>
  ),
}));

vi.mock('@/components/home/HomeChatSurface', () => ({
  default: (props: any) => {
    homeChatSurfaceMock(props);
    return <div data-testid="new-chat-surface">有什么我能帮你的吗？</div>;
  },
}));

import AppLayout from './layout';

describe('AppLayout 新建对话过渡', () => {
  beforeEach(() => {
    routerPushMock.mockClear();
    homeChatSurfaceMock.mockClear();
    usePathnameMock.mockReturnValue('/chat/test');
    useAppSelectorMock.mockImplementation((selector) =>
      selector({
        models: {
          models: [{ id: 'model-1', enabled: true }],
        },
      })
    );
  });

  it('点击新建对话后立即显示新对话 surface，不继续停留旧会话 children', () => {
    render(
      <AppLayout>
        <div>旧会话内容</div>
      </AppLayout>
    );

    expect(screen.getByText('旧会话内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新对话' }));

    expect(routerPushMock).toHaveBeenCalledWith('/?new=true&model=model-1');
    expect(screen.getByTestId('new-chat-surface')).toBeInTheDocument();
    expect(screen.queryByText('旧会话内容')).toBeNull();
  });

  it('新建过渡期间如果路由进入新会话，会恢复渲染当前路由 children', () => {
    const { rerender } = render(
      <AppLayout>
        <div>旧会话内容</div>
      </AppLayout>
    );

    fireEvent.click(screen.getByRole('button', { name: '新对话' }));
    expect(screen.getByTestId('new-chat-surface')).toBeInTheDocument();

    usePathnameMock.mockReturnValue('/chat/draft-conv');
    rerender(
      <AppLayout>
        <div>新会话内容</div>
      </AppLayout>
    );

    expect(screen.getByText('新会话内容')).toBeInTheDocument();
    expect(screen.queryByTestId('new-chat-surface')).toBeNull();
  });
});
