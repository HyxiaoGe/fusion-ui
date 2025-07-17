// API配置
export const API_CONFIG = {
    // 基础URL
    BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://192.168.31.98:8000',
    
    // 超时时间（毫秒）
    TIMEOUT: 30000,
    
    // 重试次数
    RETRY_COUNT: 3,
  };
  
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