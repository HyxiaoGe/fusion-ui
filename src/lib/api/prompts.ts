import { API_CONFIG } from '../config';
import { apiRequest } from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL;

export interface PromptExample {
  question: string;
  category: 'news' | 'tech' | 'general';
}

export interface PromptExamplesResponse {
  examples: PromptExample[];
  refreshed_at: string | null;
}

/**
 * 获取动态示例问题（无需鉴权）
 */
export async function fetchPromptExamples(limit: number = 8): Promise<PromptExamplesResponse> {
  return apiRequest<PromptExamplesResponse>(`${API_BASE_URL}/api/prompts/examples?limit=${limit}`);
}
