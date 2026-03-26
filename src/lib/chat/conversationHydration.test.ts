import { describe, expect, it } from 'vitest';

import {
  buildChatFromServerConversation,
  getConversationHydrationView,
  parseServerTimestamp,
  shouldHydrateConversation,
} from './conversationHydration';

describe('conversationHydration', () => {
  it('parses plain database timestamps as utc values', () => {
    expect(parseServerTimestamp('2026-03-14 21:30:00')).toBe(new Date('2026-03-14T21:30:00Z').getTime());
  });

  it('requests hydration for missing or empty local chats', () => {
    expect(shouldHydrateConversation(null)).toBe(true);
    expect(shouldHydrateConversation({ messages: [] })).toBe(true);
    expect(shouldHydrateConversation({ messages: [{ id: 'msg-1' }] as any[] })).toBe(false);
  });

  it('treats empty-shell chats with server errors as a hydration error state', () => {
    expect(
      getConversationHydrationView({
        chatId: 'chat-1',
        chat: { messages: [] },
        isLoadingServerChat: false,
        serverError: '加载聊天数据失败',
      })
    ).toBe('error');
  });

  it('treats empty-shell chats without errors as loading until hydrated', () => {
    expect(
      getConversationHydrationView({
        chatId: 'chat-1',
        chat: { messages: [] },
        isLoadingServerChat: false,
        serverError: null,
      })
    ).toBe('loading');
  });

  it('hydrates assistant thinking blocks from content', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-1',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      created_at: '2026-03-14T08:00:00Z',
      updated_at: '2026-03-14T08:02:00Z',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', id: 'blk_u1', text: 'hello' }],
          created_at: '2026-03-14T08:00:00Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [
            { type: 'thinking', id: 'blk_t1', thinking: 'thinking...' },
            { type: 'text', id: 'blk_a1', text: 'world' },
          ],
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      content: [{ type: 'text', id: 'blk_u1', text: 'hello' }],
    });
    expect(chat.messages[1]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: [
        { type: 'thinking', id: 'blk_t1', thinking: 'thinking...' },
        { type: 'text', id: 'blk_a1', text: 'world' },
      ],
      isReasoningVisible: false,
    });
  });

  it('hydrates assistant messages without thinking blocks', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-2',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', id: 'blk_u1', text: 'hello' }],
          created_at: '2026-03-14T08:00:00Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'blk_a1', text: 'world' }],
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages[1]).toMatchObject({
      id: 'assistant-1',
      isReasoningVisible: undefined,
    });
  });

  it('preserves all content blocks in the hydrated messages', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-3',
      title: 'Server chat',
      model_id: 'qwen-max-latest',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', id: 'blk_u1', text: 'hello' }],
          created_at: '2026-03-14T08:00:00Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: [
            { type: 'thinking', id: 'blk_t1', thinking: 'deep thought' },
            { type: 'text', id: 'blk_a1', text: 'world' },
          ],
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
    expect(chat.messages[1].content).toHaveLength(2);
    expect(chat.messages[1].content[0]).toMatchObject({ type: 'thinking', thinking: 'deep thought' });
    expect(chat.messages[1].content[1]).toMatchObject({ type: 'text', text: 'world' });
  });
});
