import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as memoriesApi from '@/lib/api/memories';
import type { Memory } from '@/types/memory';

interface MemoryState {
  items: Memory[];
  loading: boolean;
  error: string | null;
}

const initialState: MemoryState = {
  items: [],
  loading: false,
  error: null,
};

/** 获取全部记忆 */
export const fetchMemories = createAsyncThunk('memory/fetch', async () => {
  return memoriesApi.getMemories();
});

/** 添加记忆（手动创建） */
export const addMemory = createAsyncThunk('memory/add', async (content: string) => {
  return memoriesApi.createMemory(content);
});

/** 编辑记忆内容 */
export const editMemory = createAsyncThunk(
  'memory/edit',
  async ({ id, content }: { id: string; content: string }) => {
    return memoriesApi.updateMemory(id, content);
  }
);

/** 切换记忆启用状态 */
export const toggleMemoryActive = createAsyncThunk(
  'memory/toggle',
  async ({ id, is_active }: { id: string; is_active: boolean }) => {
    return memoriesApi.toggleMemory(id, is_active);
  }
);

/** 删除记忆 */
export const removeMemory = createAsyncThunk('memory/remove', async (id: string) => {
  await memoriesApi.deleteMemory(id);
  return id;
});

const memorySlice = createSlice({
  name: 'memory',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // 获取记忆列表
      .addCase(fetchMemories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMemories.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loading = false;
      })
      .addCase(fetchMemories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '加载失败';
      })
      // 添加记忆
      .addCase(addMemory.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      })
      // 编辑记忆
      .addCase(editMemory.fulfilled, (state, action) => {
        const idx = state.items.findIndex((m) => m.id === action.payload.id);
        if (idx !== -1) {
          state.items[idx] = { ...state.items[idx], ...action.payload };
        }
      })
      // 切换启用状态
      .addCase(toggleMemoryActive.fulfilled, (state, action) => {
        const idx = state.items.findIndex((m) => m.id === action.payload.id);
        if (idx !== -1) {
          state.items[idx].is_active = action.payload.is_active;
        }
      })
      // 删除记忆
      .addCase(removeMemory.fulfilled, (state, action) => {
        state.items = state.items.filter((m) => m.id !== action.payload);
      });
  },
});

export default memorySlice.reducer;
