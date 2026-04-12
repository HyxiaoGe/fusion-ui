import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ContentBlock, SearchSourceSummary } from '@/types/conversation';

export interface StreamState {
  conversationId: string | null;
  messageId: string | null;
  // 按 block id 维护增量
  textBlocks: Record<string, string>;
  thinkingBlocks: Record<string, string>;
  // 保持 block 顺序（按首次出现排列）
  blockOrder: string[];
  blockTypes: Record<string, 'text' | 'thinking'>;
  // 打字机控制：text block 总字符数 vs 已显示字符数
  totalTextLength: number;
  displayedTextLength: number;
  isStreaming: boolean;
  isStreamingReasoning: boolean;
  isThinkingPhaseComplete: boolean;
  reasoningStartTime: number | null;
  reasoningEndTime: number | undefined;
  // 搜索状态
  searchQuery: string | null;
  searchSources: SearchSourceSummary[];
  isSearching: boolean;
  // URL 读取状态
  isReadingUrl: boolean;
  urlReadUrl: string | null;
  urlReadResult: { url: string; title?: string; favicon?: string } | null;
  // 最后收到的 Redis Stream entry ID（断线重连起点）
  lastEntryId: string;
  // 流状态枚举
  streamStatus: 'idle' | 'streaming' | 'reconnecting' | 'completed' | 'error';
}

const initialState: StreamState = {
  conversationId: null,
  messageId: null,
  textBlocks: {},
  thinkingBlocks: {},
  blockOrder: [],
  blockTypes: {},
  totalTextLength: 0,
  displayedTextLength: 0,
  isStreaming: false,
  isStreamingReasoning: false,
  isThinkingPhaseComplete: false,
  reasoningStartTime: null,
  reasoningEndTime: undefined,
  searchQuery: null,
  searchSources: [],
  isSearching: false,
  isReadingUrl: false,
  urlReadUrl: null,
  urlReadResult: null,
  lastEntryId: '0',
  streamStatus: 'idle',
};

const streamSlice = createSlice({
  name: 'stream',
  initialState,
  reducers: {
    startStream(
      state,
      action: PayloadAction<{ conversationId: string; messageId: string }>
    ) {
      state.conversationId = action.payload.conversationId;
      state.messageId = action.payload.messageId;
      state.textBlocks = {};
      state.thinkingBlocks = {};
      state.blockOrder = [];
      state.blockTypes = {};
      state.totalTextLength = 0;
      state.displayedTextLength = 0;
      state.isStreaming = true;
      state.isStreamingReasoning = false;
      state.isThinkingPhaseComplete = false;
      state.reasoningStartTime = null;
      state.reasoningEndTime = undefined;
      state.searchQuery = null;
      state.searchSources = [];
      state.isSearching = false;
      state.isReadingUrl = false;
      state.urlReadUrl = null;
      state.urlReadResult = null;
    },

    appendTextDelta(
      state,
      action: PayloadAction<{ blockId: string; delta: string }>
    ) {
      const { blockId, delta } = action.payload;
      if (!state.blockTypes[blockId]) {
        state.blockTypes[blockId] = 'text';
        state.blockOrder.push(blockId);
      }
      state.textBlocks[blockId] = (state.textBlocks[blockId] ?? '') + delta;
      state.totalTextLength += delta.length;
    },

    appendThinkingDelta(
      state,
      action: PayloadAction<{ blockId: string; delta: string }>
    ) {
      const { blockId, delta } = action.payload;
      if (!state.blockTypes[blockId]) {
        state.blockTypes[blockId] = 'thinking';
        state.blockOrder.push(blockId);
        if (!state.isStreamingReasoning) {
          state.isStreamingReasoning = true;
          state.reasoningStartTime = Date.now();
        }
      }
      state.thinkingBlocks[blockId] = (state.thinkingBlocks[blockId] ?? '') + delta;
    },

    // 打字机每 tick 推进显示长度
    advanceTypewriter(state, action: PayloadAction<number>) {
      state.displayedTextLength = Math.min(
        state.displayedTextLength + action.payload,
        state.totalTextLength
      );
    },

    completeThinkingPhase(state) {
      state.isThinkingPhaseComplete = true;
      state.isStreamingReasoning = false;
      state.reasoningEndTime = Date.now();
    },

    migrateStreamConversation(state, action: PayloadAction<string>) {
      state.conversationId = action.payload;
    },

    setLastEntryId(state, action: PayloadAction<string>) {
      state.lastEntryId = action.payload;
    },

    startSearch(state, action: PayloadAction<{ query: string }>) {
      state.isSearching = true;
      state.searchQuery = action.payload.query;
      // 清掉第一轮 thinking（tool_call 推理噪音），第二轮会用新 block ID 重新写入
      for (const blockId of [...state.blockOrder]) {
        if (state.blockTypes[blockId] === 'thinking') {
          delete state.thinkingBlocks[blockId];
          delete state.blockTypes[blockId];
          state.blockOrder = state.blockOrder.filter(id => id !== blockId);
        }
      }
      state.isStreamingReasoning = false;
      state.isThinkingPhaseComplete = false;
      // 重置计时，第二轮 thinking 会设置新的 startTime/endTime
      state.reasoningStartTime = null;
      state.reasoningEndTime = undefined;
    },

    completeSearch(state, action: PayloadAction<{ sources: SearchSourceSummary[] }>) {
      state.isSearching = false;
      state.searchSources = action.payload.sources;
    },

    startUrlRead(state, action: PayloadAction<{ url: string }>) {
      state.isReadingUrl = true;
      state.urlReadUrl = action.payload.url;
      state.urlReadResult = null;
    },

    completeUrlRead(
      state,
      action: PayloadAction<{ url: string; title?: string; favicon?: string; status: string }>
    ) {
      state.isReadingUrl = false;
      if (action.payload.status === 'success') {
        state.urlReadResult = {
          url: action.payload.url,
          title: action.payload.title,
          favicon: action.payload.favicon,
        };
      }
    },

    setStreamStatus(state, action: PayloadAction<StreamState['streamStatus']>) {
      state.streamStatus = action.payload;
    },

    endStream() {
      return initialState;
    },
  },
});

// Selector：从 streamSlice 组装出当前流式 content blocks 数组
// thinking blocks 全量返回（实时显示），text blocks 按 displayedTextLength 截断（打字机效果）
// search block 在 thinking 和 text 之间插入
export function selectStreamContentBlocks(state: StreamState): ContentBlock[] {
  let remainingChars = state.displayedTextLength;
  const blocks: ContentBlock[] = [];

  // 先输出 thinking blocks
  for (const blockId of state.blockOrder) {
    if (state.blockTypes[blockId] === 'thinking') {
      blocks.push({
        type: 'thinking' as const,
        id: blockId,
        thinking: state.thinkingBlocks[blockId] ?? '',
      });
    }
  }

  // 插入 search block（如果有搜索结果）
  if (state.searchSources.length > 0 && state.searchQuery) {
    blocks.push({
      type: 'search' as const,
      id: 'blk_stream_search',
      query: state.searchQuery,
      sources: state.searchSources,
    });
  }

  // 再输出 text blocks（带打字机截断）
  for (const blockId of state.blockOrder) {
    if (state.blockTypes[blockId] === 'text') {
      const fullText = state.textBlocks[blockId] ?? '';
      const visibleLength = Math.min(remainingChars, fullText.length);
      remainingChars -= visibleLength;
      blocks.push({
        type: 'text' as const,
        id: blockId,
        text: fullText.slice(0, visibleLength),
      });
    }
  }

  return blocks;
}

// 完整版 selector（不截断），用于流结束时写入最终消息
export function selectFullStreamContentBlocks(state: StreamState): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const blockId of state.blockOrder) {
    const type = state.blockTypes[blockId];
    if (type === 'thinking') {
      blocks.push({
        type: 'thinking' as const,
        id: blockId,
        thinking: state.thinkingBlocks[blockId] ?? '',
      });
    }
  }

  if (state.urlReadResult) {
    blocks.push({
      type: 'url_read' as const,
      id: 'blk_stream_url_read',
      url: state.urlReadResult.url,
      title: state.urlReadResult.title,
      favicon: state.urlReadResult.favicon,
    });
  }

  if (state.searchSources.length > 0 && state.searchQuery) {
    blocks.push({
      type: 'search' as const,
      id: 'blk_stream_search',
      query: state.searchQuery,
      sources: state.searchSources,
    });
  }

  for (const blockId of state.blockOrder) {
    if (state.blockTypes[blockId] === 'text') {
      blocks.push({
        type: 'text' as const,
        id: blockId,
        text: state.textBlocks[blockId] ?? '',
      });
    }
  }

  return blocks;
}

export const {
  advanceTypewriter,
  appendTextDelta,
  appendThinkingDelta,
  completeSearch,
  completeThinkingPhase,
  completeUrlRead,
  endStream,
  migrateStreamConversation,
  setLastEntryId,
  setStreamStatus,
  startSearch,
  startStream,
  startUrlRead,
} = streamSlice.actions;

export default streamSlice.reducer;
