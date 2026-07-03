import { API_CONFIG } from '../config';
import { apiRequest } from './fetchWithAuth';

export type RuntimeConfigPayload = Record<string, unknown>;

export interface RuntimeConfigValidationResult {
  namespace: string;
  key: string;
  valid: boolean;
  issues: string[];
}

export interface RuntimeConfigEntry {
  id: string;
  namespace: string;
  key: string;
  version: string;
  is_active: boolean;
  valid: boolean;
  issues: string[];
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  payload: RuntimeConfigPayload;
}

export interface RuntimeConfigEffectiveEntry {
  namespace: string;
  key: string;
  source: 'db' | 'default' | string;
  version: string;
  valid: boolean;
  issues: string[];
  skipped_versions?: string[];
  validation_warnings?: Record<string, string[]>;
  payload: RuntimeConfigPayload;
}

export interface RuntimeConfigSnapshot {
  generated_at: string;
  effective: RuntimeConfigEffectiveEntry[];
  entries: RuntimeConfigEntry[];
}

export interface RuntimeConfigValidateRequest {
  namespace: string;
  key: string;
  payload: RuntimeConfigPayload;
}

export interface RuntimeConfigCreateRequest extends RuntimeConfigValidateRequest {
  version: string;
  description?: string | null;
}

const jsonHeaders = { 'Content-Type': 'application/json' };

export const fetchRuntimeConfigSnapshotAPI = async (): Promise<RuntimeConfigSnapshot> => {
  return apiRequest<RuntimeConfigSnapshot>(`${API_CONFIG.BASE_URL}/api/admin/runtime-config`);
};

export const validateRuntimeConfigAPI = async (
  request: RuntimeConfigValidateRequest,
): Promise<RuntimeConfigValidationResult> => {
  return apiRequest<RuntimeConfigValidationResult>(`${API_CONFIG.BASE_URL}/api/admin/runtime-config/validate`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(request),
  });
};

export const createRuntimeConfigEntryAPI = async (
  request: RuntimeConfigCreateRequest,
): Promise<RuntimeConfigEntry> => {
  return apiRequest<RuntimeConfigEntry>(`${API_CONFIG.BASE_URL}/api/admin/runtime-config`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(request),
  });
};

export const activateRuntimeConfigEntryAPI = async (entryId: string): Promise<RuntimeConfigEntry> => {
  return apiRequest<RuntimeConfigEntry>(`${API_CONFIG.BASE_URL}/api/admin/runtime-config/${entryId}/activate`, {
    method: 'POST',
  });
};

export const setRuntimeConfigEntryActiveAPI = async (
  entryId: string,
  isActive: boolean,
): Promise<RuntimeConfigEntry> => {
  return apiRequest<RuntimeConfigEntry>(`${API_CONFIG.BASE_URL}/api/admin/runtime-config/${entryId}/status`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ is_active: isActive }),
  });
};
