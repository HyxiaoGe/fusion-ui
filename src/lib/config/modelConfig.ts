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
  { id: "deepseek", name: "深度求索", order: 2 },
  { id: "wenxin", name: "文心一言", order: 3 },
  { id: "volcengine", name: "火山引擎", order: 4 },
  { id: "hunyuan", name: "腾讯混元", order: 5 },
  { id: "openai", name: "OpenAI", order: 6 },
  { id: "anthropic", name: "Anthropic", order: 7 },
  { id: "google", name: "Google", order: 8 },
  { id: "xai", name: "X", order: 9 }
];

// 模型信息
export const models: ModelInfo[] = [
  // 通义千问 模型
  {
    name: "QwQ Plus",
    id: "qwq-plus-2025-03-05",
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
    name: "Qwen Max",
    id: "qwen-max-latest",
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
    enabled: true,
    experimental: false,
    description: "文心大模型X1具备更强的理解、规划、反思、进化能力。作为能力更全面的深度思考模型，文心X1兼备准确、创意和文采，在中文知识问答、文学创作、文稿写作、日常对话、逻辑推理、复杂计算及工具调用等方面表现尤为出色。",
  },

   // 豆包 模型
   {
    name: "Doubao-1.5-lite",
    id: "doubao-1-5-lite-32k-250115",
    provider: "volcengine",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "32K",
    capabilities: {
      vision: false,
      deepThinking: false,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
    description: "Doubao-1.5-lite 在轻量版语言模型中处于全球一流水平，在综合（MMLU_pro）、推理（BBH）、数学（MATH）、专业知识（GPQA）权威测评指标持平或超越 GPT-4omini、Cluade 3.5 Haiku。",
  },
  {
    name: "Doubao-1.5-pro",
    id: "doubao-1-5-pro-32k-250115",
    provider: "volcengine",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "32K",
    capabilities: {
      vision: true,
      deepThinking: true,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
    description: "多个公开评测基准上，Doubao-1.5-Pro在知识、代码、推理、中文等相关的多个评测中表现优异，综合得分优于GPT4o、Claude 3.5 Sonnet等业界一流模型。",
  },
  {
    name: "Doubao-1.5-vision-pro",
    id: "doubao-1-5-vision-pro-32k-250115",
    provider: "volcengine",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "32K",
    capabilities: {
      vision: true,
      deepThinking: false,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
    description: "Doubao-1.5-vision-pro 在多模态数据合成、动态分辨率、多模态对齐、混合训练上进行了全面的技术升级，进一步增强了模型在视觉推理、文字文档识别、细粒度信息理解、指令遵循方面的能力，并让模型的回复模式变得更加精简、友好。",
  },

  // 混元 模型
  {
    name: "混元-T1",
    id: "hunyuan-turbos-latest",
    provider: "hunyuan",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "32K",
    capabilities: {
      vision: false,
      deepThinking: false,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
    description: "统一数学解题步骤的风格，加强数学多轮问答。文本创作优化回答风格，去除AI味，增加文采。",
  },
  {
    name: "混元-T1-Vision",
    id: "hunyuan-t1-latest",
    provider: "hunyuan",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "32K",
    capabilities: {
      vision: false,
      deepThinking: true,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
    description: "业内首个超大规模 Hybrid-Transformer-Mamba 推理模型，扩展推理能力，超强解码速度，进一步对齐人类偏好。",
  },
  {
    name: "混元-Turbos-Vision",
    id: "hunyuan-turbos-vision",
    provider: "hunyuan",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "32K",
    capabilities: {
      vision: true,
      deepThinking: false,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
    description: "此模型适用于图文理解场景，是基于混元最新 turbos 的新一代视觉语言旗舰大模型，聚焦图文理解相关任务，包括基于图片的实体识别、知识问答、文案创作、拍照解题等方面，相比前一代模型全面提升。",
  },

  // OpenAI 模型
  {
    name: "GPT-4o",
    id: "gpt-4o-2024-08-06",
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
    name: "GPT-3.5 Turbo",
    id: "gpt-3.5-turbo",
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
    name: "GPT-4.5 Preview",
    id: "gpt-4.5-preview-2025-02-27",
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
    name: "GPT-o3-mini",
    id: "o3-mini-2025-01-31",
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
    name: "Claude 3.5 Haiku",
    id: "claude-3-5-haiku-20241022",
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
    description: "Anthropic旗下最快速的模型，专为需要快速响应的简单任务设计。它适合简短对话、快速查询和实时应用场景，如客户服务聊天机器人或需要即时回应的应用程序。",
  },
  {
    name: "Claude 3.5 Sonnet",
    id: "claude-3-5-sonnet-20241022",
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
    description: "一个平衡性能和速度的模型，适合日常大多数任务。它比Opus更快，但仍然保持很高的智能水平，适合需要快速但高质量回应的一般使用场景，如回答问题、内容总结和一般对话。",
  },
  {
    name: "Claude-3.7-Sonnet",
    id: "claude-3-7-sonnet-20250219",
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
    description: "Anthropic最智能的模型，结合了高智能性和相对较快的响应速度，使其成为处理各种任务的强大选择。",
  },
  {
    name: "Claude 3 Opus",
    id: "claude-3-opus-20240229",
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
    description: "Anthropic最强大的模型，擅长处理复杂的推理任务和创意写作。它适合需要深度分析、详细回答或高质量内容创作的场景，如研究分析、复杂问题解决和长篇内容创作。",
  },

  //  Google 模型
  {
    name: "Gemini 1.5 Flash",
    id: "gemini-1.5-flash",
    provider: "google",
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
    description: "Google Gemini 1.5 Flash 是一种专为处理轻量级任务而设计的多模式模型，专为高容量、低延迟任务而设计。",
  },
  {
    name: "Gemini 2.0 Flash",
    id: "gemini-2.0-flash",
    provider: "google",
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
    description: "Gemini 2.0 Flash 带来了新功能。除了支持图像、视频和音频等多模式输入外，2.0 Flash 现在还支持多模式输出，例如原生生成的文本混合图像以及可控制的文本转语音 (TTS) 多语言音频。它还可以原生调用 Google 搜索、代码执行以及第三方用户定义函数等工具。",
  },
  {
    name: "Gemini 2.5 Pro",
    id: "gemini-2.5-pro-preview-03-25",
    provider: "google",
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
    description: "谷歌迄今为止最智能、最强大的人工智能模型，被设计为一种“思维模型”，非常注重高级推理和编码能力。",
  },

  // XAI 模型
  {
    name: "Grok 3 Mini",
    id: "grok-3-mini-beta",
    provider: "xai",
    maxTokens: 131072,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: false,
      deepThinking: true,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
    description: "Grok 旗下轻量级模型，擅长处理涉及数学和推理的定量任务。",
  },
  {
    name: "Grok 2 Vision",
    id: "grok-2-image-1212",
    provider: "xai",
    maxTokens: 32768,
    temperature: 0.7,
    contextWindow: "32K",
    capabilities: {
      vision: true,
      deepThinking: false,
      fileSupport: true,
    },
    enabled: true,
    experimental: false,
    description: "Grok 2 最新的图像生成模型，能够根据文本提示创建高质量、详细的图像，具有增强的创造力和精确度。",
  },
  {
    name: "Grok 3",
    id: "grok-3-beta",
    provider: "xai",
    maxTokens: 131072,
    temperature: 0.7,
    contextWindow: "128K",
    capabilities: {
      vision: false,
      deepThinking: false,
      fileSupport: false,
    },
    enabled: true,
    experimental: false,
    description: "Grok 3 系列的标准模型，擅长数据提取、编程和文本摘要等企业任务。",
  }
];
