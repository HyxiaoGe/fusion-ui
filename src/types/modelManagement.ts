export interface ModelManagementGovernanceStatus {
  available: boolean;
  run_id?: string | null;
  message?: string | null;
}

export interface ModelManagementCapabilities {
  admission_enabled: boolean;
  hard_delete_enabled: false;
}

export interface ModelManagementHealth {
  status: string;
  error?: string | null;
  checked_at?: number | string | null;
}

export interface ModelManagementRegisteredModel {
  model_id: string;
  name: string;
  provider: string;
  provider_display: string;
  health: ModelManagementHealth | string | null;
  selectable: boolean;
  routable: boolean;
  state: string;
  revision: number | null;
  reason?: string | null;
  updated_at?: string | null;
}

export interface ModelManagementCandidate {
  provider_key: string;
  model_id: string;
  state: string;
  reasons: string[];
  candidate_fingerprint: string;
  metadata?: Record<string, unknown> | null;
}

export type ModelAdmissionOperationStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface ModelAdmissionOperation {
  operation_id: string;
  candidate_fingerprint: string;
  model_id: string;
  status: ModelAdmissionOperationStatus;
  phase?: string | null;
  error_code?: string | null;
  safe_error?: string | { message?: string | null } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ModelManagementSnapshot {
  generated_at: string;
  governance: ModelManagementGovernanceStatus;
  capabilities: ModelManagementCapabilities;
  models: ModelManagementRegisteredModel[];
  candidates: ModelManagementCandidate[];
  operations: ModelAdmissionOperation[];
}

export interface ModelVisibilityUpdateRequest {
  model_id: string;
  selectable: boolean;
  reason: string;
  expected_revision: number | null;
}

export interface ModelCandidateAdmissionRequest {
  model_id: string;
  expected_run_id: string;
  reason: string;
}
