export interface ModelCapability {
  vision?: boolean; // 视觉能力
  imageGen?: boolean; // 图像生成
  deepThinking?: boolean; // 深度思考
  fileSupport?: boolean; // 文件处理
}

export interface ModelInfo {
  id: string; // 模型ID
  name: string; // 显示名称
  provider: string; // 提供商ID
  icon?: string; // 模型图标（可选）
  maxTokens: number; // 最大token数
  temperature: number; // 默认温度
  capabilities: ModelCapability; // 能力标识
  enabled: boolean; // 是否启用
  experimental?: boolean; // 是否实验性功能
  contextWindow?: string; // 上下文窗口大小（如"128K"）
}

export interface ProviderInfo {
  id: string; // 提供商ID
  name: string; // 显示名称
  order: number; // 排序顺序
}

// 提供商信息(id 对应 svg图标名称)
export const providers: ProviderInfo[] = [
  { id: "openai", name: "OpenAI", order: 1 },
  { id: "anthropic", name: "Anthropic", order: 2 },
  { id: "gemini", name: "Gemini", order: 3 },
  { id: "qwen", name: "通义千问", order: 4 },
  { id: "deepseek", name: "DeepSeek", order: 5 },
];

// 模型信息
export const models: ModelInfo[] = [
  // OpenAI 模型
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "openai",
    maxTokens: 16384,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: true,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: true,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
  },
  {
    id: "gpt-3.5-turbo",
    name: "GPT-3.5 Turbo",
    provider: "openai",
    maxTokens: 16384,
    temperature: 0.7,
    contextWindow: "16K",
    capabilities: {
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
  },

  // Anthropic 模型
  {
    id: "claude-3-opus",
    name: "Claude 3 Opus",
    provider: "anthropic",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: true,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: true,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
  },

  //  Google 模型
  {
    id: "gemini-2.0-pro-exp-02-05",
    name: "Gemini 2.0 Pro Experimental",
    provider: "gemini",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: true,
      fileSupport: true,
    },
    enabled: true,
    experimental: true,
  },

  // 通义千问 模型
  {
    id: "qwen-max-latest",
    name: "Qwen Max Latest",
    provider: "qwen",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "32K",
    capabilities: {
      vision: true,
      deepThinking: false,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
  },
  {
    id: "qwq-32b",
    name: "QwQ 32B",
    provider: "qwen",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: false,
      deepThinking: true,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
  },
  {
    id: "qwq-plus",
    name: "QwQ Plus",
    provider: "qwen",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: false,
      deepThinking: true,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
  },
  {
    id: "qwq-plus-2025-03-05",
    name: "QwQ Plus 2025-03-05",
    provider: "qwen",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: false,
      deepThinking: true,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
  },
  {
    id: "qwen2.5-vl-72b-instruct",
    name: "QwQ 2.5 VL 72B Instruct",
    provider: "qwen",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: true,
      deepThinking: false,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
  },

  // DeepSeek 模型
  {
    id: "deepseek-reasoner",
    name: "DeepSeek-R1",
    provider: "deepseek",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: true,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek-V3",
    provider: "deepseek",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: true,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
  },
];
