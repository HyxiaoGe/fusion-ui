import { apiRequest } from '@/lib/api/fetchWithAuth';
import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL

export interface ModelCapability {
  imageGen?: boolean; // 图像生成
  deepThinking?: boolean; // 深度思考
  fileSupport?: boolean; // 文件处理
  functionCalling?: boolean; // 工具调用
  webSearch?: boolean; // 网络搜索
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

// 提供商缓存（从 API 动态获取）
let cachedProviders: ProviderInfo[] = [];

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

// 仅作为当前会话内的请求缓存，不作为产品真源。
let cachedModels: ModelInfo[] = [];

// 获取结果类型
export interface FetchModelsResult {
  models: ModelInfo[];
  providers: ProviderInfo[];
}

// 添加标志和Promise缓存
let isModelsFetching = false;
let modelsFetchPromise: Promise<FetchModelsResult> | null = null;

// 获取模型配置的函数
export const fetchModels = async (): Promise<FetchModelsResult> => {
  // 如果已经有数据且不是在获取中，直接返回现有数据
  if (cachedModels.length > 0 && !isModelsFetching) {
    return { models: cachedModels, providers: cachedProviders };
  }

  // 如果已经在获取中，返回正在进行的Promise
  if (isModelsFetching && modelsFetchPromise) {
    return modelsFetchPromise;
  }

  // 设置标志并创建Promise
  isModelsFetching = true;

  try {
    modelsFetchPromise = (async () => {
      try {
        const data = await apiRequest<ApiModelResponse>(`${API_BASE_URL}/api/models/`);

        // 将API返回的模型数据转换为ModelInfo格式并更新缓存
        cachedModels = (data.models || []).map(convertApiModelToModelInfo);
        cachedProviders = data.providers || [];
        return { models: cachedModels, providers: cachedProviders };
      } finally {
        // 请求完成后重置标志
        isModelsFetching = false;
      }
    })();

    return await modelsFetchPromise;
  } catch (error) {
    console.error('获取模型配置时出错:', error);
    isModelsFetching = false;
    modelsFetchPromise = null;
    return { models: cachedModels, providers: cachedProviders };
  }
};

// 初始化模型配置
export const initializeModels = async (): Promise<FetchModelsResult> => {
  if (cachedModels.length === 0) {
    return await fetchModels();
  }
  return { models: cachedModels, providers: cachedProviders };
};

export const refreshModels = async (): Promise<FetchModelsResult> => {
  cachedModels = [];
  cachedProviders = [];
  modelsFetchPromise = null;
  isModelsFetching = false;
  return fetchModels();
};
