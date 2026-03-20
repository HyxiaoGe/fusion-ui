import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface StreamState {
  conversationId: string | null;
  messageId: string | null;
  content: string;
  reasoning: string;
  isStreaming: boolean;
  isStreamingReasoning: boolean;
  isThinkingPhaseComplete: boolean;
  reasoningStartTime: number | null;
  reasoningEndTime: number | undefined;
}

const initialState: StreamState = {
  conversationId: null,
  messageId: null,
  content: '',
  reasoning: '',
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
      state.content = '';
      state.reasoning = '';
      state.isStreaming = true;
      state.isStreamingReasoning = false;
      state.isThinkingPhaseComplete = false;
      state.reasoningStartTime = null;
      state.reasoningEndTime = undefined;
    },
    updateStreamContent(state, action: PayloadAction<string>) {
      state.content = action.payload;
    },
    startStreamingReasoning(state) {
      if (!state.isStreamingReasoning) {
        state.isStreamingReasoning = true;
        state.reasoningStartTime = Date.now();
      }
    },
    updateStreamReasoning(state, action: PayloadAction<string>) {
      state.reasoning = action.payload.replace('[REASONING_COMPLETE]', '');
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

export const {
  completeThinkingPhase,
  endStream,
  migrateStreamConversation,
  startStream,
  startStreamingReasoning,
  updateStreamContent,
  updateStreamReasoning,
} = streamSlice.actions;

export default streamSlice.reducer;
