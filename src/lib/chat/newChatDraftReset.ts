const NEW_CHAT_DRAFT_RESET_EVENT = 'fusion:new-chat-draft-reset';

export function requestNewChatDraftReset(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(NEW_CHAT_DRAFT_RESET_EVENT));
}

export function subscribeNewChatDraftReset(handler: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(NEW_CHAT_DRAFT_RESET_EVENT, handler);
  return () => window.removeEventListener(NEW_CHAT_DRAFT_RESET_EVENT, handler);
}
