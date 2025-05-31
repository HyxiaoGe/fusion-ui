import { API_CONFIG } from '../config';
import { store } from '../../redux/store'; // 导入 store
import {
  startFunctionCall,
  setFunctionCallData,
  setFunctionCallError,
  clearFunctionCallData,
  clearChatFunctionCallOutput,
  setFunctionCallStepContent,
} from '../../redux/slices/chatSlice'; // 导入 actions

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

            // 在这里添加日志，用于观察所有类型的事件数据

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
                  // 第一次收到内容时才通知开始
                  if (streamReasoning === '') {
                    onChunk(streamContent, false, conversationId || undefined, '');
                  }
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

              case "function_stream_start":
                store.dispatch(clearFunctionCallData()); 
                break;

              case "function_call_detected":
                if (parsedData.content && parsedData.content.function_type) {
                  const functionType = parsedData.content.function_type;
                  
                  // 根据函数类型进行不同处理
                  switch (functionType) {
                    case 'web_search':
                      // 如果是web_search类型，才清除之前的搜索结果
                      if (conversationId) {
                        store.dispatch(clearChatFunctionCallOutput({ chatId: conversationId }));
                      }
                      break;
                    case 'hot_topics':
                      // 如果是hot_topics类型，也清除之前的结果
                      if (conversationId) {
                        store.dispatch(clearChatFunctionCallOutput({ chatId: conversationId }));
                      }
                      break;
                    default:
                      // 对于其他类型的函数，可以添加特定处理逻辑
                      console.log(`检测到${functionType}调用`);
                      break;
                  }
                  
                  // 设置全局函数调用类型
                  if (!store.getState().chat.functionCallType) {
                    store.dispatch(startFunctionCall({ type: functionType }));
                  }
                }
                break;

              case "executing_function":
              case "user_search_start":           
              case "generating_query":
              case "performing_search":
              case "query_generated":
              case "synthesizing_answer":
                // 提取 content 并更新状态
                if (parsedData.content && typeof parsedData.content === 'string') {
                  store.dispatch(setFunctionCallStepContent({ 
                    content: parsedData.content 
                  }));
                }
                break;

              case "function_result":
                if (parsedData.content && parsedData.content.function_type && parsedData.content.result) {
                  try {
                    // 直接使用已解析的对象，而不是再次解析
                    const functionResult = parsedData.content.result; 
                    const currentFunctionType = parsedData.content.function_type;
                    let query = null;
                    // 如果是 web_search，我们期望 functionResult 中有 query 字段
                    if (currentFunctionType === 'web_search' && functionResult.query) {
                      query = functionResult.query;
                    }

                    store.dispatch(setFunctionCallData({ 
                      chatId: conversationId || '', // 确保 chatId 被传递
                      type: currentFunctionType,
                      query: query, // 传递 query
                      data: functionResult 
                    }));
                  } catch (e) {
                    console.error('Failed to parse function_executed result:', e, parsedData.content.result);
                    store.dispatch(setFunctionCallError({ 
                      chatId: conversationId || '', // 确保 chatId 被传递
                      type: parsedData.content.function_type, 
                      error: 'Failed to parse function result' 
                    }));
                  }
                } else {
                   store.dispatch(setFunctionCallError({ 
                      chatId: conversationId || '', // 确保 chatId 被传递
                      type: parsedData.content?.function_type || 'unknown', 
                      error: 'Missing data in function_executed event' 
                    }));
                }
                break;
              
              case "content_direct":
                break;
                
              case "done":
                // 流结束
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

// 获取所有对话（支持分页）
export async function getConversations(page: number = 1, pageSize: number = 10) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat/conversations?page=${page}&page_size=${pageSize}`);
    
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
    return { questions: cachedData.questions };
  }
  
  // 检查是否有正在进行的请求
  if (conversationId in ongoingQuestionsRequests) {
    return ongoingQuestionsRequests[conversationId];
  }
  
  // 创建新的请求
  try {
    
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
  } else {
    // 清除所有缓存
    Object.keys(suggestedQuestionsCache).forEach(key => {
      delete suggestedQuestionsCache[key];
    });
  }
}