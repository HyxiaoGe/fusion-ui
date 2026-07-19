// API配置
// Plan A 同源代理：BASE_URL 留空，所有 fetch 走相对路径 /api/*，由 Next.js rewrites 服务端转发
export const API_CONFIG = {
    BASE_URL: '',
    TIMEOUT: 30000,
    RETRY_COUNT: 3,
  };

const AUTH_SERVICE_BASE_URL = process.env.NEXT_PUBLIC_AUTH_SERVICE_BASE_URL || '';

export const AUTH_SERVICE_CONFIG = {
  BASE_URL: AUTH_SERVICE_BASE_URL,
  HEADLESS_BASE_URL: process.env.NEXT_PUBLIC_AUTH_HEADLESS_SERVICE_BASE_URL || AUTH_SERVICE_BASE_URL,
  ADMIN_BASE_URL: process.env.NEXT_PUBLIC_AUTH_ADMIN_SERVICE_BASE_URL || AUTH_SERVICE_BASE_URL,
  CLIENT_ID: process.env.NEXT_PUBLIC_AUTH_SERVICE_CLIENT_ID || '',
  CALLBACK_URL: process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL || '',
};

export function getAuthCallbackUrl(): string {
  if (AUTH_SERVICE_CONFIG.CALLBACK_URL) {
    return AUTH_SERVICE_CONFIG.CALLBACK_URL;
  }

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }

  return 'http://localhost:3000/auth/callback';
}
  
  // 应用程序配置
  export const APP_CONFIG = {
    // 应用名称
    NAME: '智能助手',
    
    // 应用版本
    VERSION: '1.0.0',
    
    // 开发模式标志
    DEV_MODE: process.env.NODE_ENV === 'development',
  };
  
  // 模型默认配置
  export const MODEL_DEFAULT_CONFIG = {
    // 默认温度值
    DEFAULT_TEMPERATURE: 0.7,
    
    // 默认最大输出长度
    DEFAULT_MAX_TOKENS: 4096,
  };
