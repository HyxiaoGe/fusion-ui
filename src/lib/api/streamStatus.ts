import { API_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL;

export interface StreamStatusResponse {
  status: 'streaming' | 'done' | 'error' | 'not_found';
  // 仅 status=streaming 时返回
  last_entry_id?: string;
  message_id?: string;
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
      return { status: 'not_found' };
    }
    return response.json();
  } catch {
    return { status: 'not_found' };
  }
}
