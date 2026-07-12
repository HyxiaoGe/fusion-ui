export type AdminAuditTab = 'users' | 'conversations' | 'performance' | 'events';

export interface AdminAuditRoute {
  tab: AdminAuditTab;
  userId?: string;
  conversationId?: string;
  runId?: string;
}

const ADMIN_TABS = new Set<AdminAuditTab>(['users', 'conversations', 'performance', 'events']);
const MAX_ROUTE_ID_LENGTH = 200;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

export function normalizeAdminAuditRouteId(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_ROUTE_ID_LENGTH || CONTROL_CHARACTER_PATTERN.test(normalized)) {
    return undefined;
  }
  return normalized;
}

export function parseAdminAuditRoute(searchParams: URLSearchParams): AdminAuditRoute {
  const rawTab = searchParams.get('tab');
  const tab: AdminAuditTab = rawTab && ADMIN_TABS.has(rawTab as AdminAuditTab)
    ? rawTab as AdminAuditTab
    : 'users';

  if (tab === 'users') {
    const userId = rawTab === 'users' ? normalizeAdminAuditRouteId(searchParams.get('user_id')) : undefined;
    return userId ? { tab, userId } : { tab };
  }
  if (tab === 'conversations') {
    const userId = normalizeAdminAuditRouteId(searchParams.get('user_id'));
    const conversationId = normalizeAdminAuditRouteId(searchParams.get('conversation_id'));
    return {
      tab,
      ...(userId ? { userId } : {}),
      ...(conversationId ? { conversationId } : {}),
    };
  }
  if (tab === 'performance') {
    const runId = normalizeAdminAuditRouteId(searchParams.get('run_id'));
    return runId ? { tab, runId } : { tab };
  }
  return { tab };
}

export function buildAdminAuditUrl(route: AdminAuditRoute): string {
  const params = new URLSearchParams();
  const userId = normalizeAdminAuditRouteId(route.userId);
  const conversationId = normalizeAdminAuditRouteId(route.conversationId);
  const runId = normalizeAdminAuditRouteId(route.runId);
  if (route.tab !== 'users' || userId) params.set('tab', route.tab);
  if (route.tab === 'users' && userId) params.set('user_id', userId);
  if (route.tab === 'conversations') {
    if (userId) params.set('user_id', userId);
    if (conversationId) params.set('conversation_id', conversationId);
  }
  if (route.tab === 'performance' && runId) params.set('run_id', runId);
  const query = params.toString();
  return query ? `/admin?${query}` : '/admin';
}
