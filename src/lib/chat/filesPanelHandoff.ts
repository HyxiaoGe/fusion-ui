const STORAGE_KEY_PREFIX = 'fusion:open-files-panel:';

function getStorageKey(conversationId: string): string {
  return `${STORAGE_KEY_PREFIX}${conversationId}`;
}

export function markConversationFilesPanelOpen(conversationId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(getStorageKey(conversationId), '1');
  } catch {
    // sessionStorage 不可用时退化为普通跳转，不阻塞发送。
  }
}

export function consumeConversationFilesPanelOpen(conversationId: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const storageKey = getStorageKey(conversationId);
    const shouldOpen = window.sessionStorage.getItem(storageKey) === '1';
    if (shouldOpen) {
      window.sessionStorage.removeItem(storageKey);
    }
    return shouldOpen;
  } catch {
    return false;
  }
}
