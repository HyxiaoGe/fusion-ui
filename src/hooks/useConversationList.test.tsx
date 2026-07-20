import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import authReducer, { logout } from '@/redux/slices/authSlice';
import conversationReducer, {
  materializeConversation,
  removeConversation,
  requestConversationListRefresh,
  resetConversationState,
  setConversationList,
  setSearchResults,
  updateConversationModel,
  updateConversationTitle,
  updateConversationsMetadata,
  updateMessage,
  upsertConversation,
} from '@/redux/slices/conversationSlice';
import streamReducer, { appendTextDelta, startStream } from '@/redux/slices/streamSlice';
import conversationDetailInvalidationMiddleware from '@/redux/middleware/conversationDetailInvalidationMiddleware';
import {
  getConversations,
  getConversationsMetadata,
  searchConversations,
} from '@/lib/api/chat';
import {
  selectConversationListView,
  useConversationList,
} from './useConversationList';

const METADATA_RETRY_BASE_MS = 250;

vi.mock('@/lib/api/chat', () => ({
  getConversations: vi.fn(),
  getConversationsMetadata: vi.fn(),
  searchConversations: vi.fn(),
}));

function createUser(id: string) {
  return {
    id,
    username: id,
    email: null,
    nickname: null,
    avatar: null,
    mobile: null,
    system_prompt: '',
    is_superuser: false,
  };
}

function createStore(isAuthenticated = false, userId = 'user-a') {
  return configureStore({
    reducer: {
      auth: authReducer,
      conversation: conversationReducer,
      stream: streamReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(
      conversationDetailInvalidationMiddleware
    ),
    preloadedState: {
      auth: {
        isAuthenticated,
        user: isAuthenticated ? createUser(userId) : null,
        token: isAuthenticated ? `token-${userId}` : null,
        status: 'idle' as const,
        error: null,
        sessionResolved: true,
        accountSwitchStatus: 'stable' as const,
        accountSwitchError: null,
        switchedAccountEmail: null,
      },
    },
  });
}

function createWrapper(store: ReturnType<typeof createStore>) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store }, children);
  }

  return Wrapper;
}

function createConversation(id: string) {
  return {
    id,
    title: `对话 ${id}`,
    model_id: 'model-1',
    messages: [
      {
        id: `msg-${id}`,
        role: 'assistant' as const,
        content: [{ type: 'text' as const, id: `blk-${id}`, text: '旧正文' }],
        timestamp: 2,
      },
    ],
    createdAt: 1,
    updatedAt: 1,
  };
}

function createServerConversation(
  id: string,
  overrides: Partial<{ title: string; model_id: string; updated_at: string }> = {},
) {
  return {
    id,
    title: overrides.title ?? `服务端 ${id}`,
    model_id: overrides.model_id ?? 'model-server',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-07-02T00:00:00Z',
  };
}

function seedConversationList(
  store: ReturnType<typeof createStore>,
  ids = ['conv-1'],
) {
  store.dispatch(
    setConversationList({
      conversations: ids.map(createConversation),
      pagination: {
        currentPage: 1,
        pageSize: 20,
        totalPages: 1,
        totalCount: 1,
        hasNext: false,
        hasPrev: false,
      },
    }),
  );
}

describe('useConversationList', () => {
  const getConversationsMock = vi.mocked(getConversations);
  const getConversationsMetadataMock = vi.mocked(getConversationsMetadata);
  const searchConversationsMock = vi.mocked(searchConversations);

  beforeEach(() => {
    getConversationsMock.mockReset();
    getConversationsMetadataMock.mockReset();
    searchConversationsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('消息内容变化不触发会话列表消费者重新渲染，元数据变化才触发', () => {
    const store = createStore();
    seedConversationList(store);
    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount += 1;
      return useConversationList();
    }, {
      wrapper: createWrapper(store),
    });

    expect(result.current.conversations).toHaveLength(1);
    expect(renderCount).toBe(1);

    act(() => {
      store.dispatch(
        updateMessage({
          conversationId: 'conv-1',
          messageId: 'msg-1',
          patch: {
            content: [{ type: 'text', id: 'blk_1', text: '消息正文变化' }],
          },
        }),
      );
    });

    expect(renderCount).toBe(1);

    act(() => {
      store.dispatch(
        updateConversationsMetadata([
          { id: 'conv-1', title: '新标题', model_id: 'model-1', updatedAt: 3 },
        ]),
      );
    });

    expect(renderCount).toBe(2);
    expect(result.current.conversations[0]?.title).toBe('新标题');
  });

  it('stream-only action 复用 selector view 和列表项引用', () => {
    const store = createStore();
    seedConversationList(store);

    selectConversationListView.resetRecomputations();
    const before = selectConversationListView(store.getState() as never);
    const recomputationsBeforeStream = selectConversationListView.recomputations();

    store.dispatch(startStream({ conversationId: 'conv-1', messageId: 'assistant-1' }));
    store.dispatch(appendTextDelta({ blockId: 'answer', delta: 'stream delta' }));

    const after = selectConversationListView(store.getState() as never);
    expect(selectConversationListView.recomputations()).toBe(recomputationsBeforeStream);
    expect(after).toBe(before);
    expect(after.conversations).toBe(before.conversations);
    expect(after.conversations[0]).toBe(before.conversations[0]);
  });

  it('首屏和后续分页统一请求 20 条', async () => {
    getConversationsMock
      .mockResolvedValueOnce({
        items: [createConversation('conv-1')],
        page: 1,
        page_size: 20,
        total_pages: 2,
        total: 21,
        has_next: true,
        has_prev: false,
      } as never)
      .mockResolvedValueOnce({
        items: [createConversation('conv-21')],
        page: 2,
        page_size: 20,
        total_pages: 2,
        total: 21,
        has_next: false,
        has_prev: true,
      } as never);
    const store = createStore(true);
    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(getConversationsMock).toHaveBeenNthCalledWith(1, 1, 20);
      expect(result.current.pagination?.pageSize).toBe(20);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(getConversationsMock).toHaveBeenNthCalledWith(2, 2, 20);
  });

  it('dirty conversation 只请求对应的单个 metadata', async () => {
    const store = createStore(true);
    seedConversationList(store);
    getConversationsMock.mockResolvedValue({
      items: [createConversation('conv-1')],
      page: 1,
      page_size: 20,
      total_pages: 1,
      total: 1,
      has_next: false,
      has_prev: false,
    } as never);
    getConversationsMetadataMock.mockResolvedValue([
      { id: 'conv-1', title: '新标题', model_id: 'model-1', updated_at: '2026-07-10T00:00:00Z' },
    ] as never);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    act(() => {
      store.dispatch(requestConversationListRefresh('conv-1'));
    });

    await waitFor(() => {
      expect(getConversationsMetadataMock).toHaveBeenCalledTimes(1);
      expect(getConversationsMetadataMock).toHaveBeenCalledWith(['conv-1']);
      expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
    });
  });

  it('metadata 请求期间合并新 dirty id，并对重复 id 去重', async () => {
    const store = createStore(true);
    seedConversationList(store, ['conv-1', 'conv-2', 'conv-3']);
    getConversationsMock.mockResolvedValue({
      items: ['conv-1', 'conv-2', 'conv-3'].map(createConversation),
      page: 1,
      page_size: 20,
      total_pages: 1,
      total: 3,
      has_next: false,
      has_prev: false,
    } as never);

    let resolveFirstRequest: ((items: unknown[]) => void) | undefined;
    getConversationsMetadataMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstRequest = resolve;
      }) as never)
      .mockResolvedValueOnce([
        { id: 'conv-2', title: '标题 2', model_id: 'model-1', updated_at: '2026-07-10T00:00:02Z' },
        { id: 'conv-3', title: '标题 3', model_id: 'model-1', updated_at: '2026-07-10T00:00:03Z' },
      ] as never);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    act(() => {
      store.dispatch(requestConversationListRefresh('conv-1'));
      store.dispatch(requestConversationListRefresh('conv-1'));
    });
    await waitFor(() => {
      expect(getConversationsMetadataMock).toHaveBeenNthCalledWith(1, ['conv-1']);
    });

    act(() => {
      store.dispatch(requestConversationListRefresh('conv-2'));
      store.dispatch(requestConversationListRefresh('conv-2'));
      store.dispatch(requestConversationListRefresh('conv-3'));
    });
    await act(async () => {
      resolveFirstRequest?.([
        { id: 'conv-1', title: '标题 1', model_id: 'model-1', updated_at: '2026-07-10T00:00:01Z' },
      ]);
    });

    await waitFor(() => {
      expect(getConversationsMetadataMock).toHaveBeenCalledTimes(2);
      expect(getConversationsMetadataMock).toHaveBeenNthCalledWith(2, ['conv-2', 'conv-3']);
      expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
    });
  });

  it('同一 conversation 在请求期间再次 dirty 时，首批完成后继续发起第二批请求', async () => {
    const store = createStore(true);
    seedConversationList(store);
    getConversationsMock.mockResolvedValue({
      items: [createConversation('conv-1')],
      page: 1,
      page_size: 20,
      total_pages: 1,
      total: 1,
      has_next: false,
      has_prev: false,
    } as never);

    let resolveFirstRequest: ((items: unknown[]) => void) | undefined;
    getConversationsMetadataMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstRequest = resolve;
      }) as never)
      .mockResolvedValueOnce([
        { id: 'conv-1', title: '第二批标题', model_id: 'model-1', updated_at: '2026-07-10T00:00:02Z' },
      ] as never);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    act(() => {
      store.dispatch(requestConversationListRefresh('conv-1'));
    });
    await waitFor(() => {
      expect(getConversationsMetadataMock).toHaveBeenNthCalledWith(1, ['conv-1']);
    });

    act(() => {
      store.dispatch(requestConversationListRefresh('conv-1'));
    });
    await act(async () => {
      resolveFirstRequest?.([
        { id: 'conv-1', title: '第一批标题', model_id: 'model-1', updated_at: '2026-07-10T00:00:01Z' },
      ]);
    });

    await waitFor(() => {
      expect(getConversationsMetadataMock).toHaveBeenCalledTimes(2);
      expect(getConversationsMetadataMock).toHaveBeenNthCalledWith(2, ['conv-1']);
      expect(store.getState().conversation.byId['conv-1']?.title).toBe('第二批标题');
      expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
    });
  });

  it('page1 请求期间切换账号时，旧账号响应不得覆盖新账号列表', async () => {
    let resolveUserA: ((value: unknown) => void) | undefined;
    getConversationsMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveUserA = resolve;
      }) as never)
      .mockResolvedValueOnce({
        items: [createServerConversation('user-b-conv')],
        page: 1,
        page_size: 20,
        total_pages: 1,
        total: 1,
        has_next: false,
        has_prev: false,
      } as never);
    const store = createStore(true, 'user-a');
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    await waitFor(() => expect(getConversationsMock).toHaveBeenCalledTimes(1));
    act(() => {
      store.dispatch({
        type: 'auth/fetchUserProfile/fulfilled',
        payload: createUser('user-b'),
      });
    });
    await waitFor(() => {
      expect(getConversationsMock).toHaveBeenCalledTimes(2);
      expect(store.getState().conversation.listIds).toEqual(['user-b-conv']);
    });

    await act(async () => {
      resolveUserA?.({
        items: [createServerConversation('user-a-conv')],
        page: 1,
        page_size: 20,
        total_pages: 1,
        total: 1,
        has_next: false,
        has_prev: false,
      });
    });

    expect(store.getState().conversation.listIds).toEqual(['user-b-conv']);
    expect(store.getState().conversation.byId['user-a-conv']).toBeUndefined();
  });

  it('page1 请求期间 logout 后，迟到响应不得回写列表', async () => {
    let resolveRequest: ((value: unknown) => void) | undefined;
    getConversationsMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }) as never);
    const store = createStore(true);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    await waitFor(() => expect(getConversationsMock).toHaveBeenCalledTimes(1));
    act(() => {
      store.dispatch(logout());
    });
    await act(async () => {
      resolveRequest?.({
        items: [createServerConversation('late-conv')],
        page: 1,
        page_size: 20,
        total_pages: 1,
        total: 1,
        has_next: false,
        has_prev: false,
      });
    });

    expect(store.getState().conversation.listIds).toEqual([]);
    expect(store.getState().conversation.byId['late-conv']).toBeUndefined();
  });

  it('已加载 A 账号数据后 logout 会立即清空列表与搜索态', async () => {
    getConversationsMock.mockResolvedValue({
      items: [createServerConversation('user-a-conv')],
      page: 1,
      page_size: 20,
      total_pages: 1,
      total: 1,
      has_next: false,
      has_prev: false,
    } as never);
    const store = createStore(true, 'user-a');
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });
    await waitFor(() => {
      expect(store.getState().conversation.listIds).toEqual(['user-a-conv']);
    });
    act(() => {
      store.dispatch(setSearchResults([createConversation('user-a-search')]));
      store.dispatch(logout());
    });

    expect(store.getState().conversation.byId).toEqual({});
    expect(store.getState().conversation.listIds).toEqual([]);
    expect(store.getState().conversation.pagination).toBeNull();
    expect(store.getState().conversation.searchResults).toBeNull();
  });

  it('A 切到 B 时立即清空 A 数据，即使 B 的 page1 失败也不恢复', async () => {
    getConversationsMock
      .mockResolvedValueOnce({
        items: [createServerConversation('user-a-conv')],
        page: 1,
        page_size: 20,
        total_pages: 1,
        total: 1,
        has_next: false,
        has_prev: false,
      } as never)
      .mockRejectedValueOnce(new Error('B page1 失败'));
    const store = createStore(true, 'user-a');
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });
    await waitFor(() => {
      expect(store.getState().conversation.listIds).toEqual(['user-a-conv']);
    });
    act(() => {
      store.dispatch(setSearchResults([createConversation('user-a-search')]));
      store.dispatch({
        type: 'auth/fetchUserProfile/fulfilled',
        payload: createUser('user-b'),
      });
    });

    expect(store.getState().conversation.byId).toEqual({});
    expect(store.getState().conversation.listIds).toEqual([]);
    expect(store.getState().conversation.pagination).toBeNull();
    expect(store.getState().conversation.searchResults).toBeNull();
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalledTimes(2));
    expect(store.getState().conversation.listIds).toEqual([]);
  });

  it('pending search 后切换账号会 abort，迟到结果不得回写', async () => {
    getConversationsMock
      .mockResolvedValueOnce({
        items: [createServerConversation('user-a-conv')],
        page: 1,
        page_size: 20,
        total_pages: 1,
        total: 1,
        has_next: false,
        has_prev: false,
      } as never)
      .mockRejectedValueOnce(new Error('B page1 失败'));
    let resolveSearch: ((items: unknown[]) => void) | undefined;
    searchConversationsMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSearch = resolve;
    }) as never);
    const store = createStore(true, 'user-a');
    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(store.getState().conversation.listIds).toEqual(['user-a-conv']));

    act(() => {
      void result.current.searchConversations('旧账号搜索');
    });
    await waitFor(() => expect(searchConversationsMock).toHaveBeenCalledTimes(1));
    const searchSignal = searchConversationsMock.mock.calls[0]?.[2];
    act(() => {
      store.dispatch({
        type: 'auth/fetchUserProfile/fulfilled',
        payload: createUser('user-b'),
      });
    });
    expect(searchSignal?.aborted).toBe(true);

    await act(async () => {
      resolveSearch?.([createServerConversation('user-a-search-result')]);
    });
    expect(store.getState().conversation.searchResults).toBeNull();
    expect(store.getState().conversation.byId['user-a-search-result']).toBeUndefined();
  });

  it('pending search 后 logout 或 unmount 都会 abort 且不回写', async () => {
    getConversationsMock.mockResolvedValue({
      items: [], page: 1, page_size: 20, total_pages: 1, total: 0, has_next: false, has_prev: false,
    } as never);
    let resolveSearch: ((items: unknown[]) => void) | undefined;
    searchConversationsMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSearch = resolve;
    }) as never);
    const store = createStore(true);
    const { result, unmount } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(store),
    });

    act(() => {
      void result.current.searchConversations('待取消搜索');
    });
    await waitFor(() => expect(searchConversationsMock).toHaveBeenCalledTimes(1));
    const searchSignal = searchConversationsMock.mock.calls[0]?.[2];
    act(() => {
      store.dispatch(logout());
    });
    expect(searchSignal?.aborted).toBe(true);
    unmount();

    await act(async () => {
      resolveSearch?.([createServerConversation('late-search-result')]);
    });
    expect(store.getState().conversation.searchResults).toBeNull();
  });

  it('loadMore 请求期间 reset 后，迟到分页不得恢复旧列表', async () => {
    let resolvePage2: ((value: unknown) => void) | undefined;
    getConversationsMock
      .mockResolvedValueOnce({
        items: [createServerConversation('conv-1')],
        page: 1,
        page_size: 20,
        total_pages: 2,
        total: 21,
        has_next: true,
        has_prev: false,
      } as never)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePage2 = resolve;
      }) as never);
    const store = createStore(true);
    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(result.current.pagination?.hasNext).toBe(true));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalledTimes(2));
    act(() => {
      store.dispatch(resetConversationState());
    });
    await act(async () => {
      resolvePage2?.({
        items: [createServerConversation('conv-21')],
        page: 2,
        page_size: 20,
        total_pages: 2,
        total: 21,
        has_next: false,
        has_prev: true,
      });
    });

    expect(store.getState().conversation.listIds).toEqual([]);
    expect(store.getState().conversation.pagination).toBeNull();
  });

  it('page1 迟到列表不覆盖请求期间的本地标题、模型和 updatedAt', async () => {
    let resolvePage1: ((value: unknown) => void) | undefined;
    getConversationsMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePage1 = resolve;
    }) as never);
    const store = createStore(true);
    seedConversationList(store);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalledTimes(1));

    vi.spyOn(Date, 'now').mockReturnValue(999);
    act(() => {
      store.dispatch(updateConversationTitle({ id: 'conv-1', title: '本地标题' }));
      store.dispatch(updateConversationModel({ id: 'conv-1', model_id: 'model-local' }));
    });
    await act(async () => {
      resolvePage1?.({
        items: [createServerConversation('conv-1', {
          title: '迟到服务端标题',
          model_id: 'model-stale',
          updated_at: '2026-07-03T00:00:00Z',
        })],
        page: 1,
        page_size: 20,
        total_pages: 1,
        total: 1,
        has_next: false,
        has_prev: false,
      });
    });

    expect(store.getState().conversation.byId['conv-1']).toEqual(
      expect.objectContaining({
        title: '本地标题',
        model_id: 'model-local',
        updatedAt: 999,
      })
    );
  });

  it('page1 响应保留请求期间本地新物化的会话，并维持其余服务器顺序', async () => {
    let resolvePage1: ((value: unknown) => void) | undefined;
    getConversationsMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePage1 = resolve;
    }) as never);
    const store = createStore(true);
    seedConversationList(store, ['conv-a', 'conv-b']);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalledTimes(1));

    act(() => {
      store.dispatch(upsertConversation(createConversation('temp-new')));
      store.dispatch(materializeConversation({
        pendingId: 'temp-new',
        serverConversation: createConversation('conv-new'),
      }));
    });
    await act(async () => {
      resolvePage1?.({
        items: [
          createServerConversation('conv-b'),
          createServerConversation('conv-a'),
          createServerConversation('conv-c'),
        ],
        page: 1,
        page_size: 20,
        total_pages: 1,
        total: 3,
        has_next: false,
        has_prev: false,
      });
    });

    expect(store.getState().conversation.listIds).toEqual([
      'conv-new',
      'conv-b',
      'conv-a',
      'conv-c',
    ]);
  });

  it('page1 响应不会重新加入请求期间已在本地删除的会话', async () => {
    let resolvePage1: ((value: unknown) => void) | undefined;
    getConversationsMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePage1 = resolve;
    }) as never);
    const store = createStore(true);
    seedConversationList(store, ['conv-a', 'conv-b']);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalledTimes(1));

    act(() => {
      store.dispatch(removeConversation('conv-a'));
    });
    await act(async () => {
      resolvePage1?.({
        items: [
          createServerConversation('conv-a'),
          createServerConversation('conv-b'),
        ],
        page: 1,
        page_size: 20,
        total_pages: 1,
        total: 2,
        has_next: false,
        has_prev: false,
      });
    });

    expect(store.getState().conversation.listIds).toEqual(['conv-b']);
    expect(store.getState().conversation.byId['conv-a']).toBeUndefined();
  });

  it('metadata 迟到响应不覆盖请求期间的本地标题、模型和 updatedAt', async () => {
    let resolveMetadata: ((value: unknown[]) => void) | undefined;
    getConversationsMock.mockResolvedValue({
      items: [createServerConversation('conv-1')],
      page: 1,
      page_size: 20,
      total_pages: 1,
      total: 1,
      has_next: false,
      has_prev: false,
    } as never);
    getConversationsMetadataMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveMetadata = resolve;
    }) as never);
    const store = createStore(true);
    seedConversationList(store);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    act(() => {
      store.dispatch(requestConversationListRefresh('conv-1'));
    });
    await waitFor(() => expect(getConversationsMetadataMock).toHaveBeenCalledTimes(1));

    vi.spyOn(Date, 'now').mockReturnValue(999);
    act(() => {
      store.dispatch(updateConversationTitle({ id: 'conv-1', title: '本地标题' }));
      store.dispatch(updateConversationModel({ id: 'conv-1', model_id: 'model-local' }));
    });
    await act(async () => {
      resolveMetadata?.([
        {
          id: 'conv-1',
          title: '迟到服务端标题',
          model_id: 'model-stale',
          updated_at: '2026-07-03T00:00:00Z',
        },
      ]);
    });

    expect(store.getState().conversation.byId['conv-1']).toEqual(
      expect.objectContaining({
        title: '本地标题',
        model_id: 'model-local',
        updatedAt: 999,
      })
    );
  });

  it('metadata 失败后按上限退避重试并在恢复后确认 dirty', async () => {
    vi.useFakeTimers();
    getConversationsMock.mockResolvedValue({
      items: [], page: 1, page_size: 20, total_pages: 1, total: 0, has_next: false, has_prev: false,
    } as never);
    getConversationsMetadataMock
      .mockRejectedValueOnce(new Error('第一次失败'))
      .mockRejectedValueOnce(new Error('第二次失败'))
      .mockResolvedValueOnce([]);
    const store = createStore(true);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    await act(async () => {
      store.dispatch(requestConversationListRefresh('conv-1'));
      await Promise.resolve();
    });
    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(METADATA_RETRY_BASE_MS);
    });
    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(METADATA_RETRY_BASE_MS * 2);
    });
    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(3);
    expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
  });

  it('metadata 连续失败达到上限后不紧循环，logout 后也不继续重试', async () => {
    vi.useFakeTimers();
    getConversationsMock.mockResolvedValue({
      items: [], page: 1, page_size: 20, total_pages: 1, total: 0, has_next: false, has_prev: false,
    } as never);
    getConversationsMetadataMock.mockRejectedValue(new Error('持续失败'));
    const store = createStore(true);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    await act(async () => {
      store.dispatch(requestConversationListRefresh('conv-1'));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(METADATA_RETRY_BASE_MS * 10);
    });
    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(3);
    expect(store.getState().conversation.conversationListDirtyIds).toEqual(['conv-1']);

    act(() => {
      store.dispatch(logout());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(METADATA_RETRY_BASE_MS * 100);
    });
    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(3);
  });

  it('metadata 最终失败请求期间出现新 dirty signal 时启动新一轮有限重试', async () => {
    vi.useFakeTimers();
    getConversationsMock.mockResolvedValue({
      items: [], page: 1, page_size: 20, total_pages: 1, total: 0, has_next: false, has_prev: false,
    } as never);
    let rejectFinalAttempt: ((error: Error) => void) | undefined;
    getConversationsMetadataMock
      .mockRejectedValueOnce(new Error('第一次失败'))
      .mockRejectedValueOnce(new Error('第二次失败'))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectFinalAttempt = reject;
      }) as never)
      .mockResolvedValueOnce([]);
    const store = createStore(true);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    await act(async () => {
      store.dispatch(requestConversationListRefresh('conv-1'));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(METADATA_RETRY_BASE_MS);
      await vi.advanceTimersByTimeAsync(METADATA_RETRY_BASE_MS * 2);
    });
    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(3);

    act(() => {
      store.dispatch(requestConversationListRefresh('conv-1'));
      store.dispatch(requestConversationListRefresh('conv-2'));
    });
    await act(async () => {
      rejectFinalAttempt?.(new Error('最终失败'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(4);
    expect(getConversationsMetadataMock).toHaveBeenNthCalledWith(4, ['conv-1', 'conv-2']);
    expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
  });

  it('metadata 首次失败进入退避后，组件 unmount 不再继续请求', async () => {
    vi.useFakeTimers();
    getConversationsMock.mockResolvedValue({
      items: [], page: 1, page_size: 20, total_pages: 1, total: 0, has_next: false, has_prev: false,
    } as never);
    getConversationsMetadataMock.mockRejectedValue(new Error('持续失败'));
    const store = createStore(true);
    const { unmount } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      store.dispatch(requestConversationListRefresh('conv-1'));
      await Promise.resolve();
    });
    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(METADATA_RETRY_BASE_MS * 100);
    });
    expect(getConversationsMetadataMock).toHaveBeenCalledTimes(1);
  });

  it('loadMore 同步 singleflight，重渲染前重复调用只请求一次同页', async () => {
    let resolvePage2: ((value: unknown) => void) | undefined;
    getConversationsMock
      .mockResolvedValueOnce({
        items: [createServerConversation('conv-1')],
        page: 1,
        page_size: 20,
        total_pages: 2,
        total: 21,
        has_next: true,
        has_prev: false,
      } as never)
      .mockImplementation(() => new Promise((resolve) => {
        resolvePage2 = resolve;
      }) as never);
    const store = createStore(true);
    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(result.current.pagination?.hasNext).toBe(true));

    act(() => {
      void result.current.loadMore();
      void result.current.loadMore();
    });
    expect(getConversationsMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvePage2?.({
        items: [createServerConversation('conv-21')],
        page: 2,
        page_size: 20,
        total_pages: 2,
        total: 21,
        has_next: false,
        has_prev: true,
      });
    });
  });

  it('loadMore 迟到重复项不会复活请求期间本地删除的会话', async () => {
    let resolvePage2: ((value: unknown) => void) | undefined;
    getConversationsMock
      .mockResolvedValueOnce({
        items: [
          createServerConversation('conv-a'),
          createServerConversation('conv-b'),
        ],
        page: 1,
        page_size: 20,
        total_pages: 2,
        total: 21,
        has_next: true,
        has_prev: false,
      } as never)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePage2 = resolve;
      }) as never);
    const store = createStore(true);
    const { result } = renderHook(() => useConversationList(), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(result.current.pagination?.hasNext).toBe(true));

    act(() => {
      void result.current.loadMore();
    });
    await waitFor(() => expect(getConversationsMock).toHaveBeenCalledTimes(2));
    act(() => {
      store.dispatch(removeConversation('conv-a'));
    });
    await act(async () => {
      resolvePage2?.({
        items: [
          createServerConversation('conv-a'),
          createServerConversation('conv-c'),
        ],
        page: 2,
        page_size: 20,
        total_pages: 2,
        total: 21,
        has_next: false,
        has_prev: true,
      });
    });

    expect(store.getState().conversation.listIds).toEqual(['conv-b', 'conv-c']);
    expect(store.getState().conversation.byId['conv-a']).toBeUndefined();
  });

  it('dirty metadata IDs 按后端上限 100 分批', async () => {
    getConversationsMock.mockResolvedValue({
      items: [], page: 1, page_size: 20, total_pages: 1, total: 0, has_next: false, has_prev: false,
    } as never);
    getConversationsMetadataMock.mockResolvedValue([]);
    const store = createStore(true);
    renderHook(() => useConversationList(), { wrapper: createWrapper(store) });

    act(() => {
      for (let index = 0; index < 205; index += 1) {
        store.dispatch(requestConversationListRefresh(`conv-${index}`));
      }
    });

    await waitFor(() => expect(getConversationsMetadataMock).toHaveBeenCalledTimes(3));
    expect(getConversationsMetadataMock.mock.calls.map(([ids]) => ids.length)).toEqual([100, 100, 5]);
    expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
  });
});
