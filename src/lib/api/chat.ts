import { API_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL

// API请求类型定义
export interface ChatRequest {
  provider: string;
  model: string;
  message: string;
  conversation_id?: string | null;
  stream?: boolean;
  options?: {
    use_reasoning?: boolean;
    max_context_items?: number;
    temperature?: number;
    max_tokens?: number;
    [key: string]: any;
  } | null;
  file_ids?: string[];
}

export interface ChatResponse {
  id: string;
  model: string;
  message: {
    id: string;
    role: string;
    content: string;
    created_at: string;
  };
  conversation_id: string;
  created_at: string;
}

export interface StreamCallbacks {
  onReady: (meta: { messageId: string; conversationId: string }) => void;
  onContent: (delta: string, meta: { messageId: string; conversationId: string }) => void;
  onReasoning: (delta: string, meta: { messageId: string; conversationId: string }) => void;
  onDone: (
    messageId: string,
    conversationId: string,
    accumulatedContent: string,
    accumulatedReasoning: string
  ) => void;
  onError: (message: string) => void;
}

// 发送消息到AI
export async function sendMessage(data: ChatRequest): Promise<ChatResponse> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '请求失败');
    }

    return await response.json();
  } catch (error) {
    console.error('发送消息失败:', error);
    throw error;
  }
}

export async function sendMessageStream(
  data: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  try {

    // 确保设置了options对象
    if (!data.options) {
      data.options = {};
    }

    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        ...data,
        stream: true, // 确保设置stream为true
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '请求失败');
    }

    if (!response.body) {
      throw new Error('响应体为空');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = '';
    let accumulatedReasoning = '';
    let conversationId = data.conversation_id ?? '';
    let messageId = '';
    let terminated = false;
    let readyEmitted = false;
    let buffer = '';
    let currentEventData = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) {
          if (!currentEventData.trim()) continue;

          if (currentEventData === '[DONE]') {
            if (!terminated) {
              callbacks.onDone(messageId, conversationId, accumulatedContent, accumulatedReasoning);
              terminated = true;
            }
            return;
          }

          try {
            const parsedData = JSON.parse(currentEventData);
            messageId = parsedData.id || messageId;
            conversationId = parsedData.conversation_id || conversationId;
            if (!readyEmitted && messageId && conversationId) {
              readyEmitted = true;
              callbacks.onReady({ messageId, conversationId });
            }

            const choice = parsedData.choices?.[0];
            const delta = choice?.delta ?? {};
            const finishReason = choice?.finish_reason ?? null;

            if (delta.reasoning_content) {
              accumulatedReasoning += delta.reasoning_content;
              callbacks.onReasoning(delta.reasoning_content, {
                messageId,
                conversationId,
              });
            }

            if (delta.content) {
              accumulatedContent += delta.content;
              callbacks.onContent(delta.content, {
                messageId,
                conversationId,
              });
            }

            if (finishReason === 'error' && !terminated) {
              terminated = true;
              callbacks.onError(parsedData.error?.message ?? '未知错误');
              throw new Error(parsedData.error?.message ?? '未知错误');
            }
          } catch (error) {
            currentEventData = '';
            if (error instanceof Error && terminated) {
              throw error;
            }
            if (error instanceof SyntaxError) {
              console.error('解析SSE事件数据失败:', error, '数据:', currentEventData);
            }
            continue;
          }

          currentEventData = '';
          continue;
        }

        if (line.startsWith('data: ')) {
          currentEventData += line.substring(6);
        }
      }
    }

    if (!terminated) {
      callbacks.onError('流异常结束');
      throw new Error('流异常结束');
    }
  } catch (error) {
    console.error('流式消息请求失败:', error);
    throw error;
  }
}

// 获取所有对话（支持分页）
export async function getConversations(page: number = 1, pageSize: number = 10) {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/conversations?page=${page}&page_size=${pageSize}`);
    
    if (!response.ok) {
      throw new Error('获取对话列表失败');
    }
    
    return await response.json();
  } catch (error) {
    console.error('获取对话列表失败:', error);
    throw error;
  }
}

// 获取特定对话详情
export async function getConversation(conversationId: string) {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/conversations/${conversationId}`);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || '获取对话详情失败');
    }
    
    return await response.json();
  } catch (error) {
    console.error('获取对话详情失败:', error);
    throw error;
  }
}

export async function renameConversation(conversationId: string, title: string) {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || '重命名对话失败');
  }

  return response.json().catch(() => null);
}

// 删除对话
export async function deleteConversation(conversationId: string) {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/conversations/${conversationId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error('删除对话失败');
    }
    
    return await response.json();
  } catch (error) {
    console.error('删除对话失败:', error);
    throw error;
  }
}

/**
 * 获取对话的推荐后续问题
 * @param conversationId 对话ID
 * @param options 可选参数
 * @param forceRefresh 是否强制刷新
 * @param messageCount 当前对话消息数量，用于生成更精确的缓存键
 * @returns 包含推荐问题的响应
 */
export const fetchSuggestedQuestions = async (
  conversationId: string,
  options: Record<string, any> = {},
  _forceRefresh: boolean = false,
  _messageCount?: number
): Promise<{ questions: string[] }> => {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/suggest-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, options }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '获取推荐问题失败');
    }

    const data = await response.json();
    return { questions: data.questions || [] };
  } catch (error) {
    console.error('获取推荐问题失败:', error);
    throw error;
  }
};

export async function updateMessageDuration(conversationId: string, messageId: string, duration: number, retryCount = 3) {
  const attemptUpdate = async (attempt: number): Promise<any> => {
    try {
      const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/conversations/${conversationId}/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          duration: duration,
          type: "reasoning_content"
        }),
      });

      if (!response.ok) {
        // 如果是404错误且还有重试次数，则继续重试
        if (response.status === 404 && attempt < retryCount) {
          console.warn(`消息 ${messageId} 暂时未找到，第 ${attempt} 次重试中...`);
          // 递增延迟：1秒、2秒、3秒
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          return attemptUpdate(attempt + 1);
        }
        
        const errorData = await response.json();
        console.error('Failed to update message duration:', errorData);
        throw new Error(errorData.detail || '更新消息时长失败');
      }

      return await response.json();
    } catch (error) {
      // 网络错误等其他错误也进行重试
      if (attempt < retryCount) {
        console.warn(`更新消息时长失败，第 ${attempt} 次重试中...`, error);
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        return attemptUpdate(attempt + 1);
      }
      throw error;
    }
  };

  return attemptUpdate(1);
}
