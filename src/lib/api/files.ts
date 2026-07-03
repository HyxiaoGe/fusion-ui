import { FileProcessingStatus } from '@/redux/slices/fileUploadSlice';
import { API_CONFIG } from '../config';
import { apiRequest } from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL;
const MIN_UPLOAD_TIMEOUT_MS = 120000;
const MAX_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const UPLOAD_TIMEOUT_BASE_MS = 30000;
const UPLOAD_TIMEOUT_PER_MB_MS = 30000;
const BYTES_PER_MB = 1024 * 1024;
const UPLOAD_TIMEOUT_MESSAGE = '文件上传超时，请检查网络后重试';

// 上传结果单项
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
  created_at: string | null;
  status: FileProcessingStatus;
  error_message?: string | null;
  thumbnail_url?: string | null;
  thumbnail_key?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface FileStatusResponse {
  id: string;
  status: FileProcessingStatus;
  error_message?: string;
}

export function getUploadTimeoutMs(files: File[]): number {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const totalMb = Math.max(1, Math.ceil(totalBytes / BYTES_PER_MB));
  const sizeBasedTimeout = UPLOAD_TIMEOUT_BASE_MS + totalMb * UPLOAD_TIMEOUT_PER_MB_MS;
  return Math.min(MAX_UPLOAD_TIMEOUT_MS, Math.max(MIN_UPLOAD_TIMEOUT_MS, sizeBasedTimeout));
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}

// 上传文件
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
      if (!addedFiles.has(file.name)) {
        formData.append('files', file);
        addedFiles.add(file.name);
      }
    });

    const controller = abortController || new AbortController();
    const signal = controller.signal;

    const timeoutMs = getUploadTimeoutMs(files);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const data = await apiRequest<{ files: UploadedFileInfo[] }>(`${API_BASE_URL}/api/files/upload`, {
        method: 'POST',
        body: formData,
        signal
      });

      return data.files;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(UPLOAD_TIMEOUT_MESSAGE);
    }
    console.error('上传文件失败:', error);
    if (retryCount > 0) {
      return uploadFiles(provider, model, conversationId, files, abortController, retryCount - 1);
    }
    throw error;
  }
}

// 获取对话的文件列表
export async function getConversationFiles(conversationId: string): Promise<FileInfo[]> {
  const data = await apiRequest<{ files: FileInfo[] }>(`${API_BASE_URL}/api/files/conversation/${conversationId}`);
  return data.files;
}

// 删除文件
export async function deleteFile(fileId: string): Promise<void> {
  await apiRequest(`${API_BASE_URL}/api/files/${fileId}`, { method: 'DELETE' });
}

// 获取文件处理状态
export async function getFileStatus(fileId: string): Promise<FileStatusResponse> {
  return apiRequest<FileStatusResponse>(`${API_BASE_URL}/api/files/${fileId}/status`);
}

// 获取文件访问 URL
export async function getFileUrl(
  fileId: string,
  variant: 'processed' | 'thumbnail' = 'thumbnail'
): Promise<string> {
  const data = await apiRequest<{ url: string }>(`${API_BASE_URL}/api/files/${fileId}/url?variant=${variant}`);
  const url = data.url;
  if (url.startsWith('/')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}
