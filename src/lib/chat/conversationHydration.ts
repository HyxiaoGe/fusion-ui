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

function mergeTurnMessages(turnId: string, turnMessages: ServerMessage[]): Message[] {
  if (turnMessages.length === 1) {
    const singleMessage = turnMessages[0];
    return [
      {
        id: singleMessage.id,
        role: singleMessage.role,
        content: singleMessage.content,
        timestamp: parseServerTimestamp(singleMessage.created_at),
        turnId,
      },
    ];
  }

  const userMessage = turnMessages.find((message) => message.role === 'user');
  const reasoningMessage = turnMessages.find((message) => message.type === 'reasoning_content');
  const assistantMessage = turnMessages.find((message) => message.type === 'assistant_content');

  const mergedMessages: Message[] = [];

  if (userMessage) {
    mergedMessages.push({
      id: userMessage.id,
      role: userMessage.role,
      content: userMessage.content,
      timestamp: parseServerTimestamp(userMessage.created_at),
      turnId,
    });
  }

  if (assistantMessage) {
    mergedMessages.push({
      id: assistantMessage.id,
      role: 'assistant',
      content: assistantMessage.content,
      reasoning: reasoningMessage?.content,
      duration: reasoningMessage?.duration ?? undefined,
      isReasoningVisible: false,
      timestamp: parseServerTimestamp(assistantMessage.created_at),
      turnId,
    });
  }

  return mergedMessages;
}

export function buildChatFromServerConversation(serverConversation: ServerConversation): Conversation {
  const groupedMessages = new Map<string, ServerMessage[]>();

  for (const message of serverConversation.messages) {
    const turnId = message.turn_id || message.id;
    const existingMessages = groupedMessages.get(turnId) || [];
    existingMessages.push(message);
    groupedMessages.set(turnId, existingMessages);
  }

  const messages = [...groupedMessages.entries()]
    .flatMap(([turnId, turnMessages]) => mergeTurnMessages(turnId, turnMessages))
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
