import { describe, expect, it } from 'vitest';

import reducer, {
  materializeConversation,
  setConversationList,
  updateConversationsMetadata,
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

  it('updateConversationsMetadata only mutates byId entries that already exist, never touches listIds or pagination', () => {
    const initialState = {
      byId: {
        'conv-1': createConversation({ id: 'conv-1', title: 'Old 1', updatedAt: 1 }),
        'conv-2': createConversation({ id: 'conv-2', title: 'Old 2', updatedAt: 2 }),
      },
      listIds: ['conv-1', 'conv-2'],
      pagination: {
        currentPage: 2, pageSize: 10, totalPages: 2, totalCount: 12, hasNext: false, hasPrev: true,
      },
      isLoadingList: false,
      isLoadingMore: false,
      listError: null,
      conversationListVersion: 5,
      hydrationStatus: {},
      hydrationError: {},
      pendingConversationId: null,
      animatingTitleId: null,
      reasoningEnabled: true,
      globalError: null,
      searchResults: null,
      isSearching: false,
      searchError: null,
    };

    const next = reducer(
      initialState as ReturnType<typeof reducer>,
      updateConversationsMetadata([
        { id: 'conv-1', title: 'New 1', model_id: 'gpt-4', updatedAt: 100 },
        { id: 'conv-99', title: 'Should not appear', model_id: 'gpt-4', updatedAt: 999 }, // 不存在的 ID 应被忽略
      ])
    );

    // listIds 不变
    expect(next.listIds).toEqual(['conv-1', 'conv-2']);
    // pagination 不变
    expect(next.pagination?.currentPage).toBe(2);
    expect(next.pagination?.totalCount).toBe(12);
    // 已存在的元数据更新
    expect(next.byId['conv-1'].title).toBe('New 1');
    expect(next.byId['conv-1'].updatedAt).toBe(100);
    // 不存在的 ID 不会被加入
    expect(next.byId['conv-99']).toBeUndefined();
    // 未提及的 conversation 完全不变
    expect(next.byId['conv-2'].title).toBe('Old 2');
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
