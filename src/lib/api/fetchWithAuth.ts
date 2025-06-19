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
    // Token 无效或过期
    localStorage.removeItem('auth_token');
    // 可以触发一个事件或重定向到登录页面
    // window.location.href = '/login'; // 强制重定向
    console.error('认证失败，请重新登录');
    // 抛出错误，让调用方可以捕获
    throw new Error('Unauthorized');
  }

  return response;
}

export default fetchWithAuth; 