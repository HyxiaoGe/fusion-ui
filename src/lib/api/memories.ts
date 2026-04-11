import { API_CONFIG } from '@/lib/config';
import { apiRequest } from '@/lib/api/fetchWithAuth';
import type { Memory } from '@/types/memory';

const BASE = `${API_CONFIG.BASE_URL}/api/memories`;

/** 获取所有记忆条目 */
export async function getMemories(): Promise<Memory[]> {
  return apiRequest<Memory[]>(BASE);
}

/** 创建记忆条目（手动） */
export async function createMemory(content: string): Promise<Memory> {
  return apiRequest<Memory>(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

/** 更新记忆内容 */
export async function updateMemory(id: string, content: string): Promise<Memory> {
  return apiRequest<Memory>(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

/** 切换记忆启用/禁用状态 */
export async function toggleMemory(id: string, is_active: boolean): Promise<{ id: string; is_active: boolean }> {
  return apiRequest<{ id: string; is_active: boolean }>(`${BASE}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active }),
  });
}

/** 删除记忆条目 */
export async function deleteMemory(id: string): Promise<void> {
  await apiRequest<void>(`${BASE}/${id}`, { method: 'DELETE' });
}
