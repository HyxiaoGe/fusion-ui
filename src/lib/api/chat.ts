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
  onChunk: (chunk: string, done: boolean, conversationId?: string, reasoning?: string) => void,
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
    let streamContent = '';
    let streamReasoning = '';
    let conversationId = data.conversation_id;
    let buffer = ''; // 用于累积数据
    let currentEventData = ''; // 用于累积当前SSE事件的data部分

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      // 解码响应块
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      // 处理SSE格式的响应
      const lines = buffer.split('\n');
      // 保留最后一行，因为它可能是不完整的
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6); // 移除 "data: " 前缀
          currentEventData += data;
        } else if (line.trim() === '' && currentEventData.trim() !== '') {
          // 空行表示SSE事件结束，现在尝试解析累积的数据
          try {
            const parsedData = JSON.parse(currentEventData);

            // 保存conversationId
            if (parsedData.conversation_id) {
              conversationId = parsedData.conversation_id;
            }
            
            // 处理事件类型
            switch(parsedData.type) {
              case "reasoning_start":
                break;
                
              case "reasoning_content":
                if (parsedData.content) {
                  streamReasoning += parsedData.content;
                  onChunk(streamContent, false, conversationId || undefined, streamReasoning);
                }
                break;
                
              case "reasoning_end":
              case "reasoning_complete":
                // 推理完成，可能会收到完整的reasoning
                if (parsedData.reasoning) {
                  streamReasoning = parsedData.reasoning;
                }
                // 添加完成标记
                onChunk(streamContent, false, conversationId || undefined, streamReasoning + "[REASONING_COMPLETE]");
                break;
                
              case "answering_start":
                break;
                
              case "answering_content":
                if (parsedData.content) {
                  streamContent += parsedData.content;
                  onChunk(streamContent, false, conversationId || undefined, streamReasoning);
                }
                break;
                
              case "answering_complete":
                break;

              case "function_call_detected":
                // 在聊天精简模式下忽略工具调用事件，但继续保持主回答流正常工作
                break;

              case "executing_function":
                // 在聊天精简模式下忽略工具执行步骤事件
                break;

              case "function_result":
                // 在聊天精简模式下忽略工具结果事件
                break;
              
              case "content_direct":
                break;
                
              case "done":
                // 流结束
                console.log('[sendMessageStream] Received "done" event, calling onChunk with done=true');
                onChunk(streamContent, true, conversationId || undefined, streamReasoning);
                return;
                
              default:
                // 兼容旧格式或者其他格式
                if (parsedData.content === "[DONE]") {
                  onChunk(streamContent, true, conversationId || undefined, streamReasoning);
                  return;
                } else if (parsedData.content) {
                  streamContent += parsedData.content;
                  onChunk(streamContent, false, conversationId || undefined, streamReasoning);
                }
                
                // 兼容旧版本的推理内容处理
                if (parsedData.reasoning_content) {
                  streamReasoning += parsedData.reasoning_content;
                  onChunk(streamContent, false, conversationId || undefined, streamReasoning);
                }
            }
            
            // 重置当前事件数据，准备处理下一个事件
            currentEventData = '';
            
          } catch (e) {
            console.error('解析SSE事件数据失败:', e, '数据:', currentEventData);
            // 重置缓冲区，避免影响后续数据
            currentEventData = '';
          }
        }
      }
    }
    
    // 处理流结束时缓冲区中可能剩余的数据
    if (currentEventData.trim() !== '') {
      try {
        console.log("处理流结束时的剩余数据:", currentEventData);
        const parsedData = JSON.parse(currentEventData);
        if (parsedData.type === "done" || parsedData.content === "[DONE]") {
          onChunk(streamContent, true, conversationId || undefined, streamReasoning);
          return;
        }
      } catch (e) {
        console.warn('处理剩余数据时解析失败:', e, currentEventData);
      }
    }
    
    // 如果没有收到[DONE]但流结束了，也标记为完成
    console.log('[sendMessageStream] Stream ended without explicit done event, calling onChunk with done=true');
    onChunk(streamContent, true, conversationId || undefined, streamReasoning);
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
  forceRefresh: boolean = false,
  messageCount?: number
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
