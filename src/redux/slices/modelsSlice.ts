import { ModelInfo, models, ProviderInfo, providers } from "@/lib/config/modelConfig";
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

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
  selectedModelId: models.length > 0 ? models[0].id : null,
  isLoading: false,
};

const modelsSlice = createSlice({
  name: 'models',
  initialState,
  reducers: {
    setSelectedModel: (state, action: PayloadAction<string>) => {
      state.selectedModelId = action.payload;
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
      // 如果没有选择模型或者选择的模型在新数据中不存在，则自动选择第一个模型
      if (!state.selectedModelId || !action.payload.find(m => m.id === state.selectedModelId)) {
        state.selectedModelId = action.payload.length > 0 ? action.payload[0].id : null;
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