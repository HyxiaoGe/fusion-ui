import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { searchConversations, searchMessages, getEnhancedContext } from '@/lib/api/search';
import { settingsStore } from '@/lib/db/chatStore';

// 定义搜索结果类型
export interface SearchResultItem {
  id: string;
  title?: string;
  content: string;
  relevance: number;
  timestamp?: number;
  conversationId?: string;
}

// 定义上下文项类型
export interface ContextItem {
  id: string;
  content: string;
  source: string;
  relevance: number;
}

// 定义状态类型
interface SearchState {
  query: string;
  activeTab: 'conversations' | 'messages';
  isSearching: boolean;
  conversationResults: SearchResultItem[];
  messageResults: SearchResultItem[];
  relatedDiscussions: SearchResultItem[];
  isLoadingRelated: boolean;
  contextEnhancementEnabled: boolean;
  contextMaxItems: number;
  enhancedContext: ContextItem[];
  contextSummary: string;
  isLoadingContext: boolean;
  error: string | null;
}

// 初始状态
const initialState: SearchState = {
  query: '',
  activeTab: 'conversations',
  isSearching: false,
  conversationResults: [],
  messageResults: [],
  relatedDiscussions: [],
  isLoadingRelated: false,
  contextEnhancementEnabled: true,
  contextMaxItems: 3,
  enhancedContext: [],
  contextSummary: '',
  isLoadingContext: false,
  error: null,
};

// 异步操作：搜索对话
export const fetchConversationResults = createAsyncThunk(
  'search/fetchConversationResults',
  async (query: string, { rejectWithValue }) => {
    try {
      const results = await searchConversations(query);
      return results.results;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// 异步操作：搜索消息
export const fetchMessageResults = createAsyncThunk(
  'search/fetchMessageResults',
  async ({ query, conversationId }: { query: string; conversationId?: string }, { rejectWithValue }) => {
    try {
      const results = await searchMessages(query, conversationId);
      return results.results;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// 异步操作：获取相关对话
export const fetchRelatedDiscussions = createAsyncThunk(
  'search/fetchRelatedDiscussions',
  async ({ query, conversationId }: { query: string; conversationId?: string }, { rejectWithValue }) => {
    try {
      const results = await searchConversations(query, 3); // 获取最多3个相关对话
      return results.results;
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// 异步操作：获取增强上下文
export const fetchEnhancedContext = createAsyncThunk(
  'search/fetchEnhancedContext',
  async ({ query, conversationId }: { query: string; conversationId?: string }, { rejectWithValue }) => {
    try {
      const result = await getEnhancedContext(query, conversationId);
      return {
        context: result.context,
        summary: result.summary || '',
      };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// 将搜索设置保存到IndexedDB
export const saveSearchSettings = createAsyncThunk(
  'search/saveSearchSettings',
  async ({
    contextEnhancementEnabled,
    contextMaxItems,
  }: {
    contextEnhancementEnabled: boolean;
    contextMaxItems: number;
  }) => {
    try {
      await settingsStore.saveSetting('contextEnhancementEnabled', contextEnhancementEnabled);
      await settingsStore.saveSetting('contextMaxItems', contextMaxItems);
      return { contextEnhancementEnabled, contextMaxItems };
    } catch (error) {
      console.error('保存搜索设置失败:', error);
      throw error;
    }
  }
);

// 从IndexedDB加载搜索设置
export const loadSearchSettings = createAsyncThunk('search/loadSearchSettings', async () => {
  try {
    const contextEnhancementEnabled = await settingsStore.getSetting('contextEnhancementEnabled');
    const contextMaxItems = await settingsStore.getSetting('contextMaxItems');
    
    return {
      contextEnhancementEnabled: contextEnhancementEnabled !== null ? contextEnhancementEnabled : true,
      contextMaxItems: contextMaxItems !== null ? contextMaxItems : 3,
    };
  } catch (error) {
    console.error('加载搜索设置失败:', error);
    throw error;
  }
});

// 创建Slice
const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
    clearSearchResults(state) {
      state.conversationResults = [];
      state.messageResults = [];
      state.query = '';
    },
    setActiveTab(state, action: PayloadAction<'conversations' | 'messages'>) {
      state.activeTab = action.payload;
    },
    toggleContextEnhancement(state, action: PayloadAction<boolean>) {
      state.contextEnhancementEnabled = action.payload;
      // 异步保存到IndexedDB，但不等待结果
      settingsStore.saveSetting('contextEnhancementEnabled', action.payload)
        .catch(err => console.error('保存上下文增强设置失败:', err));
    },
    setContextMaxItems(state, action: PayloadAction<number>) {
      state.contextMaxItems = action.payload;
      // 异步保存到IndexedDB，但不等待结果
      settingsStore.saveSetting('contextMaxItems', action.payload)
        .catch(err => console.error('保存上下文数量设置失败:', err));
    },
    clearEnhancedContext(state) {
      state.enhancedContext = [];
      state.contextSummary = '';
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // 搜索对话
    builder
      .addCase(fetchConversationResults.pending, (state) => {
        state.isSearching = true;
        state.error = null;
      })
      .addCase(fetchConversationResults.fulfilled, (state, action) => {
        state.isSearching = false;
        state.conversationResults = action.payload;
      })
      .addCase(fetchConversationResults.rejected, (state, action) => {
        state.isSearching = false;
        state.error = action.payload as string;
      });

    // 搜索消息
    builder
      .addCase(fetchMessageResults.pending, (state) => {
        state.isSearching = true;
        state.error = null;
      })
      .addCase(fetchMessageResults.fulfilled, (state, action) => {
        state.isSearching = false;
        state.messageResults = action.payload;
      })
      .addCase(fetchMessageResults.rejected, (state, action) => {
        state.isSearching = false;
        state.error = action.payload as string;
      });

    // 获取相关对话
    builder
      .addCase(fetchRelatedDiscussions.pending, (state) => {
        state.isLoadingRelated = true;
        state.error = null;
      })
      .addCase(fetchRelatedDiscussions.fulfilled, (state, action) => {
        state.isLoadingRelated = false;
        state.relatedDiscussions = action.payload;
      })
      .addCase(fetchRelatedDiscussions.rejected, (state, action) => {
        state.isLoadingRelated = false;
        state.error = action.payload as string;
      });

    // 获取增强上下文
    builder
      .addCase(fetchEnhancedContext.pending, (state) => {
        state.isLoadingContext = true;
        state.error = null;
      })
      .addCase(fetchEnhancedContext.fulfilled, (state, action) => {
        state.isLoadingContext = false;
        state.enhancedContext = action.payload.context;
        state.contextSummary = action.payload.summary;
      })
      .addCase(fetchEnhancedContext.rejected, (state, action) => {
        state.isLoadingContext = false;
        state.error = action.payload as string;
      })
      
      // 加载搜索设置
      .addCase(loadSearchSettings.fulfilled, (state, action) => {
        state.contextEnhancementEnabled = action.payload.contextEnhancementEnabled;
        state.contextMaxItems = action.payload.contextMaxItems;
      })
      
      // 保存搜索设置
      .addCase(saveSearchSettings.fulfilled, (state, action) => {
        state.contextEnhancementEnabled = action.payload.contextEnhancementEnabled;
        state.contextMaxItems = action.payload.contextMaxItems;
      });
  },
});

export const {
  setQuery,
  clearSearchResults,
  setActiveTab,
  toggleContextEnhancement,
  setContextMaxItems,
  clearEnhancedContext,
  clearError,
} = searchSlice.actions;

// 导出使用增强上下文的钩子
export const useEnhancedContext = (query: string, conversationId: string | null, enabled: boolean) => {
  return { enabled, query, conversationId };
};

export default searchSlice.reducer;