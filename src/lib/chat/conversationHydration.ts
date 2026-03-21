import type { Conversation, Message } from '@/types/conversation';
import { parseTimestamp } from '@/lib/utils/parseTimestamp';

type ServerMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string | number | null;
  turn_id?: string | null;
  type?: string | null;
  duration?: number | null;
  reasoning?: string | null;
};

type ServerConversation = {
  id: string;
  title: string;
  model: string;
  provider?: string;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  messages: ServerMessage[];
};

export const parseServerTimestamp = parseTimestamp;

export function shouldHydrateConversation(chat: Pick<Conversation, 'messages'> | null | undefined): boolean {
  return !chat || chat.messages.length === 0;
}

export function getConversationHydrationView(options: {
  chatId?: string | null;
  chat: Pick<Conversation, 'messages'> | null | undefined;
  isLoadingServerChat: boolean;
  serverError?: string | null;
}): 'loading' | 'error' | 'ready' {
  const { chatId, chat, isLoadingServerChat, serverError } = options;

  if (!chatId) {
    return 'ready';
  }

  const needsHydration = shouldHydrateConversation(chat);

  if (!needsHydration) {
    return 'ready';
  }

  if (serverError) {
    return 'error';
  }

  if (isLoadingServerChat || needsHydration) {
    return 'loading';
  }

  return 'ready';
}

function buildVisibleMessage(serverMessage: ServerMessage): Message | null {
  const turnId = serverMessage.turn_id || serverMessage.id;

  if (serverMessage.type === 'reasoning_content') {
    return null;
  }

  if (serverMessage.type === 'user_query') {
    return {
      id: serverMessage.id,
      role: 'user',
      content: serverMessage.content,
      reasoning: null,
      timestamp: parseServerTimestamp(serverMessage.created_at),
      turnId,
    };
  }

  if (serverMessage.type === 'assistant_content') {
    return {
      id: serverMessage.id,
      role: 'assistant',
      content: serverMessage.content,
      reasoning: serverMessage.reasoning ?? null,
      duration: serverMessage.duration ?? undefined,
      isReasoningVisible: false,
      timestamp: parseServerTimestamp(serverMessage.created_at),
      turnId,
    };
  }

  return null;
}

export function buildChatFromServerConversation(serverConversation: ServerConversation): Conversation {
  const messages = serverConversation.messages
    .map(buildVisibleMessage)
    .filter((message): message is Message => Boolean(message))
    .sort((left, right) => (left.timestamp || 0) - (right.timestamp || 0));

  return {
    id: serverConversation.id,
    title: serverConversation.title,
    messages,
    model: serverConversation.model,
    provider: serverConversation.provider,
    createdAt: parseServerTimestamp(serverConversation.created_at),
    updatedAt: parseServerTimestamp(serverConversation.updated_at),
  };
}
