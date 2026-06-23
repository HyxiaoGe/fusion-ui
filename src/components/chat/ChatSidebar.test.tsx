import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationListItem } from '@/hooks/useConversationList';

const {
  mockUseConversationList,
  mockUseSidebarActions,
  mockUsePathname,
  mockDispatch,
} = vi.hoisted(() => ({
  mockUseConversationList: vi.fn(),
  mockUseSidebarActions: vi.fn(),
  mockUsePathname: vi.fn(),
  mockDispatch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}));

vi.mock('@/hooks/useConversationList', () => ({
  useConversationList: mockUseConversationList,
}));

vi.mock('@/hooks/useSidebarActions', () => ({
  useSidebarActions: mockUseSidebarActions,
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: (state: any) => unknown) =>
    selector({
      models: { models: [{ id: 'model-a', name: '测试模型' }] },
      theme: { mode: 'system' },
    }),
}));

vi.mock('@/lib/hooks/useResolvedTheme', () => ({
  useResolvedTheme: () => 'light',
}));

vi.mock('@/components/layouts/UserAvatarMenu', () => ({
  UserAvatarMenu: () => <div data-testid="user-avatar-menu" />,
}));

vi.mock('./sidebar/DeleteChatDialog', () => ({
  default: () => <div data-testid="delete-chat-dialog" />,
}));

vi.mock('./sidebar/RenameChatDialog', () => ({
  default: () => <div data-testid="rename-chat-dialog" />,
}));

vi.mock('./sidebar/ChatSidebarHeader', () => ({
  default: ({ onNewChat }: { onNewChat: () => void }) => (
    <button type="button" onClick={onNewChat}>
      新对话
    </button>
  ),
}));

vi.mock('./sidebar/ChatList', () => ({
  default: ({
    chats,
    activeChatId,
    containerRef,
    sentinelRef,
  }: {
    chats: ConversationListItem[];
    activeChatId: string | null;
    containerRef: React.RefObject<HTMLDivElement | null>;
    sentinelRef?: React.RefObject<HTMLDivElement | null>;
  }) => (
    <div ref={containerRef} data-testid="chat-sidebar-scroll-container">
      {chats.map((chat) => (
        <div
          key={chat.id}
          data-active={chat.id === activeChatId ? 'true' : 'false'}
          data-conversation-id={chat.id}
        >
          {chat.title}
        </div>
      ))}
      <div ref={sentinelRef} />
    </div>
  ),
}));

import ChatSidebar from './ChatSidebar';

const originalScrollIntoView = Element.prototype.scrollIntoView;

function mockElementRect(element: Element, rect: Pick<DOMRect, 'top' | 'bottom'>) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: rect.top,
    width: 240,
    height: rect.bottom - rect.top,
    top: rect.top,
    right: 240,
    bottom: rect.bottom,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('ChatSidebar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockUsePathname.mockReturnValue('/chat/chat-a');
    mockUseConversationList.mockReturnValue({
      conversations: [
        {
          id: 'chat-a',
          title: '已激活对话',
          model_id: 'model-a',
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_000,
        },
      ],
      isLoadingList: false,
      isLoadingMore: false,
      loadMore: vi.fn(),
      pagination: null,
      searchConversations: vi.fn(),
      searchResults: null,
      isSearching: false,
      searchError: null,
    });
    mockUseSidebarActions.mockReturnValue({
      closeDeleteDialog: vi.fn(),
      closeRenameDialog: vi.fn(),
      confirmDelete: vi.fn(),
      confirmRename: vi.fn(),
      deleteTargetId: null,
      generateTitle: vi.fn(),
      openDeleteDialog: vi.fn(),
      openRenameDialog: vi.fn(),
      renameTargetId: null,
      renameValue: '',
      selectConversation: vi.fn(),
      setRenameValue: vi.fn(),
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalScrollIntoView) {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    } else {
      delete (Element.prototype as Partial<Pick<Element, 'scrollIntoView'>>).scrollIntoView;
    }
  });

  it('active item 已可见时不触发 scrollIntoView', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<ChatSidebar onNewChat={vi.fn()} activeChatIdOverride="chat-a" />);

    const container = screen.getByTestId('chat-sidebar-scroll-container');
    const activeItem = container.querySelector('[data-conversation-id="chat-a"]');
    expect(activeItem).not.toBeNull();

    mockElementRect(container, { top: 0, bottom: 300 });
    mockElementRect(activeItem as Element, { top: 40, bottom: 80 });

    await vi.advanceTimersByTimeAsync(60);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('active item 只有亚像素轻微越界时不触发 scrollIntoView', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<ChatSidebar onNewChat={vi.fn()} activeChatIdOverride="chat-a" />);

    const container = screen.getByTestId('chat-sidebar-scroll-container');
    const activeItem = container.querySelector('[data-conversation-id="chat-a"]');
    expect(activeItem).not.toBeNull();

    mockElementRect(container, { top: 0, bottom: 300 });
    mockElementRect(activeItem as Element, { top: -0.5, bottom: 80 });

    await vi.advanceTimersByTimeAsync(60);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('active item 部分不可见时仍触发 scrollIntoView', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<ChatSidebar onNewChat={vi.fn()} activeChatIdOverride="chat-a" />);

    const container = screen.getByTestId('chat-sidebar-scroll-container');
    const activeItem = container.querySelector('[data-conversation-id="chat-a"]');
    expect(activeItem).not.toBeNull();

    mockElementRect(container, { top: 0, bottom: 300 });
    mockElementRect(activeItem as Element, { top: -2, bottom: 80 });

    await vi.advanceTimersByTimeAsync(60);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
  });
});
