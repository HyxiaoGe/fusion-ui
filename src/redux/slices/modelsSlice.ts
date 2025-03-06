import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Model {
  id: string;
  name: string;
  provider: 'qwen' | 'wenxin' | 'openai' | 'deepseek';
  icon: string;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
}

interface ModelsState {
  models: Model[];
  selectedModelId: string | null;
  isLoading: boolean;
}

const initialModels: Model[] = [
  {
    id: 'qwen',
    name: '通义千问',
    provider: 'qwen',
    icon: 'qwen',
    maxTokens: 8192,
    temperature: 0.7,
    enabled: true
  },
  {
    id: 'wenxin',
    name: '文心一言',
    provider: 'wenxin',
    icon: 'wenxin',
    maxTokens: 4096,
    temperature: 0.7,
    enabled: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    provider: 'openai',
    icon: 'openai',
    maxTokens: 16384,
    temperature: 0.7,
    enabled: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'deepseek',
    icon: 'deepseek',
    maxTokens: 8192,
    temperature: 0.7,
    enabled: true
  }
];

const initialState: ModelsState = {
  models: initialModels,
  selectedModelId: initialModels[0].id,
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