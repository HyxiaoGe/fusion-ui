import { ModelInfo, models, ProviderInfo, providers } from "@/lib/config/modelConfig";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// 从localStorage获取之前选择的模型ID
const getSavedModelId = (): string | null => {
  if (typeof window !== 'undefined') {
    try {
      const savedModelId = localStorage.getItem('selectedModelId');
      return savedModelId;
    } catch (error) {
      console.error('Error loading selectedModelId from localStorage:', error);
    }
  }
  return null;
};

// 原有接口保持兼容
export interface Model extends ModelInfo {}

interface ModelsState {
  models: Model[];
  providers: ProviderInfo[];
  selectedModelId: string | null;
  isLoading: boolean;
}

const initialState: ModelsState = {
  models: models,
  providers: providers,
  selectedModelId: getSavedModelId() || (models.length > 0 ? models[0].id : null),
  isLoading: false,
};

const modelsSlice = createSlice({
  name: 'models',
  initialState,
  reducers: {
    setSelectedModel: (state, action: PayloadAction<string>) => {
      state.selectedModelId = action.payload;
      // 保存到localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('selectedModelId', action.payload);
        } catch (error) {
          console.error('Error saving selectedModelId to localStorage:', error);
        }
      }
    },
    updateModelConfig: (state, action: PayloadAction<{modelId: string, config: Partial<Model>}>) => {
      const { modelId, config } = action.payload;
      const modelIndex = state.models.findIndex(m => m.id === modelId);
      if (modelIndex !== -1) {
        state.models[modelIndex] = { ...state.models[modelIndex], ...config };
      }
    },
    setModelEnabled: (state, action: PayloadAction<{modelId: string, enabled: boolean}>) => {
      const { modelId, enabled } = action.payload;
      const modelIndex = state.models.findIndex(m => m.id === modelId);
      if (modelIndex !== -1) {
        state.models[modelIndex].enabled = enabled;
      }
    },
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    updateModels: (state, action: PayloadAction<Model[]>) => {
      state.models = action.payload;
      
      // 获取保存的模型ID
      const savedModelId = getSavedModelId();
      
      // 如果有保存的模型ID且该模型在新数据中存在，则使用保存的模型ID
      if (savedModelId && action.payload.find(m => m.id === savedModelId)) {
        state.selectedModelId = savedModelId;
      }
      // 否则，如果没有选择模型或者选择的模型在新数据中不存在，则自动选择第一个模型
      else if (!state.selectedModelId || !action.payload.find(m => m.id === state.selectedModelId)) {
        state.selectedModelId = action.payload.length > 0 ? action.payload[0].id : null;
        
        // 保存新选择的模型ID
        if (state.selectedModelId && typeof window !== 'undefined') {
          try {
            localStorage.setItem('selectedModelId', state.selectedModelId);
          } catch (error) {
            console.error('Error saving selectedModelId to localStorage:', error);
          }
        }
      }
    }
  }
});

export const { 
  setSelectedModel, 
  updateModelConfig, 
  setModelEnabled, 
  setIsLoading,
  updateModels
} = modelsSlice.actions;
export default modelsSlice.reducer;