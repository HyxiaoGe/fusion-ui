import { API_CONFIG } from '../config';
import { apiRequest } from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL;

/**
 * 通过AI生成聊天标题
 */
export async function generateChatTitle(conversationId?: string, message?: string, options?: any) {
  const data = await apiRequest<{ title: string; conversation_id: string }>(
    `${API_BASE_URL}/api/chat/generate-title`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        message: message,
        options: options,
      }),
    },
  );
  return data.title;
}
