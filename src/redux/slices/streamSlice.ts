import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ContentBlock, SearchSourceSummary } from '@/types/conversation';

export interface AgentToolCall {
  toolCallId: string;
  toolName: string;
  query: string;
  status: 'running' | 'completed' | 'failed';
}

export interface AgentStep {
  step: number;
  status: 'running' | 'completed';
  toolCalls: AgentToolCall[];
}

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
  // Agent 步骤状态
  agentSteps: AgentStep[];
  agentMaxSteps: number;
  agentLimitReached: boolean;
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
  agentSteps: [],
  agentMaxSteps: 0,
  agentLimitReached: false,
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
      state.agentSteps = [];
      state.agentMaxSteps = 0;
      state.agentLimitReached = false;
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
      // Agent 模式下不清理 thinking（多步骤，每步 thinking 都有价值）
      // 仅在非 agent 模式（无 agentSteps）时清理第一轮 tool_call 推理噪音
      if (state.agentSteps.length === 0) {
        for (const blockId of [...state.blockOrder]) {
          if (state.blockTypes[blockId] === 'thinking') {
            delete state.thinkingBlocks[blockId];
            delete state.blockTypes[blockId];
            state.blockOrder = state.blockOrder.filter(id => id !== blockId);
          }
        }
        state.isStreamingReasoning = false;
        state.isThinkingPhaseComplete = false;
        state.reasoningStartTime = null;
        state.reasoningEndTime = undefined;
      }
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

    // ── Agent 步骤 ──
    agentStepStart(
      state,
      action: PayloadAction<{ step: number; maxSteps: number; toolCount: number }>
    ) {
      const { step, maxSteps } = action.payload;
      state.agentMaxSteps = maxSteps;
      state.agentSteps.push({
        step,
        status: 'running',
        toolCalls: [],
      });
    },

    agentStepEnd(state, action: PayloadAction<{ step: number }>) {
      const agentStep = state.agentSteps.find(s => s.step === action.payload.step);
      if (agentStep) {
        agentStep.status = 'completed';
        for (const tc of agentStep.toolCalls) {
          if (tc.status === 'running') tc.status = 'completed';
        }
      }
    },

    agentToolCallStart(
      state,
      action: PayloadAction<{ toolCallId: string; toolName: string; query: string }>
    ) {
      const currentStep = state.agentSteps[state.agentSteps.length - 1];
      if (currentStep) {
        currentStep.toolCalls.push({
          ...action.payload,
          status: 'running',
        });
      }
    },

    agentToolCallComplete(
      state,
      action: PayloadAction<{ toolCallId: string; status: 'completed' | 'failed' }>
    ) {
      for (const agentStep of state.agentSteps) {
        const tc = agentStep.toolCalls.find(t => t.toolCallId === action.payload.toolCallId);
        if (tc) {
          tc.status = action.payload.status;
          break;
        }
      }
    },

    agentLimitReached(state) {
      state.agentLimitReached = true;
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
  agentLimitReached,
  agentStepEnd,
  agentStepStart,
  agentToolCallComplete,
  agentToolCallStart,
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
