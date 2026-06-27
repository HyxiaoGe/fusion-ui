import { describe, expect, it } from 'vitest';
import {
  buildChatConversationPath,
  buildChatNewPath,
  getRouteConversationId,
  isChatNewPath,
  normalizeLegacyNewChatPath,
} from './chatRoutes';

describe('chatRoutes', () => {
  it('builds /chat/new without model when no model id is provided', () => {
    expect(buildChatNewPath()).toBe('/chat/new');
    expect(buildChatNewPath(null)).toBe('/chat/new');
    expect(buildChatNewPath('')).toBe('/chat/new');
  });

  it('builds /chat/new with encoded model hint', () => {
    expect(buildChatNewPath('deepseek-chat')).toBe('/chat/new?model=deepseek-chat');
    expect(buildChatNewPath('model with space')).toBe('/chat/new?model=model+with+space');
  });

  it('builds conversation path from server id', () => {
    expect(buildChatConversationPath('conv-1')).toBe('/chat/conv-1');
  });

  it('recognizes only /chat/new and / as new chat routes', () => {
    expect(isChatNewPath('/chat/new')).toBe(true);
    expect(isChatNewPath('/')).toBe(true);
    expect(isChatNewPath('/chat/conv-1')).toBe(false);
  });

  it('does not treat /chat/new as a conversation id', () => {
    expect(getRouteConversationId('/chat/new')).toBeNull();
    expect(getRouteConversationId('/chat/conv-1')).toBe('conv-1');
  });

  it('normalizes legacy new=true URL to /chat/new', () => {
    expect(normalizeLegacyNewChatPath(new URLSearchParams('new=true&model=deepseek-chat'))).toBe(
      '/chat/new?model=deepseek-chat'
    );
    expect(normalizeLegacyNewChatPath(new URLSearchParams('new=true'))).toBe('/chat/new');
    expect(normalizeLegacyNewChatPath(new URLSearchParams('model=deepseek-chat'))).toBe('/chat/new?model=deepseek-chat');
  });
});
