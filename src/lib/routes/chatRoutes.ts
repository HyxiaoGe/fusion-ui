export const CHAT_NEW_PATH = '/chat/new';

export function buildChatNewPath(modelId?: string | null): string {
  const trimmed = modelId?.trim();
  if (!trimmed) {
    return CHAT_NEW_PATH;
  }

  const params = new URLSearchParams();
  params.set('model', trimmed);
  return `${CHAT_NEW_PATH}?${params.toString()}`;
}

export function buildChatConversationPath(conversationId: string): string {
  return `/chat/${encodeURIComponent(conversationId)}`;
}

export function isChatNewPath(pathname: string | null | undefined): boolean {
  return pathname === CHAT_NEW_PATH || pathname === '/';
}

export function getRouteConversationId(pathname: string | null | undefined): string | null {
  if (!pathname?.startsWith('/chat/')) {
    return null;
  }

  const rawId = pathname.slice('/chat/'.length);
  if (!rawId || rawId === 'new') {
    return null;
  }

  return decodeURIComponent(rawId);
}

export function normalizeLegacyNewChatPath(searchParams: URLSearchParams): string {
  return buildChatNewPath(searchParams.get('model'));
}
