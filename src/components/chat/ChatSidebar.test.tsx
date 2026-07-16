import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationListItem } from '@/hooks/useConversationList';

const {
  mockUseConversationList,
  mockUseSidebarActions,
  mockUsePathname,
  mockDispatch,
  mockChatListProps,
  selectorState,
  themeRuntimeState,
} = vi.hoisted(() => ({
  mockUseConversationList: vi.fn(),
  mockUseSidebarActions: vi.fn(),
  mockUsePathname: vi.fn(),
  mockDispatch: vi.fn(),
  mockChatListProps: vi.fn(),
  selectorState: {
    models: { models: [{ id: 'model-a', name: '测试模型' }] },
    theme: { mode: 'system' },
    stream: { isStreaming: false, conversationId: null as string | null },
  },
  themeRuntimeState: {
    resolvedTheme: 'light' as 'light' | 'dark',
    hasMounted: true,
  },
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
    selector(selectorState),
}));

vi.mock('@/lib/hooks/useResolvedTheme', () => ({
  useResolvedTheme: () => themeRuntimeState.resolvedTheme,
}));

vi.mock('@/hooks/useHasMounted', () => ({
  useHasMounted: () => themeRuntimeState.hasMounted,
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
  default: ({ onNewChat, isNewChatActive }: { onNewChat: () => void; isNewChatActive?: boolean }) => (
    <button type="button" onClick={onNewChat} aria-pressed={isNewChatActive}>
      新对话
    </button>
  ),
}));

vi.mock('./sidebar/ChatList', () => ({
  default: ({
    chats,
    sortedAndGroupedChats,
    activeChatId,
    containerRef,
    sentinelRef,
    searchQuery,
    streamingConversationId,
  }: {
    chats: ConversationListItem[];
    sortedAndGroupedChats: { groupLabel: string; groupChats: ConversationListItem[] }[];
    activeChatId: string | null;
    containerRef: React.RefObject<HTMLDivElement | null>;
    sentinelRef?: React.RefObject<HTMLDivElement | null>;
    searchQuery?: string;
    streamingConversationId?: string | null;
  }) => {
    mockChatListProps({
      chats,
      sortedAndGroupedChats,
      searchQuery,
      streamingConversationId,
    });

    return (
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
    );
  },
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
    mockChatListProps.mockClear();
    selectorState.stream.isStreaming = false;
    selectorState.stream.conversationId = null;
    themeRuntimeState.resolvedTheme = 'light';
    themeRuntimeState.hasMounted = true;
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

  it('搜索模式下保持传给 ChatList 的空分组引用稳定', () => {
    const searchResults: ConversationListItem[] = [
      {
        id: 'chat-search',
        title: '搜索结果',
        model_id: 'model-a',
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ];

    mockUseConversationList.mockReturnValue({
      conversations: [
        {
          id: 'chat-a',
          title: '普通对话 A',
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
      searchResults,
      isSearching: false,
      searchError: null,
    });

    const { rerender } = render(<ChatSidebar onNewChat={vi.fn()} activeChatIdOverride="chat-a" />);
    const input = screen.getByPlaceholderText('搜索对话...');
    fireEvent.change(input, { target: { value: '搜索' } });

    const firstProps = mockChatListProps.mock.calls.at(-1)?.[0];

    mockUseConversationList.mockReturnValue({
      conversations: [
        {
          id: 'chat-b',
          title: '普通对话 B',
          model_id: 'model-a',
          createdAt: 1_700_000_000_001,
          updatedAt: 1_700_000_000_001,
        },
      ],
      isLoadingList: false,
      isLoadingMore: false,
      loadMore: vi.fn(),
      pagination: null,
      searchConversations: vi.fn(),
      searchResults,
      isSearching: false,
      searchError: null,
    });

    rerender(<ChatSidebar onNewChat={vi.fn()} activeChatIdOverride="chat-a" />);

    const secondProps = mockChatListProps.mock.calls.at(-1)?.[0];
    expect(secondProps.sortedAndGroupedChats).toBe(firstProps.sortedAndGroupedChats);
  });

  it('pathname 是 /chat/new 时不会把 id 为 new 的会话标记为 active', () => {
    mockUsePathname.mockReturnValue('/chat/new');
    mockUseConversationList.mockReturnValue({
      conversations: [
        {
          id: 'new',
          title: '真实 ID 为 new 的会话',
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

    render(<ChatSidebar onNewChat={vi.fn()} />);

    expect(screen.getByText('真实 ID 为 new 的会话')).toHaveAttribute('data-active', 'false');
  });

  it('只在流式状态有效时把会话 ID 传给列表', () => {
    selectorState.stream.isStreaming = true;
    selectorState.stream.conversationId = 'chat-a';

    const { rerender } = render(<ChatSidebar onNewChat={vi.fn()} />);

    expect(mockChatListProps.mock.calls.at(-1)?.[0].streamingConversationId).toBe('chat-a');

    selectorState.stream.isStreaming = false;
    rerender(<ChatSidebar onNewChat={vi.fn()} />);

    expect(mockChatListProps.mock.calls.at(-1)?.[0].streamingConversationId).toBeNull();
  });

  it('hydration 完成前使用稳定的浅色主题按钮，挂载后再同步真实主题', () => {
    themeRuntimeState.resolvedTheme = 'dark';
    themeRuntimeState.hasMounted = false;

    const { rerender } = render(<ChatSidebar onNewChat={vi.fn()} />);

    expect(screen.getByRole('button', { name: '切换到暗色模式' })).toBeTruthy();

    themeRuntimeState.hasMounted = true;
    rerender(<ChatSidebar onNewChat={vi.fn()} />);

    expect(screen.getByRole('button', { name: '切换到亮色模式' })).toBeTruthy();
  });
});
