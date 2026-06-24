import type { NetworkDiagnosticsResponse } from '@/types/networkDiagnostics';
import { API_CONFIG } from '../config';
import { apiRequest } from './fetchWithAuth';

export function getMessageNetworkDiagnostics(
  conversationId: string,
  messageId: string,
): Promise<NetworkDiagnosticsResponse> {
  const path = `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/diagnostics`;
  return apiRequest<NetworkDiagnosticsResponse>(`${API_CONFIG.BASE_URL}${path}`);
}
