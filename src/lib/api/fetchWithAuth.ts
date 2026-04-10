import { clearAuthStorage, getStoredAccessToken, refreshAccessToken } from '@/lib/auth/authService';
import { ApiError } from '@/types/api';
import type { ApiResponse } from '@/types/api';

// 防止多个并发请求同时触发 refresh
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken()
      .then((tokens) => !!tokens)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredAccessToken();

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // 401 时尝试用 refresh token 换新 access token，成功则重试原请求
  if (response.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      const newToken = getStoredAccessToken();
      const retryHeaders = new Headers(options.headers || {});
      if (newToken) {
        retryHeaders.set('Authorization', `Bearer ${newToken}`);
      }
      return fetch(url, { ...options, headers: retryHeaders });
    }

    // refresh 也失败，清空登录状态
    clearAuthStorage();
    throw new Error('Unauthorized');
  }

  return response;
}

/**
 * 统一 API 请求：自动拆包 {code, data, message, request_id}，
 * 成功返回 data，失败抛出 ApiError。
 *
 * 注意：仅用于 JSON REST 接口，SSE 和文件下载仍用 fetchWithAuth。
 */
export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchWithAuth(url, options);
  const body: ApiResponse<T> = await response.json();

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
