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

  it('merges server turn messages into visible user and assistant messages', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-1',
      title: 'Server chat',
      model: 'qwen-max-latest',
      provider: 'qwen',
      created_at: '2026-03-14T08:00:00Z',
      updated_at: '2026-03-14T08:02:00Z',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'hello',
          created_at: '2026-03-14T08:00:00Z',
          turn_id: 'turn-1',
        },
        {
          id: 'reason-1',
          role: 'assistant',
          content: 'thinking...',
          created_at: '2026-03-14T08:00:01Z',
          turn_id: 'turn-1',
          type: 'reasoning_content',
          duration: 321,
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'world',
          created_at: '2026-03-14T08:00:02Z',
          turn_id: 'turn-1',
          type: 'assistant_content',
        },
      ],
    });

    expect(chat.messages).toHaveLength(2);
    expect(chat.messages[0]).toMatchObject({
      id: 'user-1',
      role: 'user',
      content: 'hello',
      turnId: 'turn-1',
    });
    expect(chat.messages[1]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: 'world',
      reasoning: 'thinking...',
      duration: 321,
      isReasoningVisible: false,
      turnId: 'turn-1',
    });
  });
});
