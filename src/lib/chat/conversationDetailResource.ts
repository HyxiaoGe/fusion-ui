import type { Conversation } from '@/types/conversation';
import { getConversation } from '@/lib/api/chat';
import type { ConversationHydrationMetadata } from './conversationHydrationMerge';
import { buildChatFromServerConversation } from './conversationHydration';

interface LoadConversationDetailOptions {
  requestMetadata?: ConversationHydrationMetadata | null;
}

const inFlightConversationDetails = new Map<string, Promise<Conversation>>();
const requestMetadataByPromise = new WeakMap<Promise<Conversation>, ConversationHydrationMetadata | null>();
const conversationGenerations = new Map<string, number>();
let allConversationDetailsGeneration = 0;

export class StaleConversationDetailRequestError extends Error {
  constructor(conversationId: string) {
    super(`会话详情请求已失效: ${conversationId}`);
    this.name = 'StaleConversationDetailRequestError';
  }
}

export function isStaleConversationDetailRequestError(
  error: unknown
): error is StaleConversationDetailRequestError {
  return error instanceof StaleConversationDetailRequestError;
}

export function loadConversationDetail(
  conversationId: string,
  options: LoadConversationDetailOptions = {}
): Promise<Conversation> {
  const existingRequest = inFlightConversationDetails.get(conversationId);
  if (existingRequest) {
    return existingRequest;
  }

  const requestConversationGeneration = conversationGenerations.get(conversationId) ?? 0;
  const requestAllGeneration = allConversationDetailsGeneration;
  const request = getConversation(conversationId)
    .then((data) => buildChatFromServerConversation(
      data as Parameters<typeof buildChatFromServerConversation>[0]
    ))
    .then((conversation) => {
      const isStale =
        requestAllGeneration !== allConversationDetailsGeneration ||
        requestConversationGeneration !== (conversationGenerations.get(conversationId) ?? 0);
      if (isStale) {
        throw new StaleConversationDetailRequestError(conversationId);
      }
      return conversation;
    })
    .finally(() => {
      if (inFlightConversationDetails.get(conversationId) === request) {
        inFlightConversationDetails.delete(conversationId);
      }
    });

  requestMetadataByPromise.set(request, options.requestMetadata ?? null);
  inFlightConversationDetails.set(conversationId, request);
  return request;
}

export function getConversationDetailRequestMetadata(
  request: Promise<Conversation>
): ConversationHydrationMetadata | null {
  return requestMetadataByPromise.get(request) ?? null;
}

export function invalidateConversationDetail(conversationId: string): void {
  conversationGenerations.set(
    conversationId,
    (conversationGenerations.get(conversationId) ?? 0) + 1
  );
  inFlightConversationDetails.delete(conversationId);
}

export function invalidateAllConversationDetails(): void {
  allConversationDetailsGeneration += 1;
  conversationGenerations.clear();
  inFlightConversationDetails.clear();
}

export function resetConversationDetailResource(): void {
  invalidateAllConversationDetails();
}
