import { API_CONFIG } from '../config';

const API_BASE_URL = API_CONFIG.BASE_URL

export interface ModelCapability {
  imageGen?: boolean; // 图像生成
  deepThinking?: boolean; // 深度思考
  fileSupport?: boolean; // 文件处理
  functionCalling?: boolean; // 工具调用
  webSearch?: boolean; // 网络搜索
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

// 模型信息 - 从服务器获取或使用默认值
// 此变量将在应用启动时初始化
export let models: ModelInfo[] = [];

// 添加标志和Promise缓存
let isModelsFetching = false;
let modelsFetchPromise: Promise<ModelInfo[]> | null = null;

// 获取模型配置的函数
export const fetchModels = async (): Promise<ModelInfo[]> => {
  // 如果已经有数据且不是在获取中，直接返回现有数据
  if (models.length > 0 && !isModelsFetching) {
    return models;
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
        const response = await fetch(`${API_BASE_URL}/api/models/`);
        if (!response.ok) {
          throw new Error(`获取模型配置失败: ${response.status}`);
        }
        
        const data: ApiModelResponse = await response.json();
        
        // 将API返回的模型数据转换为ModelInfo格式并更新缓存
        const modelInfoList = data.models.map(convertApiModelToModelInfo);
        models = modelInfoList;
        return modelInfoList;
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
    return models.length > 0 ? models : [];
  }
};

// 初始化模型配置
export const initializeModels = async () => {
  if (models.length === 0) {
    return await fetchModels();
  }
  return models;
};
