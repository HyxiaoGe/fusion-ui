import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import conversationReducer, {
  setHydrationStatus,
  upsertConversation,
} from '@/redux/slices/conversationSlice';
import type { Conversation } from '@/types/conversation';
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
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(Provider, { store, children })
  );
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
