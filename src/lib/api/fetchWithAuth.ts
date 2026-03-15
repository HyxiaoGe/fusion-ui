import { clearAuthStorage, getStoredAccessToken } from '@/lib/auth/authService';

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

  if (response.status === 401) {
    clearAuthStorage();
    
    // 抛出特定的错误，让调用方处理UI反馈
    throw new Error('Unauthorized');
  }

  return response;
}

export default fetchWithAuth; 
