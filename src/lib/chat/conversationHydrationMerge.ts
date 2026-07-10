import type { RootState } from '@/redux/store';

export interface ConversationHydrationMetadata {
  title: string;
  model_id: string;
  updatedAt: number;
}

type HydrationMergeState = Pick<RootState, 'conversation'> & {
  stream?: RootState['stream'];
};

export function getConversationHydrationMetadata(
  state: HydrationMergeState,
  conversationId: string
): ConversationHydrationMetadata | null {
  const conversation = state.conversation.byId[conversationId];
  if (!conversation) {
    return null;
  }
  return {
    title: conversation.title,
    model_id: conversation.model_id,
    updatedAt: conversation.updatedAt,
  };
}

export function getProtectedHydrationMessageIds(
  state: HydrationMergeState,
  conversationId: string
): string[] {
  const protectedIds = new Set(
    (state.conversation.byId[conversationId]?.messages ?? [])
      .filter((message) => message.status === 'pending' || message.status === 'failed' || message.shouldSyncToDb)
      .map((message) => message.id)
  );
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
