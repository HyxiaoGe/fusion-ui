import { API_CONFIG } from '@/lib/config';
import type {
  ModelCandidateAdmissionRequest,
  ModelAdmissionOperation,
  ModelManagementSnapshot,
  ModelVisibilityUpdateRequest,
} from '@/types/modelManagement';
import { apiRequest } from './fetchWithAuth';

const basePath = `${API_CONFIG.BASE_URL}/api/admin/model-management`;
const jsonHeaders = { 'Content-Type': 'application/json' };

export function fetchModelManagementSnapshotAPI(): Promise<ModelManagementSnapshot> {
  return apiRequest<ModelManagementSnapshot>(basePath);
}

export function updateModelVisibilityAPI(
  modelId: string,
  request: Omit<ModelVisibilityUpdateRequest, 'model_id'>,
): Promise<unknown> {
  return apiRequest<unknown>(`${basePath}/models/visibility`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify({ model_id: modelId, ...request }),
  });
}

export function admitModelCandidateAPI(
  candidateFingerprint: string,
  request: ModelCandidateAdmissionRequest,
): Promise<ModelAdmissionOperation> {
  return apiRequest<ModelAdmissionOperation>(`${basePath}/candidates/${encodeURIComponent(candidateFingerprint)}/admit`, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(request),
  });
}
