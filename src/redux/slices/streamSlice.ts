import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ContentBlock } from '@/types/conversation';

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
export function selectStreamContentBlocks(state: StreamState): ContentBlock[] {
  let remainingChars = state.displayedTextLength;

  return state.blockOrder.map(blockId => {
    const type = state.blockTypes[blockId];
    if (type === 'thinking') {
      return {
        type: 'thinking' as const,
        id: blockId,
        thinking: state.thinkingBlocks[blockId] ?? '',
      };
    }
    // text block：按 displayedTextLength 截断
    const fullText = state.textBlocks[blockId] ?? '';
    const visibleLength = Math.min(remainingChars, fullText.length);
    remainingChars -= visibleLength;
    return {
      type: 'text' as const,
      id: blockId,
      text: fullText.slice(0, visibleLength),
    };
  });
}

// 完整版 selector（不截断），用于流结束时写入最终消息
export function selectFullStreamContentBlocks(state: StreamState): ContentBlock[] {
  return state.blockOrder.map(blockId => {
    const type = state.blockTypes[blockId];
    if (type === 'thinking') {
      return {
        type: 'thinking' as const,
        id: blockId,
        thinking: state.thinkingBlocks[blockId] ?? '',
      };
    }
    return {
      type: 'text' as const,
      id: blockId,
      text: state.textBlocks[blockId] ?? '',
    };
  });
}

export const {
  advanceTypewriter,
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  migrateStreamConversation,
  setLastEntryId,
  setStreamStatus,
  startStream,
} = streamSlice.actions;

export default streamSlice.reducer;
