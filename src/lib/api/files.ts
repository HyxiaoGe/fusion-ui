import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL;

// 文件对象接口
export interface FileInfo {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  created_at: string;
}

// 上传文件 - 添加错误处理和重试逻辑
export async function uploadFiles(
  conversationId: string, 
  files: File[], 
  abortController?: AbortController,
  retryCount = 3
): Promise<string[]> {
  try {
    const formData = new FormData();
    formData.append('conversation_id', conversationId);
    
    files.forEach(file => {
      formData.append('files', file);
    });
    
    // 使用传入的中止控制器或创建新的
    const controller = abortController || new AbortController();
    const signal = controller.signal;
    
    // 设置超时
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
    
    const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
      method: 'POST',
      body: formData,
      signal // 使用中止信号
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // 尝试获取详细错误信息
      let errorDetail = '文件上传失败';
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || errorDetail;
      } catch (e) {
        // 无法解析错误详情，使用默认错误消息
      }
      
      throw new Error(errorDetail);
    }
    
    const data = await response.json();
    return data.file_ids;
  } catch (error) {
    // 检查是否是中止错误
    if ((error as any).name === 'AbortError') {
      console.log('上传已被用户取消');
      throw error; // 重新抛出中止错误，让调用者知道
    }
    
    console.error('上传文件失败:', error);
    
    // 如果是超时或网络错误，尝试重试
    if (retryCount > 0 && (error instanceof TypeError || (error as any).name !== 'AbortError')) {
      console.log(`上传失败，进行第${4 - retryCount}次重试...`);
      return uploadFiles(conversationId, files, abortController, retryCount - 1);
    }
    
    throw error;
  }
}

// 获取对话的文件列表
export async function getConversationFiles(conversationId: string): Promise<FileInfo[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/conversation/${conversationId}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '获取文件列表失败');
    }
    
    const data = await response.json();
    return data.files;
  } catch (error) {
    console.error('获取文件列表失败:', error);
    throw error;
  }
}

// 删除文件
export async function deleteFile(fileId: string): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/${fileId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '删除文件失败');
    }
  } catch (error) {
    console.error("删除文件失败:", error);
    throw error;
  }
}
