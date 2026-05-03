import { describe, expect, it } from 'vitest';

import reducer, {
  materializeConversation,
  setConversationList,
} from './conversationSlice';
import type { Conversation } from '@/types/conversation';

function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: overrides.id ?? 'conv-1',
    title: overrides.title ?? 'Test',
    model_id: overrides.model_id ?? 'model-1',
    messages: overrides.messages ?? [],
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
  };
}

describe('conversationSlice', () => {
  it('keeps hydrated messages when refreshing the visible list', () => {
    const initialState = {
      byId: {
        'conv-1': createConversation({
          id: 'conv-1',
          title: 'Old Title',
          messages: [{ id: 'm1', role: 'assistant', content: [{ type: 'text' as const, id: 'blk_1', text: 'saved' }], timestamp: 1 }],
          updatedAt: 1,
        }),
      },
      listIds: ['conv-1'],
      pagination: null,
      isLoadingList: true,
      isLoadingMore: false,
      listError: null,
      conversationListVersion: 0,
      hydrationStatus: {},
      hydrationError: {},
      pendingConversationId: null,
      animatingTitleId: null,
      reasoningEnabled: true,
      globalError: null,
    };

    const nextState = reducer(
      initialState as ReturnType<typeof reducer>,
      setConversationList({
        conversations: [
          createConversation({
            id: 'conv-1',
            title: 'Server Title',
            messages: [],
            updatedAt: 99,
          }),
        ],
        pagination: {
          currentPage: 1,
          pageSize: 10,
          totalPages: 1,
          totalCount: 1,
          hasNext: false,
          hasPrev: false,
        },
      })
    );

    expect(nextState.listIds).toEqual(['conv-1']);
    expect(nextState.byId['conv-1'].title).toBe('Server Title');
    expect(nextState.byId['conv-1'].updatedAt).toBe(99);
    expect(nextState.byId['conv-1'].messages).toEqual([
      expect.objectContaining({ id: 'm1', content: [{ type: 'text', id: 'blk_1', text: 'saved' }] }),
    ]);
  });

  it('preserves previously loaded pages when refreshing the first page', () => {
    // 模拟：用户点了"显示更多"加载到第 2 页，listIds 里有 15 条
    const initialState = {
      byId: Object.fromEntries(
        Array.from({ length: 15 }, (_, i) => {
          const id = `conv-${i + 1}`;
          return [id, createConversation({ id, title: `Old ${id}`, updatedAt: i + 1 })];
        })
      ),
      listIds: Array.from({ length: 15 }, (_, i) => `conv-${i + 1}`),
      pagination: {
        currentPage: 2,
        pageSize: 10,
        totalPages: 2,
        totalCount: 15,
        hasNext: false,
        hasPrev: true,
      },
      isLoadingList: false,
      isLoadingMore: false,
      listError: null,
      conversationListVersion: 1,
      hydrationStatus: {},
      hydrationError: {},
      pendingConversationId: null,
      animatingTitleId: null,
      reasoningEnabled: true,
      globalError: null,
    };

    // requestConversationListRefresh 后触发 fetchList(1, 10) 只拉第 1 页
    const nextState = reducer(
      initialState as ReturnType<typeof reducer>,
      setConversationList({
        conversations: Array.from({ length: 10 }, (_, i) => {
          const id = `conv-${i + 1}`;
          return createConversation({ id, title: `Updated ${id}`, updatedAt: 100 + i });
        }),
        pagination: {
          currentPage: 1,
          pageSize: 10,
          totalPages: 2,
          totalCount: 15,
          hasNext: true,
          hasPrev: false,
        },
      })
    );

    // 第 2 页加载的 ID（11~15）必须保留
    expect(nextState.listIds).toContain('conv-11');
    expect(nextState.listIds).toContain('conv-15');
    expect(nextState.listIds).toHaveLength(15);
    // 第 1 页的元数据被更新
    expect(nextState.byId['conv-1'].title).toBe('Updated conv-1');
    // pagination：currentPage 保留之前的（不退回到 1）
    expect(nextState.pagination?.currentPage).toBe(2);
    // hasNext 按已加载 vs total 重算（15 条已加载 = totalCount → false）
    expect(nextState.pagination?.hasNext).toBe(false);
  });

  it('materializes a pending conversation and moves it to the top', () => {
    const initialState = {
      byId: {
        temp: createConversation({ id: 'temp', title: 'Draft' }),
        older: createConversation({ id: 'older', title: 'Older' }),
      },
      listIds: ['temp', 'older'],
      pagination: null,
      isLoadingList: false,
      isLoadingMore: false,
      listError: null,
      conversationListVersion: 0,
      hydrationStatus: {},
      hydrationError: {},
      pendingConversationId: 'temp',
      animatingTitleId: null,
      reasoningEnabled: true,
      globalError: null,
    };

    const nextState = reducer(
      initialState as ReturnType<typeof reducer>,
      materializeConversation({
        pendingId: 'temp',
        serverConversation: createConversation({ id: 'server-1', title: 'Server' }),
      })
    );

    expect(nextState.pendingConversationId).toBeNull();
    expect(nextState.byId.temp).toBeUndefined();
    expect(nextState.listIds[0]).toBe('server-1');
    expect(nextState.listIds).toEqual(['server-1', 'older']);
    expect(nextState.hydrationStatus['server-1']).toBe('done');
  });
});
