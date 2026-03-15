import { ModelInfo, ProviderInfo, providers } from "@/lib/config/modelConfig";
import { getPreferredModelId } from "@/lib/models/modelPreference";
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
  models: [],
  providers: providers,
  selectedModelId: getSavedModelId(),
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

      const preferredModelId = getPreferredModelId(
        action.payload,
        savedModelId || state.selectedModelId,
      );

      if (preferredModelId !== state.selectedModelId) {
        state.selectedModelId = preferredModelId;
      }

      if (state.selectedModelId && typeof window !== 'undefined') {
        try {
          localStorage.setItem('selectedModelId', state.selectedModelId);
        } catch (error) {
          console.error('Error saving selectedModelId to localStorage:', error);
        }
      }
    }
  }
});

export const { 
  setSelectedModel, 
  setModelEnabled, 
  setIsLoading,
  updateModels
} = modelsSlice.actions;
export default modelsSlice.reducer;
