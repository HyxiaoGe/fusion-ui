import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chatsTable, messagesTable, settingsTable } = vi.hoisted(() => ({
  chatsTable: {
    get: vi.fn(),
    update: vi.fn(),
    add: vi.fn(),
    toArray: vi.fn(),
    delete: vi.fn(),
  },
  messagesTable: {
    where: vi.fn(),
    get: vi.fn(),
    add: vi.fn(),
    put: vi.fn(),
    bulkAdd: vi.fn(),
  },
  settingsTable: {
    put: vi.fn(),
    get: vi.fn(),
    toArray: vi.fn(),
  },
}));

vi.mock('dexie', () => ({
  default: class DexieMock {
    chats = chatsTable;
    messages = messagesTable;
    settings = settingsTable;

    version() {
      return {
        stores: () => ({
          upgrade: () => undefined,
        }),
      };
    }

    transaction() {
      throw new Error('本测试不应进入 transaction');
    }
  },
}));

import { chatStore } from './chatStore';

describe('chatStore.saveChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatsTable.get.mockResolvedValue({ id: 'chat-1' });
    chatsTable.update.mockResolvedValue(1);
  });

  it('更新既有会话时同步知识库范围', async () => {
    await chatStore.saveChat({
      id: 'chat-1',
      title: '测试会话',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-1', 'kb-2'],
      messages: [],
      createdAt: 1,
      updatedAt: 2,
    });

    expect(chatsTable.update).toHaveBeenCalledWith('chat-1', {
      title: '测试会话',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-1', 'kb-2'],
      updatedAt: 2,
    });
  });
});
