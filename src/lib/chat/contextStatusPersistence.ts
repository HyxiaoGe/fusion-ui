export const CONTEXT_STATUS_DEFAULT_OPEN_STORAGE_KEY = 'fusion.context-status.default-open.v2';
export const CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY = 'fusion.context-status.pending-first-turn.v2';
export const CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY = 'fusion.context-status.suppressed-first-turn.v2';
export const CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY = 'fusion.context-status.interacted-first-turn.v2';

function readConversationIds(storageKey: string): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeConversationIds(storageKey: string, ids: Set<string>): void {
  try {
    if (ids.size === 0) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify([...ids]));
  } catch {
    // sessionStorage 不可用时仅失去首轮跨路由/刷新恢复，不影响当前页面交互。
  }
}

function addConversationId(storageKey: string, conversationId: string): void {
  const ids = readConversationIds(storageKey);
  ids.add(conversationId);
  writeConversationIds(storageKey, ids);
}

function hasConversationId(storageKey: string, conversationId: string): boolean {
  return readConversationIds(storageKey).has(conversationId);
}

function removeConversationId(storageKey: string, conversationId: string): void {
  const ids = readConversationIds(storageKey);
  if (!ids.delete(conversationId)) return;
  writeConversationIds(storageKey, ids);
}

function moveConversationId(storageKey: string, fromId: string, toId: string): void {
  if (fromId === toId) return;
  const ids = readConversationIds(storageKey);
  if (!ids.delete(fromId)) return;
  ids.add(toId);
  writeConversationIds(storageKey, ids);
}

export function markPendingFirstTurn(conversationId: string): void {
  addConversationId(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function hasPendingFirstTurn(conversationId: string): boolean {
  return hasConversationId(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function clearPendingFirstTurn(conversationId: string): void {
  removeConversationId(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function movePendingFirstTurn(fromId: string, toId: string): void {
  moveConversationId(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY, fromId, toId);
}

export function markSuppressedFirstTurn(conversationId: string): void {
  addConversationId(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function hasSuppressedFirstTurn(conversationId: string): boolean {
  return hasConversationId(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function clearSuppressedFirstTurn(conversationId: string): void {
  removeConversationId(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function moveSuppressedFirstTurn(fromId: string, toId: string): void {
  moveConversationId(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY, fromId, toId);
}

export function markInteractedFirstTurn(conversationId: string): void {
  addConversationId(CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function hasInteractedFirstTurn(conversationId: string): boolean {
  return hasConversationId(CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function clearInteractedFirstTurn(conversationId: string): void {
  removeConversationId(CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY, conversationId);
}

export function moveInteractedFirstTurn(fromId: string, toId: string): void {
  moveConversationId(CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY, fromId, toId);
}

export function moveFirstTurnContextState(fromId: string, toId: string): void {
  movePendingFirstTurn(fromId, toId);
  moveSuppressedFirstTurn(fromId, toId);
  moveInteractedFirstTurn(fromId, toId);
}

export function clearFirstTurnContextState(conversationId: string): void {
  clearPendingFirstTurn(conversationId);
  clearSuppressedFirstTurn(conversationId);
  clearInteractedFirstTurn(conversationId);
}
