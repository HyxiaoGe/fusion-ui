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
  enabled: boolean; // 模型是否可用 - true: 模型已接入且可用; false: 模型未接入或暂时不可用
  experimental?: boolean; // 是否实验性功能
  contextWindow?: string; // 上下文窗口大小（如"128K"）
  description?: string; // 模型简要描述，用于悬停提示
}

export interface ProviderInfo {
  id: string; // 提供商ID
  name: string; // 显示名称
  order: number; // 排序顺序
}

// 提供商信息(id 对应 svg图标名称)
export const providers: ProviderInfo[] = [
  { id: "qwen", name: "通义千问", order: 1 },
  { id: "deepseek", name: "DeepSeek", order: 2 },
  { id: "openai", name: "OpenAI", order: 3 },
  { id: "anthropic", name: "Anthropic", order: 4 },
  { id: "gemini", name: "Gemini", order: 5 },
];

// 模型信息
export const models: ModelInfo[] = [
  // 通义千问 模型
  {
    id: "qwq-plus-2025-03-05",
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
    description: "通义千问 QwQ 推理模型增强版, 通过强化学习大幅度提升了模型推理能力, 数学、代码能力等核心指标均达到 DeepSeek-R1 满血版水平。",
  },
  {
    id: "qwen-max-latest",
    name: "Qwen Max",
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
    description: "通义千问高级多模态模型, 模型推理能力和复杂指令理解能力显著增强, 困难任务上的表现更优, 数学、代码能力显著提升, 提升对Table、JSON等结构化数据的理解和生成能力。",
  },

  // DeepSeek 模型
  {
    name: "DeepSeek-V3",
    id: "deepseek-chat",
    provider: "deepseek",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: false,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
    description: "DeepSeek最新多模态大模型，支持视觉分析和文件处理，拥有超长上下文理解能力。",
  },
  {
    name: "DeepSeek-R1",
    id: "deepseek-reasoner",
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
    description: "DeepSeek推理增强版大模型，擅长复杂思考和推理任务，可展示详细思考过程。",
  },

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
    enabled: false,
    experimental: false,
    description: "OpenAI的高级模型，在保持GPT-4核心能力的同时提供了更快的响应速度和更新的知识库。",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: false,
      fileSupport: true,
    },
    enabled: false,
    experimental: false,
    description: "OpenAI最新优化版GPT-4，提供更高效的性能和更准确的回答，支持文件处理。",
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
    enabled: false,
    experimental: false,
    description: "OpenAI高效且经济的模型，适合日常对话和一般性任务，反应速度快。",
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
    enabled: false,
    experimental: false,
    description: "Anthropic的最强大模型，擅长复杂推理、创意写作和深度分析，支持多模态输入。",
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude-3.5-Sonnet",
    provider: "anthropic",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: true,
      fileSupport: true,
    },
    enabled: false,
    experimental: false,
    description: "Anthropic的平衡型模型，结合了高性能和高效率，支持视觉理解和详细思考过程。",
  },

  //  Google 模型
  {
    id: "gemini-2.0-pro-exp-02-05",
    name: "Gemini 2.0",
    provider: "gemini",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: true,
      fileSupport: true,
    },
    enabled: false,
    experimental: true,
    description: "Google的实验性新一代多模态大模型，提供强大的视觉分析、推理能力和超长上下文支持。",
  }
];
