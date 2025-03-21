import { API_CONFIG } from '../config';

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
    let isReasoningPhase = false;
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
            
            // 处理推理开始标记
            if (parsedData.reasoning_start) {
              isReasoningPhase = true;
              console.log("推理开始", parsedData.reasoning_start);
              continue;
            }
            
            // 处理推理内容
            if (parsedData.reasoning_content) {
              streamReasoning += parsedData.reasoning_content;
              console.log("推理内容", streamReasoning);
              onChunk(streamContent, false, conversationId || undefined, streamReasoning);
              continue;
            }
            
            // 处理推理结束
            if (parsedData.reasoning_end) {
              isReasoningPhase = false;
              streamReasoning = parsedData.reasoning || streamReasoning;
              console.log("推理结束，完整内容：", streamReasoning);
              onChunk(streamContent, false, conversationId || undefined, streamReasoning);
              continue;
            }
            
            if (parsedData.content === "[DONE]") {
              // 流结束
              console.log("流结束，最终内容:", streamContent, "最终推理:", streamReasoning);
              onChunk(streamContent, true, conversationId || undefined, streamReasoning);
              return;
            } else {
              // 添加新内容并更新回调
              streamContent += parsedData.content;
              console.log("收到新内容", streamContent);
              onChunk(streamContent, false, conversationId || undefined, streamReasoning);
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