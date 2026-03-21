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

  it('hydrates assistant reasoning directly from assistant_content messages', () => {
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
          type: 'user_query',
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
          reasoning: 'thinking...',
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
      isReasoningVisible: false,
      turnId: 'turn-1',
    });
  });

  it('hydrates assistant messages with null reasoning when absent', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-2',
      title: 'Server chat',
      model: 'qwen-max-latest',
      provider: 'qwen',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          type: 'user_query',
          content: 'hello',
          turn_id: 'turn-1',
          created_at: '2026-03-14T08:00:00Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          type: 'assistant_content',
          content: 'world',
          reasoning: null,
          turn_id: 'turn-1',
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages[1]).toMatchObject({
      id: 'assistant-1',
      reasoning: null,
    });
  });

  it('filters legacy reasoning_content records from visible messages', () => {
    const chat = buildChatFromServerConversation({
      id: 'chat-3',
      title: 'Server chat',
      model: 'qwen-max-latest',
      provider: 'qwen',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          type: 'user_query',
          content: 'hello',
          turn_id: 'turn-1',
          created_at: '2026-03-14T08:00:00Z',
        },
        {
          id: 'reason-1',
          role: 'assistant',
          type: 'reasoning_content',
          content: 'legacy reasoning',
          turn_id: 'turn-1',
          created_at: '2026-03-14T08:00:01Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          type: 'assistant_content',
          content: 'world',
          reasoning: null,
          turn_id: 'turn-1',
          created_at: '2026-03-14T08:00:02Z',
        },
      ],
    });

    expect(chat.messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
    expect(chat.messages[1].reasoning).toBeNull();
  });
});
