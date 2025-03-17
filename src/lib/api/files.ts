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

// 上传文件
export async function uploadFiles(conversationId: string, files: File[]): Promise<string[]> {
  try {
    const formData = new FormData();
    formData.append('conversation_id', conversationId);
    
    files.forEach(file => {
      formData.append('files', file);
    });
    
    const response = await fetch(`${API_BASE_URL}/api/files/upload`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '文件上传失败');
    }
    
    const data = await response.json();
    return data.file_ids;
  } catch (error) {
    console.error('上传文件失败:', error);
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
    console.error('删除文件失败:', error);
    throw error;
  }
}