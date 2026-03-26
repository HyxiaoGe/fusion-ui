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
  isStreaming: boolean;
  isStreamingReasoning: boolean;
  isThinkingPhaseComplete: boolean;
  reasoningStartTime: number | null;
  reasoningEndTime: number | undefined;
}

const initialState: StreamState = {
  conversationId: null,
  messageId: null,
  textBlocks: {},
  thinkingBlocks: {},
  blockOrder: [],
  blockTypes: {},
  isStreaming: false,
  isStreamingReasoning: false,
  isThinkingPhaseComplete: false,
  reasoningStartTime: null,
  reasoningEndTime: undefined,
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

    completeThinkingPhase(state) {
      state.isThinkingPhaseComplete = true;
      state.isStreamingReasoning = false;
      state.reasoningEndTime = Date.now();
    },

    migrateStreamConversation(state, action: PayloadAction<string>) {
      state.conversationId = action.payload;
    },

    endStream() {
      return initialState;
    },
  },
});

// Selector：从 streamSlice 组装出当前流式 content blocks 数组
// 供渲染层使用，和历史消息的 ContentBlock[] 格式完全一致
export function selectStreamContentBlocks(state: StreamState): ContentBlock[] {
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
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  migrateStreamConversation,
  startStream,
} = streamSlice.actions;

export default streamSlice.reducer;
