import { API_CONFIG } from '@/lib/config';
import type { TrajectoryRunListResponse, TrajectorySnapshot } from '@/types/trajectory';

import { apiRequest } from './fetchWithAuth';

const BASE_PATH = `${API_CONFIG.BASE_URL}/api/conversations`;

/** 读取当前普通用户可访问的、有界 run 尝试列表。 */
export function getTrajectoryRuns(
  conversationId: string,
  signal?: AbortSignal,
): Promise<TrajectoryRunListResponse> {
  return apiRequest<TrajectoryRunListResponse>(
    `${BASE_PATH}/${encodeURIComponent(conversationId)}/runs`,
    signal ? { signal } : {},
  );
}

/** 读取当前普通用户可访问的单个 run 脱敏轨迹快照。 */
export function getTrajectorySnapshot(
  conversationId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<TrajectorySnapshot> {
  return apiRequest<TrajectorySnapshot>(
    `${BASE_PATH}/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/trajectory`,
    signal ? { signal } : {},
  );
}
