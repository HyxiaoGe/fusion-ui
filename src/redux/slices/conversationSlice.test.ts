import { describe, expect, it } from 'vitest';

import reducer, {
  clearConversationMessages,
  materializeConversation,
  mergeHydratedConversation,
  removeConversation,
  requestConversationListRefresh,
  resetConversationState,
  acknowledgeConversationListRefresh,
  setConversationList,
  setHydrationStatus,
  setLastReadyConversationSnapshot,
  upsertConversation,
  updateConversationModel,
  updateConversationTitle,
  updateConversationsMetadata,
} from './conversationSlice';
import type { Conversation, Message } from '@/types/conversation';

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

function textMessage(id: string): Message {
  return {
    id,
    role: 'user',
    content: [{ type: 'text', id: `${id}-block`, text: id }],
    timestamp: 1,
  };
}

describe('conversationSlice', () => {
  it('会话列表 dirty id 去重排队，并只确认已完成的 id', () => {
    let state = reducer(undefined, requestConversationListRefresh('conv-1'));
    state = reducer(state, requestConversationListRefresh('conv-1'));
    state = reducer(state, requestConversationListRefresh('conv-2'));

    expect(state.conversationListDirtyIds).toEqual(['conv-1', 'conv-2']);
    expect(state.conversationListVersion).toBe(3);
    expect(state.conversationListDirtyRevisions).toEqual({
      'conv-1': 2,
      'conv-2': 3,
    });

    state = reducer(
      state,
      acknowledgeConversationListRefresh([{ id: 'conv-1', revision: 1 }])
    );
    expect(state.conversationListDirtyIds).toEqual(['conv-1', 'conv-2']);

    state = reducer(
      state,
      acknowledgeConversationListRefresh([{ id: 'conv-1', revision: 2 }])
    );
    expect(state.conversationListDirtyIds).toEqual(['conv-2']);
  });

  it('迟到的会话详情响应只保留显式保护的请求期间本地消息并标记水合完成', () => {
    let state = reducer(
      undefined,
      upsertConversation(createConversation({
        id: 'conv-1',
        messages: [textMessage('server-existing'), textMessage('local-new')],
      }))
    );
    state = reducer(state, setHydrationStatus({ id: 'conv-1', status: 'loading' }));

    const next = reducer(
      state,
      mergeHydratedConversation({
        conversation: createConversation({
          id: 'conv-1',
          messages: [textMessage('server-existing')],
        }),
        preserveMessageIds: ['local-new'],
      })
    );

    expect(next.byId['conv-1'].messages.map((message) => message.id)).toEqual([
      'server-existing',
      'local-new',
    ]);
    expect(next.hydrationStatus['conv-1']).toBe('done');
  });

  it('迟到水合以服务端快照顺序替换未保护的完成消息，不重复也不跨轮', () => {
    const localMessages: Message[] = [
      { ...textMessage('server-user-1'), role: 'user', sequence: 1, timestamp: 9_000 },
      { ...textMessage('server-assistant-1'), role: 'assistant', sequence: 2, timestamp: 1_000 },
      { ...textMessage('local-user-2'), role: 'user', timestamp: 9_500 },
      { ...textMessage('local-assistant-2'), role: 'assistant', timestamp: 1_500 },
    ];
    let state = reducer(
      undefined,
      upsertConversation(createConversation({ id: 'conv-1', messages: localMessages }))
    );

    state = reducer(state, mergeHydratedConversation({
      conversation: createConversation({
        id: 'conv-1',
        messages: [
          { ...textMessage('server-user-1'), role: 'user', sequence: 1, timestamp: 9_000 },
          { ...textMessage('server-assistant-1'), role: 'assistant', sequence: 2, timestamp: 1_000 },
          { ...textMessage('server-user-2'), role: 'user', sequence: 3, timestamp: 9_500 },
          { ...textMessage('server-assistant-2'), role: 'assistant', sequence: 4, timestamp: 1_500 },
        ],
      }),
    }));

    expect(state.byId['conv-1'].messages.map((message) => message.id)).toEqual([
      'server-user-1',
      'server-assistant-1',
      'server-user-2',
      'server-assistant-2',
    ]);
  });

  it('服务端快照缺失时也不会继续保留未保护的本地完成消息', () => {
    let state = reducer(
      undefined,
      upsertConversation(createConversation({
        id: 'conv-1',
        messages: [textMessage('server-existing'), textMessage('local-completed')],
      }))
    );

    state = reducer(state, mergeHydratedConversation({
      conversation: createConversation({
        id: 'conv-1',
        messages: [textMessage('server-existing')],
      }),
    }));

    expect(state.byId['conv-1'].messages.map((message) => message.id)).toEqual(['server-existing']);
  });

  it('安全合并时不覆盖当前流式消息的本地内容', () => {
    const localStreamingMessage: Message = {
      id: 'assistant-local',
      role: 'assistant',
      content: [{ type: 'text', id: 'local-block', text: '本地流式内容' }],
      timestamp: 2,
    };
    let state = reducer(
      undefined,
      upsertConversation(createConversation({ id: 'conv-1', messages: [localStreamingMessage] }))
    );

    state = reducer(
      state,
      mergeHydratedConversation({
        conversation: createConversation({
          id: 'conv-1',
          messages: [{
            ...localStreamingMessage,
            content: [{ type: 'text', id: 'server-block', text: '迟到的服务端旧内容' }],
          }],
        }),
        preserveMessageIds: ['assistant-local'],
      })
    );

    expect(state.byId['conv-1'].messages[0].content).toEqual(localStreamingMessage.content);
  });

  it('请求期间本地重命名或切换模型时迟到响应不覆盖新元数据', () => {
    const requestMetadata = {
      title: '请求开始标题',
      model_id: 'model-old',
      updatedAt: 1,
    };
    let state = reducer(
      undefined,
      upsertConversation(createConversation({
        id: 'conv-1',
        title: requestMetadata.title,
        model_id: requestMetadata.model_id,
        updatedAt: requestMetadata.updatedAt,
      }))
    );
    state = reducer(state, updateConversationTitle({ id: 'conv-1', title: '本地新标题' }));
    state = reducer(state, updateConversationModel({ id: 'conv-1', model_id: 'model-new' }));

    state = reducer(state, mergeHydratedConversation({
      conversation: createConversation({
        id: 'conv-1',
        title: '服务端迟到旧标题',
        model_id: 'model-old',
        updatedAt: 2,
      }),
      requestMetadata,
    }));

    expect(state.byId['conv-1'].title).toBe('本地新标题');
    expect(state.byId['conv-1'].model_id).toBe('model-new');
  });

  it('请求期间元数据未改变时正常接受服务端刷新值', () => {
    const requestMetadata = {
      title: '请求开始标题',
      model_id: 'model-old',
      updatedAt: 1,
    };
    let state = reducer(
      undefined,
      upsertConversation(createConversation({ id: 'conv-1', ...requestMetadata }))
    );

    state = reducer(state, mergeHydratedConversation({
      conversation: createConversation({
        id: 'conv-1',
        title: '服务端新标题',
        model_id: 'model-server-new',
        updatedAt: 3,
      }),
      requestMetadata,
    }));

    expect(state.byId['conv-1'].title).toBe('服务端新标题');
    expect(state.byId['conv-1'].model_id).toBe('model-server-new');
    expect(state.byId['conv-1'].updatedAt).toBe(3);
  });

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
      lastReadyConversationSnapshot: null,
      listIds: ['conv-1'],
      pagination: null,
      isLoadingList: true,
      isLoadingMore: false,
      listError: null,
      conversationListVersion: 0,
      conversationListEpoch: 0,
      conversationListDirtyIds: [],
      conversationListDirtyRevisions: {},
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
      lastReadyConversationSnapshot: null,
      listIds: ['conv-1', 'conv-2'],
      pagination: {
        currentPage: 2, pageSize: 10, totalPages: 2, totalCount: 12, hasNext: false, hasPrev: true,
      },
      isLoadingList: false,
      isLoadingMore: false,
      listError: null,
      conversationListVersion: 5,
      conversationListEpoch: 0,
      conversationListDirtyIds: [],
      conversationListDirtyRevisions: {},
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
      lastReadyConversationSnapshot: null,
      listIds: ['temp', 'older'],
      pagination: null,
      isLoadingList: false,
      isLoadingMore: false,
      listError: null,
      conversationListVersion: 0,
      conversationListEpoch: 0,
      conversationListDirtyIds: [],
      conversationListDirtyRevisions: {},
      hydrationStatus: {},
      hydrationError: {},
      pendingConversationId: 'temp',
      animatingTitleId: null,
      reasoningEnabled: true,
      globalError: null,
      searchResults: null,
      isSearching: false,
      searchError: null,
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

  it('setLastReadyConversationSnapshot writes the UI transition snapshot', () => {
    const messages = [textMessage('m1')];

    const nextState = reducer(
      undefined,
      setLastReadyConversationSnapshot({ chatId: 'conv-1', messages })
    );

    expect(nextState.lastReadyConversationSnapshot).toEqual({
      chatId: 'conv-1',
      messages,
    });
  });

  it('clearConversationMessages clears the matching ready snapshot', () => {
    const messages = [textMessage('m1')];
    const stateWithSnapshot = reducer(
      reducer(undefined, setLastReadyConversationSnapshot({ chatId: 'conv-1', messages })),
      clearConversationMessages('conv-1')
    );

    expect(stateWithSnapshot.lastReadyConversationSnapshot).toBeNull();
  });

  it('removeConversation clears the matching ready snapshot', () => {
    const messages = [textMessage('m1')];
    const nextState = reducer(
      reducer(undefined, setLastReadyConversationSnapshot({ chatId: 'conv-1', messages })),
      removeConversation('conv-1')
    );

    expect(nextState.lastReadyConversationSnapshot).toBeNull();
  });

  it('resetConversationState clears snapshot/dirty revisions and advances request epoch', () => {
    const messages = [textMessage('m1')];
    const stateBeforeReset = reducer(
      reducer(undefined, setLastReadyConversationSnapshot({ chatId: 'conv-1', messages })),
      requestConversationListRefresh('conv-1')
    );
    const nextState = reducer(
      stateBeforeReset,
      resetConversationState()
    );

    expect(nextState.lastReadyConversationSnapshot).toBeNull();
    expect(nextState.conversationListDirtyIds).toEqual([]);
    expect(nextState.conversationListDirtyRevisions).toEqual({});
    expect(nextState.conversationListEpoch).toBe(stateBeforeReset.conversationListEpoch + 1);
  });
});
