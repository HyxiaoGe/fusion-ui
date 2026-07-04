import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  routerPushMock,
  requestNewChatDraftResetMock,
  useAppSelectorMock,
  usePathnameMock,
  homeChatSurfaceMock,
  chatSidebarMock,
} = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  requestNewChatDraftResetMock: vi.fn(),
  useAppSelectorMock: vi.fn(),
  usePathnameMock: vi.fn(),
  homeChatSurfaceMock: vi.fn(),
  chatSidebarMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: useAppSelectorMock,
}));

vi.mock('@/lib/chat/newChatDraftReset', () => ({
  requestNewChatDraftReset: requestNewChatDraftResetMock,
}));

vi.mock('@/components/layouts/MainLayout', () => ({
  default: ({ children, sidebar }: { children: React.ReactNode; sidebar?: React.ReactNode }) => (
    <div>
      <aside>{sidebar}</aside>
      <main>{children}</main>
    </div>
  ),
}));

vi.mock('@/components/chat/ChatSidebar', () => ({
  default: ({ onNewChat, isNewChatActive }: { onNewChat: () => void; isNewChatActive?: boolean }) => {
    chatSidebarMock({ isNewChatActive });
    return (
      <button type="button" onClick={onNewChat} aria-pressed={isNewChatActive}>
        新对话
      </button>
    );
  },
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
    requestNewChatDraftResetMock.mockClear();
    homeChatSurfaceMock.mockClear();
    chatSidebarMock.mockClear();
    usePathnameMock.mockReturnValue('/chat/test');
    useAppSelectorMock.mockImplementation((selector) =>
      selector({
        models: {
          models: [{ id: 'model-1', enabled: true }],
        },
      })
    );
  });

  it('点击新建对话时导航到 /chat/new 并保留当前 children 等待路由切换', () => {
    render(
      <AppLayout>
        <div>旧会话内容</div>
      </AppLayout>
    );

    expect(screen.getByText('旧会话内容')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新对话' }));

    expect(routerPushMock).toHaveBeenCalledWith('/chat/new?model=model-1');
    expect(homeChatSurfaceMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('new-chat-surface')).toBeNull();
    expect(screen.getByText('旧会话内容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新对话' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('pathname 是 /chat/new 时 Sidebar 新建按钮 active', () => {
    usePathnameMock.mockReturnValue('/chat/new');

    render(
      <AppLayout>
        <div>新建路由内容</div>
      </AppLayout>
    );

    expect(chatSidebarMock).toHaveBeenLastCalledWith({ isNewChatActive: true });
    expect(screen.getByRole('button', { name: '新对话' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('新建路由内容')).toBeInTheDocument();
  });

  it('pathname 已经是 /chat/new 时点击新建对话会广播草稿重置', () => {
    usePathnameMock.mockReturnValue('/chat/new');

    render(
      <AppLayout>
        <div>新建路由内容</div>
      </AppLayout>
    );

    fireEvent.click(screen.getByRole('button', { name: '新对话' }));

    expect(requestNewChatDraftResetMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith('/chat/new?model=model-1');
  });
});
