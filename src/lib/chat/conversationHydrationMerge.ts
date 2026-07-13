import type { RootState } from '@/redux/store';
import type { Message } from '@/types/conversation';

export interface ConversationHydrationMetadata {
  title: string;
  model_id: string;
  updatedAt: number;
  messageSignatures: Record<string, string>;
}

type HydrationMergeState = Pick<RootState, 'conversation'> & {
  stream?: RootState['stream'];
};

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`);
  return `{${entries.join(',')}}`;
}

function getHydrationMessageSignature(message: Message): string {
  return stableSerialize(message);
}

export function getConversationHydrationMetadata(
  state: HydrationMergeState,
  conversationId: string
): ConversationHydrationMetadata {
  const conversation = state.conversation.byId[conversationId];
  return {
    title: conversation?.title ?? '',
    model_id: conversation?.model_id ?? '',
    updatedAt: conversation?.updatedAt ?? 0,
    messageSignatures: Object.fromEntries(
      (conversation?.messages ?? []).map((message) => [
        message.id,
        getHydrationMessageSignature(message),
      ])
    ),
  };
}

export function getProtectedHydrationMessageIds(
  state: HydrationMergeState,
  conversationId: string,
  requestMetadata?: ConversationHydrationMetadata | null,
): string[] {
  const currentMessages = state.conversation.byId[conversationId]?.messages ?? [];
  const protectedIds = new Set(
    currentMessages
      .filter((message) => message.status === 'pending' || message.status === 'failed' || message.shouldSyncToDb)
      .map((message) => message.id)
  );
  if (requestMetadata) {
    const requestSignatures = requestMetadata.messageSignatures ?? {};
    currentMessages.forEach((message) => {
      const requestSignature = requestSignatures[message.id];
      if (
        requestSignature === undefined ||
        requestSignature !== getHydrationMessageSignature(message)
      ) {
        protectedIds.add(message.id);
      }
    });
  }
  const stream = state.stream;
  if (stream?.isStreaming && stream.conversationId === conversationId) {
    if (stream.messageId) {
      protectedIds.add(stream.messageId);
    }
    if (stream.currentRun?.messageId) {
      protectedIds.add(stream.currentRun.messageId);
    }
    if (stream.currentRun?.serverMessageId) {
      protectedIds.add(stream.currentRun.serverMessageId);
    }
  }
  return Array.from(protectedIds);
}
