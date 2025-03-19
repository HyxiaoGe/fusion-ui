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
    }
  }
});

export const { setSelectedModel, updateModelConfig, setModelEnabled, setIsLoading } = modelsSlice.actions;
export default modelsSlice.reducer;