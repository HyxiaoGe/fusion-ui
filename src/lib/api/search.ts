import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL;

export interface SearchResult {
  results: Array<{
    id: string;
    title?: string;
    content: string;
    relevance: number;
    timestamp?: number;
    conversationId?: string;
  }>;
}

export interface ContextResult {
  context: Array<{
    id: string;
    content: string;
    source: string;
    relevance: number;
  }>;
  summary?: string;
}

/**
 * 语义搜索对话
 * @param query 搜索关键词
 * @param limit 结果数量限制，默认5
 */
export async function searchConversations(query: string, limit: number = 5): Promise<SearchResult> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/search/conversations?query=${encodeURIComponent(query)}&limit=${limit}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '搜索对话失败');
    }

    return await response.json();
  } catch (error) {
    console.error('搜索对话失败:', error);
    throw error;
  }
}

/**
 * 语义搜索消息
 * @param query 搜索关键词
 * @param conversationId 可选，限制在特定对话中搜索
 * @param limit 结果数量限制，默认5
 */
export async function searchMessages(
  query: string,
  conversationId?: string,
  limit: number = 5
): Promise<SearchResult> {
  try {
    let url = `${API_BASE_URL}/api/search/messages?query=${encodeURIComponent(query)}&limit=${limit}`;
    if (conversationId) {
      url += `&conversation_id=${encodeURIComponent(conversationId)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '搜索消息失败');
    }

    return await response.json();
  } catch (error) {
    console.error('搜索消息失败:', error);
    throw error;
  }
}

/**
 * 获取增强上下文
 * @param query 用户查询
 * @param conversationId 可选，当前对话ID
 */
export async function getEnhancedContext(query: string, conversationId?: string): Promise<ContextResult> {
  try {
    let url = `${API_BASE_URL}/api/search/context?query=${encodeURIComponent(query)}`;
    if (conversationId) {
      url += `&conversation_id=${encodeURIComponent(conversationId)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '获取增强上下文失败');
    }

    return await response.json();
  } catch (error) {
    console.error('获取增强上下文失败:', error);
    throw error;
  }
}