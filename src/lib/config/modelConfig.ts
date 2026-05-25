import { apiRequest } from '@/lib/api/fetchWithAuth';
import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL

export interface ModelCapability {
  imageGen?: boolean; // 图像生成
  deepThinking?: boolean; // 深度思考
  fileSupport?: boolean; // 文件处理
  functionCalling?: boolean; // 工具调用（含联网搜索）
  vision?: boolean; // 图片理解
}

// API返回的模型数据接口
export interface ApiModelData {
  name: string;
  modelId: string;
  provider: string;
  knowledgeCutoff?: string;
  capabilities: ModelCapability;
  pricing?: {
    input: number;
    output: number;
    unit: string;
  };
  enabled: boolean;
  description?: string;
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
  temperature: number; // 默认温度
  capabilities: ModelCapability; // 能力标识
  enabled: boolean; // 模型是否可用 - true: 模型已接入且可用; false: 模型未接入或暂时不可用
  description?: string; // 模型简要描述，用于悬停提示
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
    temperature: 0.7, // 默认值，可以根据需求调整
    capabilities: apiModel.capabilities,
    enabled: apiModel.enabled,
    description: apiModel.description
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
