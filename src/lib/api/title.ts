import { API_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL;

/**
 * 通过AI生成聊天标题
 * @param conversationId 对话ID
 * @param message 单条消息用于生成标题
 * @param options 额外选项
 */
export async function generateChatTitle(conversationId?: string, message?: string, options?: any) {
  try {
    const requestBody = {
      conversation_id: conversationId,
      message: message,
      options: options
    };

    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/generate-title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '请求失败');
    }

    const data = await response.json();
    return data.title;
  } catch (error) {
    console.error('生成标题失败:', error);
    throw error;
  }
}
