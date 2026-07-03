import { apiRequest } from '@/lib/api/fetchWithAuth';
import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL

export interface ModelCapability {
  imageGen?: boolean; // 图像生成
  deepThinking?: boolean; // 深度思考
  fileSupport?: boolean; // 文件处理
  functionCalling?: boolean; // 工具调用（含联网搜索）
  searchCapable?: boolean; // Fusion 会实际下发联网工具
  agentTools?: boolean; // Fusion agent 工具链（联网搜索/读源）
  webSearch?: boolean; // 联网搜索能力
  vision?: boolean; // 图片理解
}

export type CapabilityTone = 'success' | 'muted' | 'info' | 'warning' | 'danger';

export interface CapabilityLabel {
  key: string;
  text: string;
  tone: CapabilityTone;
}

export type ModelRecommendationLevel = 'recommended' | 'capable' | 'limited' | 'unavailable';

export interface ModelCapabilityRecommendation {
  score: number;
  level: ModelRecommendationLevel;
  headline: string;
  reasons: string[];
  warnings: string[];
}

export interface ModelCapabilityPresentation extends ModelCapabilityRecommendation {
  labels: CapabilityLabel[];
  tooltip: string;
}

// 模型健康状态（后台轮询 LiteLLM /health 得来）：
// - healthy: 最近一次探测成功，可正常调用
// - unhealthy: 最近一次探测失败（缺 key / 401 / 模型不存在等），FE 灰显
// - unknown: 服务刚启动还没探测出来，或这个别名没出现在 /health 结果里，FE 按可用处理
export type ModelHealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface ModelHealth {
  status: ModelHealthStatus;
  error?: string | null;
  checked_at?: number | null;
}

// API返回的模型数据接口
export interface ApiModelData {
  name: string;
  modelId: string;
  provider: string;
  knowledgeCutoff?: string;
  contextWindowTokens?: number | null;
  maxOutputTokens?: number | null;
  capabilities: ModelCapability;
  pricing?: {
    input: number;
    output: number;
    unit: string;
  };
  enabled: boolean;
  health?: ModelHealth;
  description?: string;
  capabilityPresentation?: ModelCapabilityPresentation;
}

// API响应接口
export interface ApiModelResponse {
  models: ApiModelData[];
  providers: ProviderInfo[];
}

export interface ModelInfo {
  id: string; // 模型ID
  name: string; // 显示名称
  provider: string; // 提供商ID
  icon?: string; // 模型图标（可选）
  knowledgeCutoff?: string; // 知识库截取时间
  contextWindowTokens?: number | null; // 上下文窗口 token 上限
  maxOutputTokens?: number | null; // 单次输出 token 上限
  temperature: number; // 默认温度
  capabilities: ModelCapability; // 能力标识
  enabled: boolean; // 是否在 LiteLLM 注册（true）；false 通常意味着已下架
  health?: ModelHealth; // 健康探测结果，unhealthy 时选择器灰显
  description?: string; // 模型简要描述，用于悬停提示
  capabilityPresentation?: ModelCapabilityPresentation; // 后端派生的能力展示配置
}

export interface ProviderInfo {
  id: string; // 提供商ID
  name: string; // 显示名称
  order: number; // 排序顺序
}

// 将API模型数据转换为ModelInfo格式
export const convertApiModelToModelInfo = (apiModel: ApiModelData): ModelInfo => {
  return {
    id: apiModel.modelId,
    name: apiModel.name,
    provider: apiModel.provider,
    knowledgeCutoff: apiModel.knowledgeCutoff,
    contextWindowTokens: apiModel.contextWindowTokens,
    maxOutputTokens: apiModel.maxOutputTokens,
    temperature: 0.7, // 默认值，可以根据需求调整
    capabilities: apiModel.capabilities,
    enabled: apiModel.enabled,
    health: apiModel.health,
    description: apiModel.description,
    capabilityPresentation: apiModel.capabilityPresentation,
  };
};

// 获取结果类型
export interface FetchModelsResult {
  models: ModelInfo[];
  providers: ProviderInfo[];
}

// 请求去重：防止多个组件同时触发重复请求
let activeFetchPromise: Promise<FetchModelsResult> | null = null;

// 获取模型配置，自动去重并发请求
export const fetchModels = async (): Promise<FetchModelsResult> => {
  // 如果已有请求在进行中，复用同一个 Promise
  if (activeFetchPromise) {
    return activeFetchPromise;
  }

  activeFetchPromise = (async () => {
    try {
      const data = await apiRequest<ApiModelResponse>(`${API_BASE_URL}/api/models/`);
      const models = (data.models || []).map(convertApiModelToModelInfo);
      const providers = data.providers || [];
      return { models, providers };
    } finally {
      activeFetchPromise = null;
    }
  })();

  return activeFetchPromise;
};

// 初始化模型配置（语义别名，与 fetchModels 行为一致）
export const initializeModels = fetchModels;

// 强制刷新（与 fetchModels 一致，去重由 activeFetchPromise 保证）
export const refreshModels = fetchModels;
