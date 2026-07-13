import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import conversationReducer, {
  appendMessage,
  setHydrationStatus,
  upsertConversation,
  updateMessage,
} from '@/redux/slices/conversationSlice';
import type { Conversation } from '@/types/conversation';
import { getConversationHydrationMetadata } from '@/lib/chat/conversationHydrationMerge';
import { useConversation } from './useConversation';

const {
  getConversationDetailRequestMetadataMock,
  isStaleConversationDetailRequestErrorMock,
  loadConversationDetailMock,
} = vi.hoisted(() => ({
  getConversationDetailRequestMetadataMock: vi.fn(),
  isStaleConversationDetailRequestErrorMock: vi.fn(),
  loadConversationDetailMock: vi.fn(),
}));

vi.mock('@/lib/chat/conversationDetailResource', () => ({
  getConversationDetailRequestMetadata: getConversationDetailRequestMetadataMock,
  isStaleConversationDetailRequestError: isStaleConversationDetailRequestErrorMock,
  loadConversationDetail: loadConversationDetailMock,
}));

function createStore() {
  return configureStore({
    reducer: {
      conversation: conversationReducer,
    },
  });
}

function createWrapper(store: ReturnType<typeof createStore>) {
  function ConversationTestProvider({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  return ConversationTestProvider;
}

function conversation(messages: Conversation['messages'] = []): Conversation {
  return {
    id: 'chat-1',
    title: '测试会话',
    model_id: 'model-1',
    messages,
    createdAt: 1,
    updatedAt: 2,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function textMessage(
  id: string,
  role: 'user' | 'assistant',
  text: string,
  status: 'pending' | 'failed' | null = null,
): Conversation['messages'][number] {
  return {
    id,
    role,
    content: [{ type: 'text', id: `block-${id}`, text }],
    timestamp: 1,
    status,
  };
}

describe('useConversation', () => {
  beforeEach(() => {
    loadConversationDetailMock.mockReset();
    getConversationDetailRequestMetadataMock.mockReset();
    getConversationDetailRequestMetadataMock.mockReturnValue(null);
    isStaleConversationDetailRequestErrorMock.mockReset();
    isStaleConversationDetailRequestErrorMock.mockReturnValue(false);
  });

  it('成功水合真实空会话后进入 ready 而不是永久 loading', async () => {
    const store = createStore();
    loadConversationDetailMock.mockResolvedValue(conversation([]));

    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(result.current.hydrationView).toBe('ready');
    });
    expect(result.current.conversation?.messages).toEqual([]);
    expect(store.getState().conversation.hydrationStatus['chat-1']).toBe('done');
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
  });

  it('强刷后的空 Redux 直接采用服务端 sequence 顺序，不受时间戳异常影响', async () => {
    const store = createStore();
    loadConversationDetailMock.mockResolvedValue(conversation([
      {
        id: 'user-server',
        role: 'user',
        sequence: 1,
        content: [{ type: 'text', id: 'block-user', text: '用户问题' }],
        timestamp: 9 * 60 * 60 * 1_000,
      },
      {
        id: 'assistant-server',
        role: 'assistant',
        sequence: 2,
        content: [{ type: 'text', id: 'block-assistant', text: '助手回答' }],
        timestamp: 1_000,
      },
    ]));

    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(result.current.hydrationView).toBe('ready');
    });
    expect(result.current.conversation?.messages.map((message) => message.id)).toEqual([
      'user-server',
      'assistant-server',
    ]);
  });

  it('GET 在发送前取得旧快照，即使整轮流已完成后才返回也不丢本地新整轮', async () => {
    const store = createStore();
    const oldTurn = [
      textMessage('user-old', 'user', '旧问题'),
      textMessage('assistant-old', 'assistant', '旧回答'),
    ];
    store.dispatch(upsertConversation(conversation(oldTurn)));
    const baseline = getConversationHydrationMetadata(store.getState() as any, 'chat-1');
    const pending = deferred<Conversation>();
    getConversationDetailRequestMetadataMock.mockReturnValue(baseline);
    loadConversationDetailMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(loadConversationDetailMock).toHaveBeenCalledTimes(1));

    store.dispatch(appendMessage({
      conversationId: 'chat-1',
      message: textMessage('user-new', 'user', '新问题'),
    }));
    store.dispatch(appendMessage({
      conversationId: 'chat-1',
      message: textMessage('assistant-new', 'assistant', '新回答'),
    }));
    pending.resolve(conversation(oldTurn));

    await waitFor(() => expect(result.current.hydrationView).toBe('ready'));
    expect(result.current.conversation?.messages.map((message) => message.id)).toEqual([
      'user-old',
      'assistant-old',
      'user-new',
      'assistant-new',
    ]);
  });

  it('GET 已包含本轮消息但在 streaming 时返回，保留同 ID 本地状态且不重复', async () => {
    const store = createStore();
    const oldTurn = [
      textMessage('user-old', 'user', '旧问题'),
      textMessage('assistant-old', 'assistant', '旧回答'),
    ];
    store.dispatch(upsertConversation(conversation(oldTurn)));
    const baseline = getConversationHydrationMetadata(store.getState() as any, 'chat-1');
    const pending = deferred<Conversation>();
    getConversationDetailRequestMetadataMock.mockReturnValue(baseline);
    loadConversationDetailMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(loadConversationDetailMock).toHaveBeenCalledTimes(1));

    const localUser = textMessage('user-new', 'user', '新问题', 'pending');
    const localAssistant = textMessage('assistant-new', 'assistant', '本地已显示部分');
    store.dispatch(appendMessage({ conversationId: 'chat-1', message: localUser }));
    store.dispatch(appendMessage({ conversationId: 'chat-1', message: localAssistant }));
    pending.resolve(conversation([
      ...oldTurn,
      textMessage('user-new', 'user', '新问题'),
      textMessage('assistant-new', 'assistant', '服务端旧 partial'),
    ]));

    await waitFor(() => expect(result.current.hydrationView).toBe('ready'));
    expect(result.current.conversation?.messages.map((message) => message.id)).toEqual([
      'user-old',
      'assistant-old',
      'user-new',
      'assistant-new',
    ]);
    expect(result.current.conversation?.messages[2]).toMatchObject({ status: 'pending' });
    expect(result.current.conversation?.messages[3].content).toEqual(localAssistant.content);
  });

  it('同 ID 本地流在请求后完成时不会被迟到的服务端旧 partial 覆盖', async () => {
    const store = createStore();
    const localPartial = textMessage('assistant-same', 'assistant', '本地 partial');
    store.dispatch(upsertConversation(conversation([localPartial])));
    const baseline = getConversationHydrationMetadata(store.getState() as any, 'chat-1');
    const pending = deferred<Conversation>();
    getConversationDetailRequestMetadataMock.mockReturnValue(baseline);
    loadConversationDetailMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(loadConversationDetailMock).toHaveBeenCalledTimes(1));

    store.dispatch(updateMessage({
      conversationId: 'chat-1',
      messageId: 'assistant-same',
      patch: {
        content: [{ type: 'text', id: 'block-assistant-same', text: '本地完整回答' }],
        timestamp: 2,
      },
    }));
    pending.resolve(conversation([textMessage('assistant-same', 'assistant', '服务端旧 partial')]));

    await waitFor(() => expect(result.current.hydrationView).toBe('ready'));
    expect(result.current.conversation?.messages[0].content).toEqual([
      { type: 'text', id: 'block-assistant-same', text: '本地完整回答' },
    ]);
  });

  it('请求前已有且未变化的完成副本在服务端快照缺失时会被删除', async () => {
    const store = createStore();
    store.dispatch(upsertConversation(conversation([
      textMessage('server-kept', 'user', '服务端仍存在'),
      textMessage('local-stale', 'assistant', '请求前旧副本'),
    ])));
    const baseline = getConversationHydrationMetadata(store.getState() as any, 'chat-1');
    getConversationDetailRequestMetadataMock.mockReturnValue(baseline);
    loadConversationDetailMock.mockResolvedValue(conversation([
      textMessage('server-kept', 'user', '服务端仍存在'),
    ]));
    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => expect(result.current.hydrationView).toBe('ready'));
    expect(result.current.conversation?.messages.map((message) => message.id)).toEqual(['server-kept']);
  });

  it('请求开始时 conversation 不存在也会使用空 baseline 保留随后创建的本地消息', async () => {
    const store = createStore();
    const baseline = getConversationHydrationMetadata(store.getState() as any, 'chat-1');
    const pending = deferred<Conversation>();
    getConversationDetailRequestMetadataMock.mockReturnValue(baseline);
    loadConversationDetailMock.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => expect(loadConversationDetailMock).toHaveBeenCalledTimes(1));

    store.dispatch(upsertConversation(conversation([
      textMessage('user-created', 'user', '新建问题'),
      textMessage('assistant-created', 'assistant', '新建回答'),
    ])));
    pending.resolve(conversation([]));

    await waitFor(() => expect(result.current.hydrationView).toBe('ready'));
    expect(result.current.conversation?.messages.map((message) => message.id)).toEqual([
      'user-created',
      'assistant-created',
    ]);
  });

  it('路由遇到 hover 已标记的 loading 状态时会加入共享请求并完成水合', async () => {
    const store = createStore();
    store.dispatch(upsertConversation(conversation([])));
    store.dispatch(setHydrationStatus({ id: 'chat-1', status: 'loading' }));
    loadConversationDetailMock.mockResolvedValue(conversation([]));

    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(result.current.hydrationView).toBe('ready');
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
  });

  it('retryHydration 对已有非空缓存也强制发起真实详情请求', async () => {
    const store = createStore();
    store.dispatch(upsertConversation(conversation([
      {
        id: 'message-old',
        role: 'assistant',
        content: [{ type: 'text', id: 'block-old', text: '旧内容' }],
        timestamp: 1,
      },
    ])));
    store.dispatch(setHydrationStatus({ id: 'chat-1', status: 'done' }));
    loadConversationDetailMock.mockResolvedValue(conversation([
      {
        id: 'message-old',
        role: 'assistant',
        content: [{ type: 'text', id: 'block-new', text: '服务端完整内容' }],
        timestamp: 1,
      },
    ]));

    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    expect(result.current.hydrationView).toBe('ready');
    expect(loadConversationDetailMock).not.toHaveBeenCalled();

    act(() => {
      result.current.retryHydration();
    });

    await waitFor(() => {
      expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
      expect(store.getState().conversation.hydrationStatus['chat-1']).toBe('done');
    });
  });

  it('非空缓存后台刷新失败时继续展示现有内容而不是切到整页错误', async () => {
    const store = createStore();
    store.dispatch(upsertConversation(conversation([
      {
        id: 'message-cached',
        role: 'assistant',
        content: [{ type: 'text', id: 'block-cached', text: '已缓存内容' }],
        timestamp: 1,
      },
    ])));
    store.dispatch(setHydrationStatus({ id: 'chat-1', status: 'done' }));
    loadConversationDetailMock.mockRejectedValue(new Error('后台刷新失败'));

    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    act(() => {
      result.current.retryHydration();
    });

    await waitFor(() => {
      expect(store.getState().conversation.hydrationStatus['chat-1']).toBe('error');
    });
    expect(result.current.hydrationView).toBe('ready');
    expect(result.current.conversation?.messages[0].id).toBe('message-cached');
  });

  it('请求在 logout/reset 后失效时不会重新写入会话或错误状态', async () => {
    let rejectRequest!: (error: unknown) => void;
    const request = new Promise<Conversation>((_resolve, reject) => {
      rejectRequest = reject;
    });
    const staleError = new Error('stale');
    const store = createStore();
    loadConversationDetailMock.mockReturnValue(request);
    isStaleConversationDetailRequestErrorMock.mockImplementation((error) => error === staleError);
    const { unmount } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(store.getState().conversation.hydrationStatus['chat-1']).toBe('loading');
    });
    unmount();
    store.dispatch({ type: 'conversation/resetConversationState' });
    rejectRequest(staleError);

    await act(async () => {
      await request.catch(() => undefined);
      await Promise.resolve();
    });

    expect(store.getState().conversation.byId['chat-1']).toBeUndefined();
    expect(store.getState().conversation.hydrationStatus['chat-1']).toBeUndefined();
    expect(store.getState().conversation.hydrationError['chat-1']).toBeUndefined();
  });

  it('仍挂在当前页面的详情请求失效后不会永久停在 loading，而会重新水合', async () => {
    let rejectFirstRequest!: (error: unknown) => void;
    const firstRequest = new Promise<Conversation>((_resolve, reject) => {
      rejectFirstRequest = reject;
    });
    const staleError = new Error('stale');
    const store = createStore();
    loadConversationDetailMock
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(conversation([textMessage('server-fresh', 'assistant', '新快照')]));
    isStaleConversationDetailRequestErrorMock.mockImplementation((error) => error === staleError);

    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });
    await waitFor(() => {
      expect(store.getState().conversation.hydrationStatus['chat-1']).toBe('loading');
    });

    rejectFirstRequest(staleError);

    await waitFor(() => {
      expect(loadConversationDetailMock).toHaveBeenCalledTimes(2);
      expect(result.current.hydrationView).toBe('ready');
    });
    expect(store.getState().conversation.hydrationStatus['chat-1']).toBe('done');
    expect(result.current.conversation?.messages.map((message) => message.id)).toEqual([
      'server-fresh',
    ]);
  });

  it('详情请求失败后允许 retryHydration 重新请求并恢复 ready', async () => {
    const store = createStore();
    loadConversationDetailMock
      .mockRejectedValueOnce(new Error('加载失败'))
      .mockResolvedValueOnce(conversation([]));

    const { result } = renderHook(() => useConversation('chat-1'), {
      wrapper: createWrapper(store),
    });

    await waitFor(() => {
      expect(result.current.hydrationView).toBe('error');
    });

    act(() => {
      result.current.retryHydration();
    });

    await waitFor(() => {
      expect(result.current.hydrationView).toBe('ready');
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(2);
  });
});
