import {
  clearAuthStorage,
  forceRefreshAccessToken,
  getStoredAccessToken,
  getValidAccessToken,
} from '@/lib/auth/authService';
import { ApiError } from '@/types/api';
import type { ApiResponse } from '@/types/api';

// 取一个可用的 access token：优先走 SDK 的按需刷新（过期临界会自动续期）。
// 续期途中遇到瞬时网络错误时，退回到本地已存 token，把真正的过期交给 401 分支处理——
// 这里绝不清会话，避免一次网络抖动把用户登出。
// 返回 null = SDK 已确定性失败并清掉自身 token；此时同步清掉 fusion 侧 profile 等键，
// 与 401 分支对称，避免请求落到公共接口（200，不触发 401 清理）时残留 user_profile。
async function resolveToken(): Promise<string | null> {
  try {
    const token = await getValidAccessToken();
    if (token === null) {
      clearAuthStorage();
    }
    return token;
  } catch {
    return getStoredAccessToken();
  }
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await resolveToken();

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 401 时强制刷新（SDK 内部会合并并发刷新），成功则用新 token 重试原请求
  if (response.status === 401) {
    let newToken: string | null;
    try {
      newToken = await forceRefreshAccessToken();
    } catch {
      // 刷新途中的瞬时网络错误：保留会话，仅把本次请求当作鉴权失败抛出
      throw new Error('Unauthorized');
    }

    if (newToken) {
      const retryHeaders = new Headers(options.headers || {});
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      return fetch(url, { ...options, headers: retryHeaders });
    }

    // 刷新被服务端确定性拒绝：SDK 已清掉自身 token，这里再清掉 fusion 侧 profile 等键
    clearAuthStorage();
    throw new Error('Unauthorized');
  }

  return response;
}

async function readApiResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    const contentType = response.headers.get('content-type') || '';
    const message = contentType.includes('json')
      ? '请求返回了无效 JSON 内容'
      : '请求返回了非 JSON 内容';
    throw new ApiError('BAD_RESPONSE', message, '');
  }
}

/**
 * 统一 API 请求：自动拆包 {code, data, message, request_id}，
 * 成功返回 data，失败抛出 ApiError。
 *
 * 注意：仅用于 JSON REST 接口，SSE 和文件下载仍用 fetchWithAuth。
 */
export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(url, options);
  const body = await readApiResponse<T>(response);

  if (!response.ok || body.code !== 'SUCCESS') {
    throw new ApiError(
      body.code || 'UNKNOWN',
      body.message || '请求失败',
      body.request_id || '',
    );
  }

  return body.data as T;
}

export default fetchWithAuth;
