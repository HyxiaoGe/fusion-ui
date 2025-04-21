import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL

// API请求类型定义
export interface ChatRequest {
  provider: string;
  model: string;
  message: string;
  conversation_id?: string | null;
  topic_id?: string | null;
  stream?: boolean;
  options?: {
    use_reasoning?: boolean;
    use_enhancement?: boolean;
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
    const response = await fetch(`${API_BASE_URL}/api/chat/send`, {
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

export async function sendMessageStream(data: ChatRequest, onChunk: (chunk: string, done: boolean, conversationId?: string, reasoning?: string) => void): Promise<void> {
  try {

    // 确保设置了options对象
    if (!data.options) {
      data.options = {};
    }

    const response = await fetch(`${API_BASE_URL}/api/chat/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      // 解码响应块
      const chunk = decoder.decode(value, { stream: true });
      
      // 处理SSE格式的响应
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6); // 移除 "data: " 前缀
          
          try {
            const parsedData = JSON.parse(data);
            console.log("收到数据", parsedData);

            // 保存conversationId
            if (parsedData.conversation_id) {
              conversationId = parsedData.conversation_id;
            }
            
            // 处理事件类型
            switch(parsedData.type) {
              case "reasoning_start":
                console.log("【流式处理】推理开始");
                // 不在这里通知回调，等待第一个实际内容
                break;
                
              case "reasoning_content":
                if (parsedData.content) {
                  // 第一次收到内容时才通知开始
                  if (streamReasoning === '') {
                    onChunk(streamContent, false, conversationId || undefined, '');
                  }
                  streamReasoning += parsedData.content;
                  console.log("【流式处理】推理内容更新", streamReasoning.length);
                  onChunk(streamContent, false, conversationId || undefined, streamReasoning);
                }
                break;
                
              case "reasoning_end":
              case "reasoning_complete":
                // 推理完成，可能会收到完整的reasoning
                if (parsedData.reasoning) {
                  streamReasoning = parsedData.reasoning;
                }
                console.log("推理结束，完整内容：", streamReasoning);
                // 添加完成标记
                onChunk(streamContent, false, conversationId || undefined, streamReasoning + "[REASONING_COMPLETE]");
                break;
                
              case "answering_start":
                console.log("回答开始");
                break;
                
              case "answering_content":
                if (parsedData.content) {
                  streamContent += parsedData.content;
                  console.log("回答内容更新", streamContent);
                  onChunk(streamContent, false, conversationId || undefined, streamReasoning);
                }
                break;
                
              case "answering_complete":
                console.log("回答结束");
                break;
                
              case "done":
                // 流结束
                console.log("流结束，最终内容:", streamContent, "推理:", streamReasoning);
                onChunk(streamContent, true, conversationId || undefined, streamReasoning);
                return;
                
              default:
                // 兼容旧格式或者其他格式
                if (parsedData.content === "[DONE]") {
                  console.log("流结束标志");
                  onChunk(streamContent, true, conversationId || undefined, streamReasoning);
                  return;
                } else if (parsedData.content) {
                  streamContent += parsedData.content;
                  console.log("收到内容", streamContent);
                  onChunk(streamContent, false, conversationId || undefined, streamReasoning);
                }
                
                // 兼容旧版本的推理内容处理
                if (parsedData.reasoning_content) {
                  streamReasoning += parsedData.reasoning_content;
                  onChunk(streamContent, false, conversationId || undefined, streamReasoning);
                }
            }
            
          } catch (e) {
            console.error('解析响应数据失败:', e, data);
          }
        }
      }
    }
    
    // 如果没有收到[DONE]但流结束了，也标记为完成
    onChunk(streamContent, true, conversationId || undefined, streamReasoning);
  } catch (error) {
    console.error('流式消息请求失败:', error);
    throw error;
  }
}

// 获取所有对话
export async function getConversations() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations`);
    
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
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}`);
    
    if (!response.ok) {
      throw new Error('获取对话详情失败');
    }
    
    return await response.json();
  } catch (error) {
    console.error('获取对话详情失败:', error);
    throw error;
  }
}

// 添加请求缓存
const suggestedQuestionsCache: Record<string, { questions: string[], timestamp: number }> = {};
// 添加进行中请求跟踪
const ongoingQuestionsRequests: Record<string, Promise<{ questions: string[] }>> = {};

/**
 * 获取对话的推荐后续问题
 * @param conversationId 对话ID
 * @param options 可选参数
 * @param forceRefresh 是否强制刷新
 * @returns 包含推荐问题的响应
 */
export const fetchSuggestedQuestions = async (
  conversationId: string,
  options: Record<string, any> = {},
  forceRefresh: boolean = false
): Promise<{ questions: string[] }> => {
  // 检查缓存，1分钟内有效
  const CACHE_VALIDITY = 1 * 60 * 1000; // 1分钟
  const now = Date.now();
  const cachedData = suggestedQuestionsCache[conversationId];
  
  if (!forceRefresh && cachedData && (now - cachedData.timestamp) < CACHE_VALIDITY) {
    console.log(`使用缓存的推荐问题，对话ID: ${conversationId}`);
    return { questions: cachedData.questions };
  }
  
  // 检查是否有正在进行的请求
  if (conversationId in ongoingQuestionsRequests) {
    console.log(`等待进行中的推荐问题请求，对话ID: ${conversationId}`);
    return ongoingQuestionsRequests[conversationId];
  }
  
  // 创建新的请求
  try {
    console.log(`开始获取推荐问题，对话ID: ${conversationId}`);
    
    // 包装请求为Promise并记录
    ongoingQuestionsRequests[conversationId] = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/chat/suggest-questions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            options: options
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            `获取推荐问题失败: ${response.status} ${
              errorData?.message || response.statusText
            }`
          );
        }
        
        const data = await response.json();
        const result = { questions: data.questions || [] };
        
        // 更新缓存
        suggestedQuestionsCache[conversationId] = {
          questions: result.questions,
          timestamp: Date.now()
        };
        
        return result;
      } finally {
        // 请求完成后清除记录
        delete ongoingQuestionsRequests[conversationId];
      }
    })();
    
    return await ongoingQuestionsRequests[conversationId];
  } catch (error) {
    console.error('获取推荐问题出错:', error);
    delete ongoingQuestionsRequests[conversationId];
    return { questions: [] };
  }
};

// 删除对话
export async function deleteConversation(conversationId: string) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}`, {
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
 * 清除指定对话的推荐问题缓存
 * @param conversationId 对话ID，如不指定则清除所有缓存
 */
export function clearSuggestedQuestionsCache(conversationId?: string): void {
  if (conversationId) {
    delete suggestedQuestionsCache[conversationId];
    console.log(`已清除对话${conversationId}的推荐问题缓存`);
  } else {
    // 清除所有缓存
    Object.keys(suggestedQuestionsCache).forEach(key => {
      delete suggestedQuestionsCache[key];
    });
    console.log('已清除所有推荐问题缓存');
  }
}