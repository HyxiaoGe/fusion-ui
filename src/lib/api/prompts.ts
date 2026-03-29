import { API_CONFIG } from '../config';

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
  const response = await fetch(`${API_BASE_URL}/api/prompts/examples?limit=${limit}`);
  if (!response.ok) {
    throw new Error('获取示例问题失败');
  }
  return response.json();
}
