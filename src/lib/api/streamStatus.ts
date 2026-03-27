import { API_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL;

export interface StreamStatusResponse {
  status: 'streaming' | 'error' | 'completed';
  content_blocks?: Array<{
    type: 'reasoning' | 'answering';
    content: string;
  }>;
  model?: string;
  started_at?: number;
}

/**
 * 查询指定会话的流式状态
 * 用于页面 mount 时判断是否有未完成的流需要恢复
 */
export async function fetchStreamStatus(
  conversationId: string
): Promise<StreamStatusResponse> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/stream-status/${conversationId}`);
    if (!response.ok) {
      return { status: 'completed' };
    }
    return response.json();
  } catch {
    return { status: 'completed' };
  }
}
