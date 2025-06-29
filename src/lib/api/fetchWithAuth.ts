async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('auth_token');

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Token 无效或过期，清理本地存储的token
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_profile');
    localStorage.removeItem('user_profile_timestamp');
    
    // 抛出特定的错误，让调用方处理UI反馈
    throw new Error('Unauthorized');
  }

  return response;
}

export default fetchWithAuth; 