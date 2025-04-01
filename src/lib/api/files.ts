import { FileProcessingStatus } from '@/redux/slices/fileUploadSlice';
import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL;

// 文件对象接口
export interface FileInfo {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  created_at: string;
  status: FileProcessingStatus;
  error_message: string;
}

export interface FileStatusResponse {
  id: string;
  status: FileProcessingStatus;
  error_message?: string;
}

// 上传文件 - 添加错误处理和重试逻辑
export async function uploadFiles(
  provider: string,
  model: string, 
  conversationId: string, 
  files: File[], 
  abortController?: AbortController,
  retryCount = 0
): Promise<string[]> {
  try {
    console.log(`开始上传文件 ${files.map(f => f.name).join(', ')} 到对话 ${conversationId}`);

    const formData = new FormData();
    formData.append('provider', provider);
    formData.append('model', model); 
    formData.append('conversation_id', conversationId);
    
    const addedFiles = new Set();
    files.forEach(file => {
      // 避免重复添加同名文件
      if (!addedFiles.has(file.name)) {
        formData.append('files', file);
        addedFiles.add(file.name);
      }
    });
    
    // 使用传入的中止控制器或创建新的
    const controller = abortController || new AbortController();
    const signal = controller.signal;
    
    // 设置超时
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
    
    const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
      method: 'POST',
      body: formData,
      signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // 尝试获取详细错误信息
      let errorDetail = '文件上传失败';
      try {
        const errorData = await response.json();
        errorDetail = errorData.detail || errorDetail;
        // 记录详细错误信息
        console.error('服务器返回错误:', errorData);
      } catch (e) {
        console.error('无法解析错误响应:', e);
      }
      
      throw new Error(errorDetail);
    }
    
    const data = await response.json();
    console.log('上传成功，获取文件ID:', data.file_ids);
    return data.file_ids;
  } catch (error) {
    if ((error as any).name === 'AbortError') {
      console.log('上传已被用户取消');
      throw error;
    }
    
    console.error('上传文件失败:', error);
    
    // 如果是超时或网络错误，尝试重试
    if (retryCount > 0) {
      console.log(`上传失败，重试(${retryCount})...`);
      return uploadFiles(provider, model, conversationId, files, abortController, retryCount - 1);
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

export async function getFileStatus(fileId: string): Promise<FileStatusResponse> {
  try {
    console.log(`正在查询文件状态: ${fileId}`);
    const response = await fetch(`${API_BASE_URL}/api/files/${fileId}/status`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error(`文件 ${fileId} 状态查询失败:`, errorData);
      throw new Error(errorData.detail || '获取文件状态失败');
    }
    
    const data = await response.json();
    console.log(`文件 ${fileId} 状态查询成功:`, data.status);
    return {
      id: data.id,
      status: data.status as FileProcessingStatus,
      error_message: data.error_message
    };
  } catch (error) {
    console.error(`文件 ${fileId} 状态查询出错:`, error);
    throw error;
  }
}