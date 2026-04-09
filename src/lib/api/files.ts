import { FileProcessingStatus } from '@/redux/slices/fileUploadSlice';
import { API_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL;

async function readErrorDetail(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const errorData = await response.json();
    return errorData.detail || fallbackMessage;
  } catch (error) {
    console.error('无法解析错误响应:', error);
    return fallbackMessage;
  }
}

// 上传结果单项（后端返回 file_id + thumbnail_url）
export interface UploadedFileInfo {
  file_id: string;
  thumbnail_url?: string;
}

// 文件对象接口
export interface FileInfo {
  id: string;
  filename: string;
  mimetype: string;
  size: number;
  created_at: string;
  status: FileProcessingStatus;
  error_message: string;
  thumbnail_key?: string;
  width?: number;
  height?: number;
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
): Promise<UploadedFileInfo[]> {
  try {

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

    const response = await fetchWithAuth(`${API_BASE_URL}/api/files/upload`, {
      method: 'POST',
      body: formData,
      signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(await readErrorDetail(response, '文件上传失败'));
    }

    const data = await response.json();

    // 兼容新旧格式：新格式返回 files[]，旧格式返回 file_ids[]
    if (data.files && Array.isArray(data.files)) {
      return data.files as UploadedFileInfo[];
    }
    // 兼容旧格式
    return (data.file_ids as string[]).map(id => ({ file_id: id }));
  } catch (error) {
    if ((error as any).name === 'AbortError') {
      throw error;
    }

    console.error('上传文件失败:', error);

    // 如果是超时或网络错误，尝试重试
    if (retryCount > 0) {
      return uploadFiles(provider, model, conversationId, files, abortController, retryCount - 1);
    }

    throw error;
  }
}

// 获取对话的文件列表
export async function getConversationFiles(conversationId: string): Promise<FileInfo[]> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/files/conversation/${conversationId}`);
    
    if (!response.ok) {
      throw new Error(await readErrorDetail(response, '获取文件列表失败'));
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
    const response = await fetchWithAuth(`${API_BASE_URL}/api/files/${fileId}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(await readErrorDetail(response, '删除文件失败'));
    }
  } catch (error) {
    console.error("删除文件失败:", error);
    throw error;
  }
}

export async function getFileStatus(fileId: string): Promise<FileStatusResponse> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/files/${fileId}/status`);
    
    if (!response.ok) {
      const errorDetail = await readErrorDetail(response, '获取文件状态失败');
      console.error(`文件 ${fileId} 状态查询失败:`, errorDetail);
      throw new Error(errorDetail);
    }
    
    const data = await response.json();
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

// 获取文件访问 URL（presigned URL 或 API 代理路径）
export async function getFileUrl(
  fileId: string,
  variant: 'processed' | 'thumbnail' = 'thumbnail'
): Promise<string> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/files/${fileId}/url?variant=${variant}`
  );

  if (!response.ok) {
    throw new Error(await readErrorDetail(response, '获取文件 URL 失败'));
  }

  const data = await response.json();
  const url: string = data.url;
  // 后端返回的本地存储 URL 是相对路径（/api/files/...），需要拼接 API 基地址
  // 让 <img src> 直连后端，避免走 Next.js 服务端代理（容器网络不通）
  if (url.startsWith('/')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}
