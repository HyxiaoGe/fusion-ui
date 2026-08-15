import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { saveChatMock } = vi.hoisted(() => ({
  saveChatMock: vi.fn(),
}));

vi.mock('@/lib/db/chatStore', () => ({
  chatStore: {
    saveChat: saveChatMock,
    deleteChat: vi.fn(),
    clearMessages: vi.fn(),
  },
  settingsStore: {
    saveSetting: vi.fn(),
  },
}));

import { persistMiddleware } from './persistMiddleware';
import { updateConversationKnowledgeBaseIds } from '@/redux/slices/conversationSlice';

describe('persistMiddleware', () => {
  it('知识库范围更新后把完整会话快照写入 Dexie', async () => {
    const conversation = {
      id: 'chat-1',
      title: '测试会话',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-new'],
      messages: [],
      createdAt: 1,
      updatedAt: 2,
    };
    const store = {
      getState: () => ({
        conversation: {
          byId: { 'chat-1': conversation },
        },
      }),
    };
    const next = vi.fn((action) => action);

    persistMiddleware(store as never)(next)(updateConversationKnowledgeBaseIds({
      id: 'chat-1',
      knowledgeBaseIds: ['kb-new'],
      updatedAt: 2,
    }));

    await waitFor(() => {
      expect(saveChatMock).toHaveBeenCalledWith(conversation);
    });
  });
});
