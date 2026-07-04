import { FileProcessingStatus } from '@/redux/slices/fileUploadSlice';
import { ApiError, type ApiResponse } from '@/types/api';
import { API_CONFIG } from '../config';
import fetchWithAuth, { apiRequest } from './fetchWithAuth';

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
  status?: FileProcessingStatus;
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

interface DirectUploadInfo {
  file_id: string;
  upload_url: string;
  method?: string;
  headers?: Record<string, string>;
  expires_in?: number;
}

class DirectUploadUnavailableError extends Error {
  constructor() {
    super('direct upload unavailable');
    this.name = 'DirectUploadUnavailableError';
  }
}

function dedupeFilesByName(files: File[]): File[] {
  const addedFiles = new Set<string>();
  const uniqueFiles: File[] = [];
  files.forEach(file => {
    if (!addedFiles.has(file.name)) {
      uniqueFiles.push(file);
      addedFiles.add(file.name);
    }
  });
  return uniqueFiles;
}

function shouldFallbackToMultipart(error: unknown): boolean {
  return error instanceof ApiError && (
    error.code === 'DIRECT_UPLOAD_DISABLED' ||
    error.code === 'NOT_FOUND'
  );
}

async function readDirectUploadInitResponse(response: Response): Promise<ApiResponse<{ upload: DirectUploadInfo }>> {
  try {
    return (await response.json()) as ApiResponse<{ upload: DirectUploadInfo }>;
  } catch {
    if (response.status === 404) {
      throw new DirectUploadUnavailableError();
    }
    throw new ApiError('BAD_RESPONSE', '请求返回了无效 JSON 内容', '');
  }
}

async function initDirectUpload(
  provider: string,
  model: string,
  conversationId: string,
  file: File,
  signal: AbortSignal
): Promise<DirectUploadInfo> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/files/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        model,
        conversation_id: conversationId,
        filename: file.name,
        mimetype: file.type || 'application/octet-stream',
        size: file.size,
      }),
      signal,
    });

    if (response.status === 404) {
      throw new DirectUploadUnavailableError();
    }

    const body = await readDirectUploadInitResponse(response);

    if (!response.ok || body.code !== 'SUCCESS') {
      throw new ApiError(
        body.code || 'UNKNOWN',
        body.message || '请求失败',
        body.request_id || '',
      );
    }

    const data = body.data;

    if (!data?.upload?.upload_url) {
      throw new DirectUploadUnavailableError();
    }

    return data.upload;
  } catch (error) {
    if (shouldFallbackToMultipart(error)) {
      throw new DirectUploadUnavailableError();
    }
    throw error;
  }
}

async function putDirectUpload(file: File, upload: DirectUploadInfo, signal: AbortSignal): Promise<void> {
  const headers = new Headers(upload.headers || {});
  if (!headers.has('Content-Type') && file.type) {
    headers.set('Content-Type', file.type);
  }

  const response = await fetch(upload.upload_url, {
    method: upload.method || 'PUT',
    headers,
    body: file,
    signal,
  });

  if (!response.ok) {
    throw new Error(`文件直传 OSS 失败 (${response.status})`);
  }
}

async function completeDirectUpload(fileId: string, signal: AbortSignal): Promise<UploadedFileInfo> {
  const data = await apiRequest<{ file: UploadedFileInfo }>(`${API_BASE_URL}/api/files/upload/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_id: fileId,
    }),
    signal,
  });
  return data.file;
}

async function uploadFilesDirect(
  provider: string,
  model: string,
  conversationId: string,
  files: File[],
  signal: AbortSignal
): Promise<UploadedFileInfo[]> {
  const results: UploadedFileInfo[] = [];
  const createdFileIds: string[] = [];
  for (const file of dedupeFilesByName(files)) {
    try {
      const upload = await initDirectUpload(provider, model, conversationId, file, signal);
      createdFileIds.push(upload.file_id);
      await putDirectUpload(file, upload, signal);
      results.push(await completeDirectUpload(upload.file_id, signal));
    } catch (error) {
      for (const fileId of [...new Set(createdFileIds)]) {
        try {
          await deleteFile(fileId);
        } catch (cleanupError) {
          console.warn('清理失败的直传文件记录失败:', cleanupError);
        }
      }
      throw error;
    }
  }
  return results;
}

async function uploadFilesMultipart(
  provider: string,
  model: string,
  conversationId: string,
  files: File[],
  signal: AbortSignal
): Promise<UploadedFileInfo[]> {
  const formData = new FormData();
  formData.append('provider', provider);
  formData.append('model', model);
  formData.append('conversation_id', conversationId);

  dedupeFilesByName(files).forEach(file => {
    formData.append('files', file);
  });

  const data = await apiRequest<{ files: UploadedFileInfo[] }>(`${API_BASE_URL}/api/files/upload`, {
    method: 'POST',
    body: formData,
    signal
  });

  return data.files;
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
    const controller = abortController || new AbortController();
    const signal = controller.signal;

    const timeoutMs = getUploadTimeoutMs(files);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      try {
        return await uploadFilesDirect(provider, model, conversationId, files, signal);
      } catch (error) {
        if (error instanceof DirectUploadUnavailableError) {
          return await uploadFilesMultipart(provider, model, conversationId, files, signal);
        }
        throw error;
      }
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
