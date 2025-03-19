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

export async function sendMessageStream(data: ChatRequest, onChunk: (chunk: string, done: boolean, conversationId?: string) => void): Promise<void> {
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

            // 保存conversionId
            if (parsedData.conversation_id) {
              conversationId = parsedData.conversation_id;
            }
            
            if (parsedData.content === "[DONE]") {
              // 流结束
              onChunk(streamContent, true, conversationId || undefined);
              return;
            } else {
              // 添加新内容并更新回调
              streamContent += parsedData.content;
              onChunk(streamContent, false, conversationId || undefined);
            }
          } catch (e) {
            console.error('解析响应数据失败:', e, data);
          }
        }
      }
    }
    
    // 如果没有收到[DONE]但流结束了，也标记为完成
    onChunk(streamContent, true, conversationId || undefined);
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