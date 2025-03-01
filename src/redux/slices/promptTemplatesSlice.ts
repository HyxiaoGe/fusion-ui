import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import {
  PromptTemplate,
  getAllPromptTemplates,
  getPromptTemplateById,
  addPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  initializeDefaultPromptTemplates,
} from '@/lib/db/promptTemplates';

interface PromptTemplatesState {
  templates: PromptTemplate[];
  selectedTemplateId: number | null;
  categories: string[];
  isLoading: boolean;
  error: string | null;
}

const initialState: PromptTemplatesState = {
  templates: [],
  selectedTemplateId: null,
  categories: ['编程', '写作', '学习', '其他'],
  isLoading: false,
  error: null,
};

// 初始化提示词模板
export const initializeTemplates = createAsyncThunk(
  'promptTemplates/initialize',
  async (_, { rejectWithValue }) => {
    try {
      await initializeDefaultPromptTemplates();
      const templates = await getAllPromptTemplates();
      return templates;
    } catch (error) {
      return rejectWithValue('无法初始化提示词模板');
    }
  }
);

// 加载所有模板
export const fetchAllTemplates = createAsyncThunk(
  'promptTemplates/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const templates = await getAllPromptTemplates();
      return templates;
    } catch (error) {
      return rejectWithValue('无法加载提示词模板');
    }
  }
);

// 添加新模板
export const createTemplate = createAsyncThunk(
  'promptTemplates/create',
  async (template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt'>, { rejectWithValue }) => {
    try {
      const now = new Date();
      const id = await addPromptTemplate({
        ...template,
        createdAt: now,
        updatedAt: now,
      });
      return {
        id,
        ...template,
        createdAt: now,
        updatedAt: now,
      } as PromptTemplate;
    } catch (error) {
      return rejectWithValue('无法创建提示词模板');
    }
  }
);

// 更新模板
export const updateTemplate = createAsyncThunk(
  'promptTemplates/update',
  async (
    { id, template }: { id: number; template: Partial<Omit<PromptTemplate, 'id'>> },
    { rejectWithValue }
  ) => {
    try {
      await updatePromptTemplate(id, template);
      const updatedTemplate = await getPromptTemplateById(id);
      if (!updatedTemplate) {
        throw new Error('找不到更新后的模板');
      }
      return updatedTemplate;
    } catch (error) {
      return rejectWithValue('无法更新提示词模板');
    }
  }
);

// 删除模板
export const removeTemplate = createAsyncThunk(
  'promptTemplates/remove',
  async (id: number, { rejectWithValue }) => {
    try {
      await deletePromptTemplate(id);
      return id;
    } catch (error) {
      return rejectWithValue('无法删除提示词模板');
    }
  }
);

const promptTemplatesSlice = createSlice({
  name: 'promptTemplates',
  initialState,
  reducers: {
    setSelectedTemplate: (state, action: PayloadAction<number | null>) => {
      state.selectedTemplateId = action.payload;
    },
    addCategory: (state, action: PayloadAction<string>) => {
      if (!state.categories.includes(action.payload)) {
        state.categories.push(action.payload);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // 初始化模板
      .addCase(initializeTemplates.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(initializeTemplates.fulfilled, (state, action) => {
        state.templates = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(initializeTemplates.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // 获取所有模板
      .addCase(fetchAllTemplates.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchAllTemplates.fulfilled, (state, action) => {
        state.templates = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(fetchAllTemplates.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // 创建模板
      .addCase(createTemplate.fulfilled, (state, action) => {
        state.templates.push(action.payload);
        state.error = null;
      })
      .addCase(createTemplate.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // 更新模板
      .addCase(updateTemplate.fulfilled, (state, action) => {
        const index = state.templates.findIndex(
          (template) => template.id === action.payload.id
        );
        if (index !== -1) {
          state.templates[index] = action.payload;
        }
        state.error = null;
      })
      .addCase(updateTemplate.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // 删除模板
      .addCase(removeTemplate.fulfilled, (state, action) => {
        state.templates = state.templates.filter(
          (template) => template.id !== action.payload
        );
        if (state.selectedTemplateId === action.payload) {
          state.selectedTemplateId = null;
        }
        state.error = null;
      })
      .addCase(removeTemplate.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { setSelectedTemplate, addCategory } = promptTemplatesSlice.actions;

export default promptTemplatesSlice.reducer;