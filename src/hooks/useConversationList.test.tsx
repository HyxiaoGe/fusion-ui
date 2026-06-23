import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';

import authReducer from '@/redux/slices/authSlice';
import conversationReducer, {
  setConversationList,
  updateConversationsMetadata,
  updateMessage,
} from '@/redux/slices/conversationSlice';
import { useConversationList } from './useConversationList';

vi.mock('@/lib/api/chat', () => ({
  getConversations: vi.fn(),
  getConversationsMetadata: vi.fn(),
  searchConversations: vi.fn(),
}));

function createStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      conversation: conversationReducer,
    },
    preloadedState: {
      auth: {
        isAuthenticated: false,
        user: null,
        token: null,
        status: 'idle' as const,
        error: null,
        sessionResolved: true,
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

function seedConversationList(store: ReturnType<typeof createStore>) {
  store.dispatch(
    setConversationList({
      conversations: [
        {
          id: 'conv-1',
          title: '对话 1',
          model_id: 'model-1',
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              content: [{ type: 'text', id: 'blk_1', text: '旧正文' }],
              timestamp: 2,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      pagination: {
        currentPage: 1,
        pageSize: 10,
        totalPages: 1,
        totalCount: 1,
        hasNext: false,
        hasPrev: false,
      },
    }),
  );
}

describe('useConversationList', () => {
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
});
