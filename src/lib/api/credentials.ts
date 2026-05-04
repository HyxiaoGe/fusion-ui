import { API_CONFIG } from '@/lib/config';
import { apiRequest } from '@/lib/api/fetchWithAuth';

export interface UserCredentialInfo {
  provider_id: string;
  api_key_masked: string;
  is_active: boolean;
  last_error_kind: string | null;
  last_error_message: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface CredentialTestResult {
  valid: boolean;
  reason?: string;
  message?: string;
}

const BASE = `${API_CONFIG.BASE_URL}/api/user/credentials`;

export async function listCredentials(): Promise<{ credentials: UserCredentialInfo[] }> {
  return apiRequest<{ credentials: UserCredentialInfo[] }>(BASE);
}

export async function upsertCredential(
  providerId: string,
  apiKey: string,
  isActive = true,
): Promise<UserCredentialInfo> {
  return apiRequest<UserCredentialInfo>(`${BASE}/${providerId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, is_active: isActive }),
  });
}

export async function deleteCredential(providerId: string): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(`${BASE}/${providerId}`, { method: 'DELETE' });
}

export async function testCredential(
  providerId: string,
  apiKey?: string,
): Promise<CredentialTestResult> {
  return apiRequest<CredentialTestResult>(`${BASE}/${providerId}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(apiKey ? { api_key: apiKey } : {}),
  });
}

export async function recoverProvider(providerId: string): Promise<{ recovered: boolean; provider_id: string }> {
  return apiRequest<{ recovered: boolean; provider_id: string }>(
    `${API_CONFIG.BASE_URL}/api/admin/providers/${providerId}/recover`,
    { method: 'POST' },
  );
}
