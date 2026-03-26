import type { Message } from '@/types/conversation';

const AUTO_FETCH_FRESHNESS_MS = 90_000;

export function shouldAutoFetchSuggestedQuestions(
  messages: Message[],
  now = Date.now(),
  freshnessMs = AUTO_FETCH_FRESHNESS_MS,
): boolean {
  const lastAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && (message.content?.length ?? 0) > 0);

  if (!lastAssistantMessage) {
    return false;
  }

  const timestamp = Number(lastAssistantMessage.timestamp || 0);
  if (!timestamp) {
    return false;
  }

  return now - timestamp <= freshnessMs;
}
