import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ContentBlock, ContextUsage, SearchSourceSummary } from '@/types/conversation';
import type { ContextUsagePhase } from '@/lib/chat/contextUsage';
import { logout } from '@/redux/slices/authSlice';
import type {
  AgentEvidenceItem,
  AgentPlanItem,
  AgentPlanState,
  AgentProgressState,
  AgentRunState,
  AgentRunStatus,
  AgentToolDigest,
  LimitReachedReason,
  ToolCallResultSummary,
} from '@/types/agentRun';

export interface StreamState {
  // ── 流元信息 ──
  conversationId: string | null;
  messageId: string | null;
  staticBlocks: ContentBlock[];
  // ── block 增量（保留：reasoning/answering 仍走这里）──
  textBlocks: Record<string, string>;
  thinkingBlocks: Record<string, string>;
  blockOrder: string[];
  blockTypes: Record<string, 'text' | 'thinking'>;
  totalTextLength: number;
  displayedTextLength: number;
  // ── 流状态枚举 ──
  isStreaming: boolean;
  isStreamingReasoning: boolean;
  isThinkingPhaseComplete: boolean;
  reasoningStartTime: number | null;
  reasoningEndTime: number | undefined;
  // ── 来源（保留：Markdown 引用与回答依据仍读）──
  // 注：Phase 1 cut over 后 streaming 期 searchSources 不再被 reducer 主动填充；
  // 由 ChatMessage (Task 13b) 在 stream 结束后从消息 ContentBlock 提取
  searchSources: SearchSourceSummary[];
  // ── 断线重连 ──
  lastEntryId: string;
  streamStatus: 'idle' | 'streaming' | 'reconnecting' | 'completed' | 'error';
  // ── Agent run timeline（Task 12 新增）──
  currentRun: AgentRunState | null;
  // ── 错误卡片 ──
  lastError: { message: string; code?: string; data?: Record<string, unknown> } | null;
  contextUsage: ContextUsage | null;
  contextUsageConversationId: string | null;
  contextUsageMeta: {
    runId: string;
    messageId: string;
    sequence: number;
    phase: ContextUsagePhase;
    roundIndex: number | null;
  } | null;
}

const initialState: StreamState = {
  conversationId: null,
  messageId: null,
  staticBlocks: [],
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
  searchSources: [],
  lastEntryId: '0',
  streamStatus: 'idle',
  currentRun: null,
  lastError: null,
  contextUsage: null,
  contextUsageConversationId: null,
  contextUsageMeta: null,
};

const streamSlice = createSlice({
  name: 'stream',
  initialState,
  reducers: {
    startStream(
      state,
      action: PayloadAction<{ conversationId: string; messageId: string; staticBlocks?: ContentBlock[] }>
    ) {
      state.conversationId = action.payload.conversationId;
      state.messageId = action.payload.messageId;
      state.staticBlocks = action.payload.staticBlocks ?? [];
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
      state.searchSources = [];
      state.lastEntryId = '0';
      state.streamStatus = 'streaming';
      state.currentRun = null;
      // 新一轮发送清空上一次的错误卡片
      state.lastError = null;
      state.contextUsage = null;
      state.contextUsageConversationId = action.payload.conversationId;
      state.contextUsageMeta = null;
    },

    appendTextDelta(
      state,
      action: PayloadAction<{ blockId: string; delta: string; runId?: string; stepId?: string }>
    ) {
      const { blockId, delta, runId, stepId } = action.payload;
      // 首次创建：注册 block type + order
      if (!state.blockTypes[blockId]) {
        state.blockTypes[blockId] = 'text';
        state.blockOrder.push(blockId);
      }
      // 每次 delta 都尝试关联 step（runId/stepId 是 optional，可能首次 delta 没带后续 delta 带了）
      // includes 防重复挂，spec §6.5 defensive no-op
      if (runId && stepId && state.currentRun?.runId === runId) {
        const step = state.currentRun.steps.find(s => s.stepId === stepId);
        if (step && !step.contentBlockIds.includes(blockId)) {
          step.contentBlockIds.push(blockId);
        }
      }
      state.textBlocks[blockId] = (state.textBlocks[blockId] ?? '') + delta;
      state.totalTextLength += delta.length;
    },

    appendThinkingDelta(
      state,
      action: PayloadAction<{ blockId: string; delta: string; runId?: string; stepId?: string }>
    ) {
      const { blockId, delta, runId, stepId } = action.payload;
      if (!state.blockTypes[blockId]) {
        state.blockTypes[blockId] = 'thinking';
        state.blockOrder.push(blockId);
        if (!state.isStreamingReasoning) {
          state.isStreamingReasoning = true;
          state.reasoningStartTime = Date.now();
        }
      }
      // 每次 delta 都尝试关联 step（runId/stepId 是 optional，可能首次 delta 没带后续 delta 带了）
      // includes 防重复挂，spec §6.5 defensive no-op
      if (runId && stepId && state.currentRun?.runId === runId) {
        const step = state.currentRun.steps.find(s => s.stepId === stepId);
        if (step && !step.contentBlockIds.includes(blockId)) {
          step.contentBlockIds.push(blockId);
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

    // ── Agent run timeline reducers (Task 12 / spec §6.4) ──

    initRun(
      state,
      action: PayloadAction<{
        runId: string;
        messageId: string;
        serverMessageId?: string;
        config: { maxSteps: number; maxToolCalls: number; timeoutS: number };
        sequence: number;
      }>
    ) {
      const { runId, messageId, serverMessageId, config, sequence } = action.payload;
      // 跨重连幂等：同 runId 且 sequence 已应用 → noop（防重放清空已建 timeline）
      // 不同 runId 仍允许重建（新 run 覆盖旧 run timeline，spec §6.2 单 currentRun 设计）
      if (
        state.currentRun &&
        state.currentRun.runId === runId &&
        sequence <= state.currentRun.lastSequence
      ) {
        return;
      }
      state.currentRun = {
        runId,
        messageId,
        serverMessageId,
        status: 'running',
        config,
        totalSteps: 0,
        totalToolCalls: 0,
        steps: [],
        evidence: [],
        toolDigests: [],
        lastSequence: sequence,
      };
    },

    updateRunProgress(
      state,
      action: PayloadAction<{ runId: string; sequence: number; progress: AgentProgressState }>
    ) {
      const run = state.currentRun;
      const { runId, sequence, progress } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      run.protocolVersion = 2;
      run.progress = progress;
    },

    applyPlanSnapshot(
      state,
      action: PayloadAction<{ runId: string; sequence: number; plan: AgentPlanState }>
    ) {
      const run = state.currentRun;
      const { runId, sequence, plan } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      run.protocolVersion = 2;
      run.plan = plan;
    },

    updatePlanStep(
      state,
      action: PayloadAction<{
        runId: string;
        sequence: number;
        planId: string;
        revision: number;
        item: AgentPlanItem;
      }>
    ) {
      const run = state.currentRun;
      const { runId, sequence, planId, revision, item } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      if (!run.plan || run.plan.planId !== planId || revision <= run.plan.revision) return;
      run.lastSequence = sequence;
      run.protocolVersion = 2;
      const index = run.plan.items.findIndex(existing => existing.id === item.id);
      if (index >= 0) {
        run.plan.items[index] = item;
      } else {
        run.plan.items.push(item);
      }
      run.plan.revision = revision;
    },

    upsertToolDigest(
      state,
      action: PayloadAction<{ runId: string; sequence: number; digest: AgentToolDigest }>
    ) {
      const run = state.currentRun;
      const { runId, sequence, digest } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      run.protocolVersion = 2;
      run.toolDigests = run.toolDigests ?? [];
      const index = run.toolDigests.findIndex(existing => existing.toolCallId === digest.toolCallId);
      if (index >= 0) {
        run.toolDigests[index] = digest;
      } else {
        run.toolDigests.push(digest);
      }
    },

    upsertEvidenceItem(
      state,
      action: PayloadAction<{ runId: string; sequence: number; evidence: AgentEvidenceItem }>
    ) {
      const run = state.currentRun;
      const { runId, sequence, evidence } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      run.protocolVersion = 2;
      run.evidence = run.evidence ?? [];
      const index = run.evidence.findIndex(existing => existing.id === evidence.id);
      if (index >= 0) {
        run.evidence[index] = evidence;
      } else {
        run.evidence.push(evidence);
      }
    },

    pushStep(
      state,
      action: PayloadAction<{ runId: string; stepId: string; stepNumber: number; sequence: number }>
    ) {
      const run = state.currentRun;
      const { runId, stepId, stepNumber, sequence } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      run.steps.push({
        stepId,
        stepNumber,
        status: 'running',
        toolCalls: [],
        contentBlockIds: [],
        startedAt: Date.now(),
      });
      run.totalSteps = Math.max(run.totalSteps, stepNumber);
    },

    pushToolCall(
      state,
      action: PayloadAction<{
        runId: string;
        stepId: string;
        toolCallId: string;
        toolName: string;
        arguments: Record<string, unknown>;
        sequence: number;
      }>
    ) {
      const run = state.currentRun;
      const { runId, stepId, toolCallId, toolName, arguments: args, sequence } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      const step = run.steps.find(s => s.stepId === stepId);
      if (!step) return; // defensive: step 应该已存在
      step.toolCalls.push({
        toolCallId,
        toolName,
        arguments: args,
        status: 'running',
        startedAt: Date.now(),
      });
      run.totalToolCalls += 1;
    },

    mergeToolCallDelta(
      state,
      action: PayloadAction<{
        runId: string;
        toolCallId: string;
        delta: Record<string, unknown>;
        sequence: number;
      }>
    ) {
      const run = state.currentRun;
      const { runId, toolCallId, delta, sequence } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      for (const step of run.steps) {
        const tc = step.toolCalls.find(t => t.toolCallId === toolCallId);
        if (tc) {
          // 显式 allowlist：仅 resultSummary / arguments 可被 delta 覆盖。
          // 不允许 status / toolCallId / toolName / startedAt / completedAt 被 delta 改，
          // 它们由 finalizeToolCall / pushToolCall 等专用 reducer 控制。
          const tcRecord = tc as unknown as Record<string, unknown>;
          if ('resultSummary' in delta) {
            tcRecord.resultSummary = delta.resultSummary;
          }
          if ('arguments' in delta) {
            tcRecord.arguments = delta.arguments;
          }
          return;
        }
      }
    },

    finalizeToolCall(
      state,
      action: PayloadAction<{
        runId: string;
        toolCallId: string;
        status: 'success' | 'failed' | 'degraded';
        durationMs: number;
        resultSummary?: ToolCallResultSummary;
        error?: string | null;
        sequence: number;
      }>
    ) {
      const run = state.currentRun;
      const { runId, toolCallId, status, durationMs, resultSummary, error, sequence } =
        action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      for (const step of run.steps) {
        const tc = step.toolCalls.find(t => t.toolCallId === toolCallId);
        if (tc) {
          tc.status = status;
          tc.completedAt = Date.now();
          if (resultSummary) tc.resultSummary = resultSummary;
          if (error) tc.error = error;
          // duration_ms 暂不映射到 ToolCallState（信息可由 startedAt/completedAt 推算）
          void durationMs;
          return;
        }
      }
    },

    finalizeStep(
      state,
      action: PayloadAction<{ runId: string; stepId: string; sequence: number }>
    ) {
      const run = state.currentRun;
      const { runId, stepId, sequence } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      const step = run.steps.find(s => s.stepId === stepId);
      if (step) {
        step.status = 'completed';
        step.completedAt = Date.now();
      }
    },

    markLimitReached(
      state,
      action: PayloadAction<{ runId: string; reason: LimitReachedReason; sequence: number }>
    ) {
      const run = state.currentRun;
      const { runId, reason, sequence } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      run.limitReachedReason = reason;
      // 不改 run.status —— spec §4.3，run_limit_reached 是信号事件，仅 run_completed 才写终态
    },

    finalizeRun(
      state,
      action: PayloadAction<{
        runId: string;
        status: Exclude<AgentRunStatus, 'running'>;
        failure?: { code: string; message: string };
        reason?: string;
        sequence: number;
      }>
    ) {
      const run = state.currentRun;
      const { runId, status, failure, sequence } = action.payload;
      if (!run || run.runId !== runId || sequence <= run.lastSequence) return;
      run.lastSequence = sequence;
      run.status = status;
      if (failure) run.failure = failure;
      // contract §3：run-level 终态（interrupted/failed）派生——
      //   扫所有 running step 和 tool call，把它们标为对应终态，避免 UI 残留 spinner。
      //   只改 running 的，不动已 completed/failed/degraded 的历史 tool call。
      //   失败发生在 tool_call_started 之后、tool_call_completed 之前时，BE 不会再
      //   补 tool_call_completed，FE 必须在这里收尾，否则 chip 会一直转。
      if (status === 'interrupted' || status === 'failed') {
        const now = Date.now();
        run.steps.forEach(step => {
          if (step.status === 'running') {
            step.status = status;
            step.completedAt = now;
          }
          step.toolCalls?.forEach(tc => {
            if (tc.status === 'running') {
              tc.status = status;
              tc.completedAt = now;
            }
          });
        });
      }
    },

    setStreamStatus(state, action: PayloadAction<StreamState['streamStatus']>) {
      state.streamStatus = action.payload;
    },

    setStreamError(
      state,
      action: PayloadAction<{ message: string; code?: string; data?: Record<string, unknown> }>,
    ) {
      state.lastError = action.payload;
    },

    clearStreamError(state) {
      state.lastError = null;
    },

    updateContextUsage(
      state,
      action: PayloadAction<{
        conversationId: string;
        usage: ContextUsage;
        runId: string;
        messageId: string;
        sequence: number;
        phase: ContextUsagePhase;
      }>,
    ) {
      const { conversationId, usage, runId, messageId, sequence, phase } = action.payload;
      if (state.conversationId !== conversationId || !state.isStreaming) return;
      if (state.currentRun && state.currentRun.runId !== runId) return;
      if (
        state.currentRun?.serverMessageId
        && state.currentRun.serverMessageId !== messageId
      ) return;

      const previous = state.contextUsageMeta;
      if (previous?.runId === runId && previous.messageId === messageId) {
        if (sequence <= previous.sequence) return;
        const sameRound = previous.roundIndex === usage.round_index;
        if (
          previous.roundIndex !== null
          && usage.round_index !== null
          && usage.round_index < previous.roundIndex
        ) return;
        if (sameRound && previous.phase === 'final' && phase !== 'final') return;
      }

      state.contextUsage = usage;
      state.contextUsageConversationId = conversationId;
      state.contextUsageMeta = {
        runId,
        messageId,
        sequence,
        phase,
        roundIndex: usage.round_index,
      };
    },

    endStream(state) {
      // 保留 lastError 跨流生命周期：错误卡片需要在 endStream 后继续显示，
      // 由 startStream（新一轮发送）或 clearStreamError（用户手动 dismiss）清掉
      // 保留 currentRun 跨流生命周期：AgentStepCard 在流结束后显示折叠摘要
      //   （由 startStream 新一轮发送清掉，或由 ChatMessage 用 messageId 过滤
      //    确保不挂错对话）
      const preservedError = state.lastError;
      const preservedRun = state.currentRun;
      const preservedContextUsage = state.contextUsage;
      const preservedContextUsageConversationId = state.contextUsageConversationId;
      const preservedContextUsageMeta = state.contextUsageMeta;
      Object.assign(state, initialState);
      state.lastError = preservedError;
      state.currentRun = preservedRun;
      state.contextUsage = preservedContextUsage;
      state.contextUsageConversationId = preservedContextUsageConversationId;
      state.contextUsageMeta = preservedContextUsageMeta;
    },
  },
  extraReducers: builder => {
    builder.addCase(logout, () => initialState);
  },
});

// Selector：从 streamSlice 组装出当前流式 content blocks 数组
// thinking blocks 全量返回（实时显示），text blocks 按 displayedTextLength 截断（打字机效果）
export function selectStreamContentBlocks(state: StreamState): ContentBlock[] {
  let remainingChars = state.displayedTextLength;
  const blocks: ContentBlock[] = [...state.staticBlocks];

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
  const blocks: ContentBlock[] = [...state.staticBlocks];

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
  applyPlanSnapshot,
  clearStreamError,
  completeThinkingPhase,
  endStream,
  finalizeRun,
  finalizeStep,
  finalizeToolCall,
  initRun,
  markLimitReached,
  mergeToolCallDelta,
  migrateStreamConversation,
  pushStep,
  pushToolCall,
  setLastEntryId,
  setStreamError,
  setStreamStatus,
  startStream,
  updatePlanStep,
  updateRunProgress,
  updateContextUsage,
  upsertEvidenceItem,
  upsertToolDigest,
} = streamSlice.actions;

export default streamSlice.reducer;
