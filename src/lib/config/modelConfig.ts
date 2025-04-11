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
  { id: "wenxin", name: "文心一言", order: 3 },
  { id: "volcengine", name: "火山引擎", order: 4 },
  { id: "openai", name: "OpenAI", order: 5 },
  { id: "anthropic", name: "Anthropic", order: 6 },
  { id: "gemini", name: "Gemini", order: 7 },
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
    description: "DeepSeek-V3 模型借鉴 DeepSeek-R1 模型训练过程中所使用的强化学习技术，大幅提高了在推理类任务上的表现水平，在数学、代码类相关评测集上取得了超过 GPT-4.5 的得分成绩。",
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
    description: "DeepSeek-R1 在后训练阶段大规模使用了强化学习技术，在仅有极少标注数据的情况下，极大提升了模型推理能力。在数学、代码、自然语言推理等任务上，性能比肩 OpenAI o1 正式版。",
  },

  // 千帆 模型
  {
    name: "ERNIE 4.0",
    id: "ERNIE-4.0-8K-Latest",
    provider: "wenxin",
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
    description: "文心大模型4.5是百度自主研发的新一代原生多模态基础大模型，通过多个模态联合建模实现协同优化，多模态理解能力优秀；具备更精进的语言能力，理解、生成、逻辑、记忆能力全面提升，去幻觉、逻辑推理、代码能力显著提升。",
  },
  {
    name: "ERNIE X1",
    id: "ERNIE-X1-32K-Preview",
    provider: "wenxin",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: false,
      fileSupport: true,
    },
    enabled: false,
    experimental: false,
    description: "文心大模型X1具备更强的理解、规划、反思、进化能力。作为能力更全面的深度思考模型，文心X1兼备准确、创意和文采，在中文知识问答、文学创作、文稿写作、日常对话、逻辑推理、复杂计算及工具调用等方面表现尤为出色。",
  },

   // 千帆 模型
   {
    name: "ERNIE 4.0",
    id: "ERNIE-4.0-8K-Latest",
    provider: "volcengine",
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
    description: "文心大模型4.5是百度自主研发的新一代原生多模态基础大模型，通过多个模态联合建模实现协同优化，多模态理解能力优秀；具备更精进的语言能力，理解、生成、逻辑、记忆能力全面提升，去幻觉、逻辑推理、代码能力显著提升。",
  },
  {
    name: "ERNIE X1",
    id: "ERNIE-X1-32K-Preview",
    provider: "volcengine",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      deepThinking: false,
      fileSupport: true,
    },
    enabled: false,
    experimental: false,
    description: "文心大模型X1具备更强的理解、规划、反思、进化能力。作为能力更全面的深度思考模型，文心X1兼备准确、创意和文采，在中文知识问答、文学创作、文稿写作、日常对话、逻辑推理、复杂计算及工具调用等方面表现尤为出色。",
  },

  // OpenAI 模型
  {
    id: "gpt-4o-2024-08-06",
    name: "GPT-4o",
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
    description: "多功能、高智能的 GPT 旗舰模型。它接受文本和图像输入，并生成文本输出（包括结构化输出）。目前是大多数任务的最佳模型",
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
    description: "OpenAI高效且经济的模型，适合日常对话和一般性任务，反应速度快。",
  },
  {
    id: "gpt-4.5-preview-2025-02-27",
    name: "GPT-4.5 Preview",
    provider: "openai",
    maxTokens: 16384,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      fileSupport: true,
    },
    enabled: false,
    experimental: false,
    description: "迄今为止规模最大、功能最强大的 GPT 模型。它对世界的深入了解和对用户意图的更好理解使其擅长于创造性任务和代理规划。GPT-4.5 擅长于从创造性、开放式思维和对话中受益的任务，例如写作、学习或探索新想法。",
  },
  {
    id: "o3-mini-2025-01-31",
    name: "GPT-o3-mini",
    provider: "openai",
    maxTokens: 16384,
    temperature: 0.7,
    contextWindow: "200K",
    capabilities: {
      vision: true,
      fileSupport: true,
    },
    enabled: false,
    experimental: false,
    description: "GPT 最新的小型推理模型，以与 o1-mini 相同的成本和延迟目标提供高智能。o3-mini 支持关键开发人员功能，例如结构化输出、函数调用和批处理 API。",
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
