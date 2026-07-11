import { API_CONFIG } from '@/lib/config';
import type {
  AdminAgentRunRecord,
  AdminAuditEventRecord,
  AdminAuditEventsQuery,
  AdminConversationDetail,
  AdminConversationSectionQuery,
  AdminConversationSummary,
  AdminConversationsQuery,
  AdminFileRecord,
  AdminMessageRecord,
  AdminPage,
  AdminPerformanceRunRecord,
  AdminPerformanceRunsQuery,
  AdminToolCallRecord,
  AdminUserDetail,
  AdminUsersQuery,
  AdminUserSummary,
  PerformanceRunImportPayload,
} from '@/types/adminAudit';
import { apiRequest } from './fetchWithAuth';

const BASE_PATH = `${API_CONFIG.BASE_URL}/api/admin/audit`;

type QueryValue = string | number | boolean | null | undefined;

function buildQuery<T extends object>(query: T): string {
  const params = new URLSearchParams();
  (Object.entries(query) as Array<[string, QueryValue]>).forEach(([key, rawValue]) => {
    if (rawValue === undefined || rawValue === null) return;
    const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    const value = normalizeAdminQueryValue(key, trimmedValue);
    if (value === '') return;
    params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function normalizeAdminQueryValue(key: string, value: QueryValue): QueryValue {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (key.endsWith('_from')) return `${value}T00:00:00.000+08:00`;
  if (key.endsWith('_to')) return `${value}T23:59:59.999+08:00`;
  return value;
}

function encodedId(value: string): string {
  return encodeURIComponent(value);
}

function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`${BASE_PATH}${path}`, signal ? { signal } : {});
}

export function getAdminUsers(query: AdminUsersQuery = {}, signal?: AbortSignal) {
  return get<AdminPage<AdminUserSummary>>(`/users${buildQuery(query)}`, signal);
}

export function getAdminUser(userId: string, signal?: AbortSignal) {
  return get<AdminUserDetail>(`/users/${encodedId(userId)}`, signal);
}

export function getAdminConversations(query: AdminConversationsQuery = {}, signal?: AbortSignal) {
  return get<AdminPage<AdminConversationSummary>>(`/conversations${buildQuery(query)}`, signal);
}

export function getAdminConversation(conversationId: string, signal?: AbortSignal) {
  return get<AdminConversationDetail>(`/conversations/${encodedId(conversationId)}`, signal);
}

export function getAdminConversationMessages(
  conversationId: string,
  query: AdminConversationSectionQuery = {},
  signal?: AbortSignal,
) {
  return get<AdminPage<AdminMessageRecord>>(
    `/conversations/${encodedId(conversationId)}/messages${buildQuery(query)}`,
    signal,
  );
}

export function getAdminConversationToolCalls(
  conversationId: string,
  query: AdminConversationSectionQuery = {},
  signal?: AbortSignal,
) {
  return get<AdminPage<AdminToolCallRecord>>(
    `/conversations/${encodedId(conversationId)}/tool-calls${buildQuery(query)}`,
    signal,
  );
}

export function getAdminConversationAgentRuns(
  conversationId: string,
  query: AdminConversationSectionQuery = {},
  signal?: AbortSignal,
) {
  return get<AdminPage<AdminAgentRunRecord>>(
    `/conversations/${encodedId(conversationId)}/agent-runs${buildQuery(query)}`,
    signal,
  );
}

export function getAdminConversationFiles(
  conversationId: string,
  query: AdminConversationSectionQuery = {},
  signal?: AbortSignal,
) {
  return get<AdminPage<AdminFileRecord>>(
    `/conversations/${encodedId(conversationId)}/files${buildQuery(query)}`,
    signal,
  );
}

export function getAdminAuditEvents(query: AdminAuditEventsQuery = {}, signal?: AbortSignal) {
  return get<AdminPage<AdminAuditEventRecord>>(`/events${buildQuery(query)}`, signal);
}

export function getAdminPerformanceRuns(query: AdminPerformanceRunsQuery = {}, signal?: AbortSignal) {
  return get<AdminPage<AdminPerformanceRunRecord>>(`/performance-runs${buildQuery(query)}`, signal);
}

export function getAdminPerformanceRun(runId: string, signal?: AbortSignal) {
  return get<AdminPerformanceRunRecord>(`/performance-runs/${encodedId(runId)}`, signal);
}

export function importAdminPerformanceRun(payload: PerformanceRunImportPayload) {
  return apiRequest<{ run_id: string; created: boolean }>(`${BASE_PATH}/performance-runs/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
