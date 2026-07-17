import { describe, it, expect } from 'vitest';
import streamSliceReducer, {
  startStream,
  applyPlanSnapshot,
  initRun,
  updatePlanStep,
  updateRunProgress,
  upsertEvidenceItem,
  upsertToolDigest,
  pushStep,
  pushToolCall,
  mergeToolCallDelta,
  finalizeToolCall,
  finalizeStep,
  markLimitReached,
  finalizeRun,
  appendTextDelta,
  appendThinkingDelta,
  advanceTypewriter,
  endStream,
  selectStreamContentBlocks,
  selectFullStreamContentBlocks,
  setLastEntryId,
  setStreamStatus,
  updateContextUsage,
  upsertStaticContentBlock,
} from './streamSlice';

const reducer = streamSliceReducer;

function initial() {
  return reducer(undefined, { type: '@@INIT' });
}

const baseConfig = { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 };

function planStatus(state: ReturnType<typeof initial>, id: string) {
  return state.currentRun?.plan?.items.find(item => item.id === id)?.status;
}

describe('streamSlice — content blocks selector', () => {
  it('在模型正文到达前 upsert 结构化结果块，并按 id 替换而不重复', () => {
    let state = reducer(initial(), startStream({ conversationId: 'c1', messageId: 'm1' }));
    state = reducer(state, initRun({
      runId: 'r1',
      messageId: 'm1',
      config: baseConfig,
      sequence: 0,
    }));
    state = reducer(state, upsertStaticContentBlock({
      runId: 'r1',
      sequence: 1,
      block: {
        type: 'place_results',
        id: 'places-1',
        schema_version: 1,
        provider: 'amap',
        query: '烤肉',
        status: 'success',
        result_count: 1,
        places: [{ provider_place_id: 'p1', name: '第一家烤肉' }],
        limitations: [],
      },
    }));

    expect(selectStreamContentBlocks(state)).toEqual([
      expect.objectContaining({ type: 'place_results', id: 'places-1', result_count: 1 }),
    ]);

    state = reducer(state, upsertStaticContentBlock({
      runId: 'r1',
      sequence: 2,
      block: {
        type: 'place_results',
        id: 'places-1',
        schema_version: 1,
        provider: 'amap',
        query: '烤肉',
        status: 'success',
        result_count: 2,
        places: [
          { provider_place_id: 'p1', name: '第一家烤肉' },
          { provider_place_id: 'p2', name: '第二家烤肉' },
        ],
        limitations: [],
      },
    }));
    state = reducer(state, appendTextDelta({ blockId: 'text-1', delta: '推荐如下。' }));
    state = reducer(state, advanceTypewriter(5));

    const blocks = selectStreamContentBlocks(state);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: 'place_results', id: 'places-1', result_count: 2 });
    expect(blocks[1]).toEqual({ type: 'text', id: 'text-1', text: '推荐如下。' });
  });

  it('相同 stream 状态重复选择时复用结果引用', () => {
    let state = reducer(initial(), startStream({ conversationId: 'c1', messageId: 'm1' }));
    state = reducer(state, appendTextDelta({ blockId: 'text-1', delta: '流式' }));
    state = reducer(state, advanceTypewriter(2));

    const first = selectStreamContentBlocks(state);
    const second = selectStreamContentBlocks(state);

    expect(second).toBe(first);
    expect(second).toEqual([{ type: 'text', id: 'text-1', text: '流式' }]);

    state = reducer(state, appendTextDelta({ blockId: 'text-1', delta: '回答' }));
    state = reducer(state, advanceTypewriter(2));
    const updated = selectStreamContentBlocks(state);

    expect(updated).not.toBe(first);
    expect(updated).toEqual([{ type: 'text', id: 'text-1', text: '流式回答' }]);
  });

  it('A→B→A 交错选择时复用各自引用且不串值', () => {
    const stateA = reducer(initial(), startStream({
      conversationId: 'c-a',
      messageId: 'm-a',
      staticBlocks: [{ type: 'text', id: 'static-a', text: '回答 A' }],
    }));
    const stateB = reducer(initial(), startStream({
      conversationId: 'c-b',
      messageId: 'm-b',
      staticBlocks: [{ type: 'text', id: 'static-b', text: '回答 B' }],
    }));

    const firstA = selectStreamContentBlocks(stateA);
    const selectedB = selectStreamContentBlocks(stateB);
    const secondA = selectStreamContentBlocks(stateA);

    expect(secondA).toBe(firstA);
    expect(secondA).toEqual([{ type: 'text', id: 'static-a', text: '回答 A' }]);
    expect(selectedB).not.toBe(firstA);
    expect(selectedB).toEqual([{ type: 'text', id: 'static-b', text: '回答 B' }]);
  });

  it('static、thinking 或 typewriter 输入变化时生成新引用并返回正确内容', () => {
    const baseState = reducer(initial(), startStream({
      conversationId: 'c1',
      messageId: 'm1',
      staticBlocks: [{ type: 'text', id: 'static-1', text: '历史回答' }],
    }));
    const baseBlocks = selectStreamContentBlocks(baseState);

    const staticChangedState = {
      ...baseState,
      staticBlocks: [{ type: 'text' as const, id: 'static-2', text: '恢复后的回答' }],
    };
    const staticChangedBlocks = selectStreamContentBlocks(staticChangedState);
    expect(staticChangedBlocks).not.toBe(baseBlocks);
    expect(staticChangedBlocks).toEqual([
      { type: 'text', id: 'static-2', text: '恢复后的回答' },
    ]);

    let thinkingState = reducer(staticChangedState, appendThinkingDelta({
      blockId: 'thinking-1',
      delta: '第一步',
    }));
    const firstThinkingBlocks = selectStreamContentBlocks(thinkingState);
    thinkingState = reducer(thinkingState, appendThinkingDelta({
      blockId: 'thinking-1',
      delta: '继续思考',
    }));
    const updatedThinkingBlocks = selectStreamContentBlocks(thinkingState);
    expect(updatedThinkingBlocks).not.toBe(firstThinkingBlocks);
    expect(updatedThinkingBlocks).toEqual([
      { type: 'text', id: 'static-2', text: '恢复后的回答' },
      { type: 'thinking', id: 'thinking-1', thinking: '第一步继续思考' },
    ]);

    const textPendingState = reducer(thinkingState, appendTextDelta({
      blockId: 'text-1',
      delta: '新回答',
    }));
    const beforeTypewriterBlocks = selectStreamContentBlocks(textPendingState);
    const typewriterState = reducer(textPendingState, advanceTypewriter(3));
    const afterTypewriterBlocks = selectStreamContentBlocks(typewriterState);
    expect(afterTypewriterBlocks).not.toBe(beforeTypewriterBlocks);
    expect(afterTypewriterBlocks).toEqual([
      { type: 'text', id: 'static-2', text: '恢复后的回答' },
      { type: 'thinking', id: 'thinking-1', thinking: '第一步继续思考' },
      { type: 'text', id: 'text-1', text: '新回答' },
    ]);
  });
});

describe('streamSlice — agent run timeline', () => {
  it('estimated 只进入 in-flight，final actual 才原子替换 confirmed', () => {
    let state = reducer(initial(), startStream({ conversationId: 'chat-a', messageId: 'msg-a' }));
    state = reducer(state, updateContextUsage({
      conversationId: 'chat-a',
      usage: {
        status: 'no_op',
        window_tokens: 1000,
        estimated_tokens_before: 400,
        estimated_tokens_after: 400,
        actual_prompt_tokens: null,
        removed_turns: 0,
        removed_messages: 0,
        removed_tool_transactions: 0,
        round_index: 1,
      },
      runId: 'run-a',
      messageId: 'server-msg-a',
      sequence: 1,
      phase: 'estimated',
    }));
    expect(state.contextUsage).toBeNull();
    expect(state.contextUsageInFlight).toMatchObject({
      estimated_tokens_after: 400,
      actual_prompt_tokens: null,
    });
    expect(state.contextUsageInFlightMeta).toMatchObject({ phase: 'estimated', roundIndex: 1 });

    state = reducer(state, updateContextUsage({
      conversationId: 'chat-a',
      usage: {
        status: 'no_op',
        window_tokens: 1000,
        estimated_tokens_before: 400,
        estimated_tokens_after: 400,
        actual_prompt_tokens: 410,
        removed_turns: 0,
        removed_messages: 0,
        removed_tool_transactions: 0,
        round_index: 1,
      },
      runId: 'run-a',
      messageId: 'server-msg-a',
      sequence: 2,
      phase: 'final',
    }));

    expect(state.contextUsage?.actual_prompt_tokens).toBe(410);
    expect(state.contextUsageMeta).toMatchObject({ phase: 'final', roundIndex: 1 });
    expect(state.contextUsageInFlightMeta).toMatchObject({ phase: 'final', roundIndex: 1 });
    state = reducer(state, endStream());
    expect(state.contextUsage?.actual_prompt_tokens).toBe(410);
    expect(state.contextUsageInFlight?.actual_prompt_tokens).toBe(410);
    expect(state.conversationId).toBeNull();
    expect(state.contextUsageConversationId).toBe('chat-a');

    state = reducer(state, startStream({ conversationId: 'chat-b', messageId: 'msg-b' }));
    expect(state.contextUsage).toBeNull();
    expect(state.contextUsageInFlight).toBeNull();
  });

  it('拒绝迟到的其他会话上下文事件', () => {
    let state = reducer(initial(), startStream({ conversationId: 'chat-a', messageId: 'msg-a' }));
    state = reducer(state, updateContextUsage({
      conversationId: 'chat-b',
      usage: {
        status: 'no_op',
        window_tokens: 1000,
        estimated_tokens_before: 400,
        estimated_tokens_after: 400,
        actual_prompt_tokens: null,
        removed_turns: 0,
        removed_messages: 0,
        removed_tool_transactions: 0,
        round_index: 1,
      },
      runId: 'run-b',
      messageId: 'server-msg-b',
      sequence: 1,
      phase: 'estimated',
    }));
    expect(state.contextUsage).toBeNull();
    expect(state.contextUsageInFlight).toBeNull();
  });

  it('同一 run 按 sequence replace 且 final 优先，重连重放不得倒退', () => {
    let state = reducer(initial(), startStream({ conversationId: 'chat-a', messageId: 'msg-a' }));
    const usage = {
      status: 'no_op',
      window_tokens: 1000,
      estimated_tokens_before: 400,
      estimated_tokens_after: 400,
      actual_prompt_tokens: null,
      removed_turns: 0,
      removed_messages: 0,
      removed_tool_transactions: 0,
      round_index: 1,
    };
    state = reducer(state, updateContextUsage({
      conversationId: 'chat-a', usage: { ...usage, actual_prompt_tokens: 410 },
      runId: 'run-a', messageId: 'server-msg-a', sequence: 5, phase: 'final',
    }));
    state = reducer(state, updateContextUsage({
      conversationId: 'chat-a', usage: { ...usage, actual_prompt_tokens: 999 },
      runId: 'run-a', messageId: 'server-msg-a', sequence: 4, phase: 'final',
    }));
    state = reducer(state, updateContextUsage({
      conversationId: 'chat-a', usage: { ...usage, actual_prompt_tokens: null },
      runId: 'run-a', messageId: 'server-msg-a', sequence: 6, phase: 'estimated',
    }));

    expect(state.contextUsage?.actual_prompt_tokens).toBe(410);
    expect(state.contextUsageMeta).toMatchObject({ sequence: 5, phase: 'final', roundIndex: 1 });
    expect(state.contextUsageInFlightMeta).toMatchObject({ sequence: 5, phase: 'final', roundIndex: 1 });

    state = reducer(state, updateContextUsage({
      conversationId: 'chat-a',
      usage: { ...usage, round_index: 2, estimated_tokens_after: 430 },
      runId: 'run-a', messageId: 'server-msg-a', sequence: 7, phase: 'estimated',
    }));
    expect(state.contextUsage).toMatchObject({
      round_index: 1,
      actual_prompt_tokens: 410,
    });
    expect(state.contextUsageInFlight).toMatchObject({
      round_index: 2,
      estimated_tokens_after: 430,
      actual_prompt_tokens: null,
    });
    expect(state.contextUsageMeta).toMatchObject({ sequence: 5, phase: 'final', roundIndex: 1 });
    expect(state.contextUsageInFlightMeta).toMatchObject({ sequence: 7, phase: 'estimated', roundIndex: 2 });

    state = reducer(state, updateContextUsage({
      conversationId: 'chat-a',
      usage: { ...usage, round_index: 2, estimated_tokens_after: 430 },
      runId: 'run-a', messageId: 'server-msg-a', sequence: 8, phase: 'final',
    }));
    expect(state.contextUsage).toMatchObject({
      round_index: 1,
      actual_prompt_tokens: 410,
    });
    expect(state.contextUsageInFlightMeta).toMatchObject({ sequence: 8, phase: 'final', roundIndex: 2 });
  });
  it('initRun 创建 currentRun (status=running, lastSequence=0)', () => {
    const state = reducer(initial(), initRun({
      runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0,
    }));
    expect(state.currentRun?.runId).toBe('r1');
    expect(state.currentRun?.status).toBe('running');
    expect(state.currentRun?.lastSequence).toBe(0);
    expect(state.currentRun?.steps).toHaveLength(0);
    expect(state.currentRun?.evidence).toEqual([]);
    expect(state.currentRun?.toolDigests).toEqual([]);
  });

  it('updateRunProgress 写入 progress 并按 sequence 幂等', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, updateRunProgress({
      runId: 'r1',
      sequence: 1,
      progress: { phase: 'researching', label: '正在搜索相关资料', completedSteps: 1, totalSteps: 4 },
    }));
    s = reducer(s, updateRunProgress({
      runId: 'r1',
      sequence: 1,
      progress: { phase: 'answering', label: '旧事件不应覆盖' },
    }));

    expect(s.currentRun?.progress?.label).toBe('正在搜索相关资料');
    expect(s.currentRun?.lastSequence).toBe(1);
  });

  it('plan reducers 按 revision 更新并忽略旧 revision', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, applyPlanSnapshot({
      runId: 'r1',
      sequence: 1,
      plan: { planId: 'plan-r1', revision: 2, items: [] },
    }));
    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 2,
      planId: 'plan-r1',
      revision: 2,
      item: { id: 'search', title: '搜索资料', status: 'running', kind: 'search', toolNames: [], evidenceItemIds: [] },
    }));
    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 3,
      planId: 'plan-r1',
      revision: 3,
      item: { id: 'search', title: '搜索资料', status: 'completed', kind: 'search', toolNames: ['web_search'], evidenceItemIds: ['ev-1'] },
    }));

    expect(s.currentRun?.plan?.revision).toBe(3);
    expect(s.currentRun?.plan?.items).toHaveLength(1);
    expect(s.currentRun?.plan?.items[0].status).toBe('completed');
  });

  it('agent plan v2 实时推进搜索、读取、整理回答状态', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, applyPlanSnapshot({
      runId: 'r1',
      sequence: 1,
      plan: {
        planId: 'plan-r1',
        revision: 1,
        items: [
          { id: 'understand', title: '理解问题', status: 'running', kind: 'reasoning', toolNames: [], evidenceItemIds: [] },
          { id: 'search', title: '查找资料', status: 'pending', kind: 'search', toolNames: ['web_search'], evidenceItemIds: [] },
          { id: 'read', title: '读取关键来源', status: 'pending', kind: 'read', toolNames: ['web_search'], evidenceItemIds: [] },
          { id: 'answer', title: '整理回答', status: 'pending', kind: 'answer', toolNames: [], evidenceItemIds: [] },
        ],
      },
    }));
    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 2,
      planId: 'plan-r1',
      revision: 3,
      item: { id: 'understand', title: '理解问题', status: 'completed', kind: 'reasoning', toolNames: [], evidenceItemIds: [] },
    }));
    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 3,
      planId: 'plan-r1',
      revision: 4,
      item: { id: 'search', title: '查找资料', status: 'running', kind: 'search', toolNames: [], evidenceItemIds: [] },
    }));
    s = reducer(s, updateRunProgress({
      runId: 'r1',
      sequence: 4,
      progress: {
        phase: 'researching',
        label: '正在查找资料',
        completedSteps: 1,
        completedToolCalls: 0,
        maxToolCalls: 20,
      },
    }));

    expect(planStatus(s, 'understand')).toBe('completed');
    expect(planStatus(s, 'search')).toBe('running');
    expect(planStatus(s, 'read')).toBe('pending');
    expect(s.currentRun?.progress).toMatchObject({ phase: 'researching', completedToolCalls: 0, maxToolCalls: 20 });

    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 5,
      planId: 'plan-r1',
      revision: 5,
      item: { id: 'search', title: '查找资料', status: 'completed', kind: 'search', toolNames: ['web_search'], evidenceItemIds: [] },
    }));
    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 6,
      planId: 'plan-r1',
      revision: 6,
      item: { id: 'read', title: '读取关键来源', status: 'running', kind: 'read', toolNames: [], evidenceItemIds: [] },
    }));
    s = reducer(s, updateRunProgress({
      runId: 'r1',
      sequence: 7,
      progress: {
        phase: 'reading',
        label: '正在读取关键来源',
        completedSteps: 2,
        completedToolCalls: 1,
        maxToolCalls: 20,
      },
    }));

    expect(planStatus(s, 'search')).toBe('completed');
    expect(planStatus(s, 'read')).toBe('running');
    expect(planStatus(s, 'answer')).toBe('pending');
    expect(s.currentRun?.progress).toMatchObject({ phase: 'reading', completedToolCalls: 1, maxToolCalls: 20 });

    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 8,
      planId: 'plan-r1',
      revision: 7,
      item: { id: 'read', title: '读取关键来源', status: 'completed', kind: 'read', toolNames: [], evidenceItemIds: [] },
    }));
    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 9,
      planId: 'plan-r1',
      revision: 8,
      item: { id: 'answer', title: '整理回答', status: 'running', kind: 'answer', toolNames: [], evidenceItemIds: [] },
    }));
    s = reducer(s, updateRunProgress({
      runId: 'r1',
      sequence: 10,
      progress: {
        phase: 'synthesizing',
        label: '正在整理回答',
        completedSteps: 3,
        completedToolCalls: 1,
        maxToolCalls: 20,
      },
    }));

    expect(planStatus(s, 'read')).toBe('completed');
    expect(planStatus(s, 'answer')).toBe('running');

    s = reducer(s, updatePlanStep({
      runId: 'r1',
      sequence: 11,
      planId: 'plan-r1',
      revision: 9,
      item: { id: 'answer', title: '整理回答', status: 'completed', kind: 'answer', toolNames: [], evidenceItemIds: [] },
    }));
    s = reducer(s, updateRunProgress({
      runId: 'r1',
      sequence: 12,
      progress: {
        phase: 'answering',
        label: '已完成回答整理',
        completedSteps: 4,
        completedToolCalls: 1,
        maxToolCalls: 20,
      },
    }));

    expect(planStatus(s, 'answer')).toBe('completed');
    expect(s.currentRun?.progress).toMatchObject({
      phase: 'answering',
      completedSteps: 4,
      completedToolCalls: 1,
      maxToolCalls: 20,
    });
  });

  it('upsertEvidenceItem 和 upsertToolDigest 不重复', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, upsertEvidenceItem({
      runId: 'r1',
      sequence: 1,
      evidence: { id: 'ev-1', kind: 'web', status: 'candidate', title: '来源', claim: '发现', usedByFinalAnswer: false },
    }));
    s = reducer(s, upsertEvidenceItem({
      runId: 'r1',
      sequence: 2,
      evidence: { id: 'ev-1', kind: 'web', status: 'used', title: '来源', claim: '已采用', usedByFinalAnswer: true },
    }));
    s = reducer(s, upsertToolDigest({
      runId: 'r1',
      sequence: 3,
      digest: {
        toolCallId: 'tc1',
        toolName: 'web_search',
        status: 'success',
        title: '找到结果',
        summary: '摘要',
        keyFindings: [],
        sourceRefs: ['ev-1'],
        truncated: false,
      },
    }));

    expect(s.currentRun?.evidence).toHaveLength(1);
    expect(s.currentRun?.evidence?.[0].status).toBe('used');
    expect(s.currentRun?.toolDigests).toHaveLength(1);
  });

  it('upsertEvidenceItem 接收 selected/read_success evidence 状态', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, upsertEvidenceItem({
      runId: 'r1',
      sequence: 1,
      evidence: {
        id: 'ev-web-1',
        kind: 'web',
        status: 'selected',
        title: '建议深读来源',
        url: 'https://example.com/report',
        claim: '建议深读：官方来源',
        usedByFinalAnswer: false,
      },
    }));
    s = reducer(s, upsertEvidenceItem({
      runId: 'r1',
      sequence: 2,
      evidence: {
        id: 'ev-web-1',
        kind: 'web',
        status: 'read_success',
        title: '已读取来源',
        url: 'https://example.com/report',
        claim: '已读取网页内容。',
        usedByFinalAnswer: false,
      },
    }));

    expect(s.currentRun?.evidence).toHaveLength(1);
    expect(s.currentRun?.evidence?.[0].status).toBe('read_success');
  });

  it('pushStep 添加 running step + 更新 totalSteps', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    expect(s.currentRun?.steps).toHaveLength(1);
    expect(s.currentRun?.steps[0].status).toBe('running');
    expect(s.currentRun?.totalSteps).toBe(1);
  });

  it('pushToolCall 挂到对应 step + 累加 totalToolCalls', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { q: 'x' }, sequence: 2,
    }));
    expect(s.currentRun?.steps[0].toolCalls).toHaveLength(1);
    expect(s.currentRun?.steps[0].toolCalls[0].status).toBe('running');
    expect(s.currentRun?.totalToolCalls).toBe(1);
  });

  it('mergeToolCallDelta 浅合并字段不覆盖 status', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: {}, sequence: 2,
    }));
    s = reducer(s, mergeToolCallDelta({
      runId: 'r1', toolCallId: 't1',
      delta: { resultSummary: { kind: 'search', truncated: false } } as Record<string, unknown>,
      sequence: 3,
    }));
    expect(s.currentRun?.steps[0].toolCalls[0].status).toBe('running');
    expect((s.currentRun?.steps[0].toolCalls[0] as unknown as Record<string, unknown>).resultSummary).toEqual({ kind: 'search', truncated: false });
  });

  it('finalizeToolCall 把 running → success + 写 resultSummary', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: {}, sequence: 2,
    }));
    s = reducer(s, finalizeToolCall({
      runId: 'r1', toolCallId: 't1',
      status: 'success', durationMs: 42,
      resultSummary: { kind: 'search', count: 5, truncated: false },
      sequence: 3,
    }));
    expect(s.currentRun?.steps[0].toolCalls[0].status).toBe('success');
    expect(s.currentRun?.steps[0].toolCalls[0].resultSummary?.count).toBe(5);
  });

  it('finalizeStep 把 step → completed + completedAt', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, finalizeStep({ runId: 'r1', stepId: 's1', sequence: 2 }));
    expect(s.currentRun?.steps[0].status).toBe('completed');
    expect(s.currentRun?.steps[0].completedAt).toBeDefined();
  });

  it('markLimitReached 写 reason 不改 run.status', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, markLimitReached({ runId: 'r1', reason: 'max_steps', sequence: 5 }));
    expect(s.currentRun?.status).toBe('running');
    expect(s.currentRun?.limitReachedReason).toBe('max_steps');
  });

  it('finalizeRun completed', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'completed', sequence: 99 }));
    expect(s.currentRun?.status).toBe('completed');
  });

  it('finalizeRun limit_reached', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, markLimitReached({ runId: 'r1', reason: 'timeout', sequence: 5 }));
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'limit_reached', sequence: 6 }));
    expect(s.currentRun?.status).toBe('limit_reached');
    expect(s.currentRun?.limitReachedReason).toBe('timeout');
  });

  it('finalizeRun failed 把当前 running step 标 failed', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, finalizeRun({
      runId: 'r1', status: 'failed',
      failure: { code: 'X', message: 'boom' },
      sequence: 2,
    }));
    expect(s.currentRun?.status).toBe('failed');
    expect(s.currentRun?.failure?.code).toBe('X');
    expect(s.currentRun?.steps[0].status).toBe('failed');
  });

  it('finalizeRun interrupted 把当前 running step 标 interrupted', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'interrupted', sequence: 2 }));
    expect(s.currentRun?.steps[0].status).toBe('interrupted');
  });

  it('幂等：sequence ≤ lastSequence 时 noop', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 5 }));
    const before = s;
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's2', stepNumber: 2, sequence: 5 }));
    expect(s).toEqual(before);
  });

  it('reasoning 带 stepId 时挂到 step.contentBlockIds', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, appendThinkingDelta({
      blockId: 'b1', delta: '思考中', runId: 'r1', stepId: 's1',
    }));
    expect(s.currentRun?.steps[0].contentBlockIds).toContain('b1');
  });

  it('reasoning 缺失 stepId 时只入 textBlocks 不挂 step (defensive no-op)', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, appendThinkingDelta({ blockId: 'b1', delta: '裸 thinking' }));
    expect(s.currentRun?.steps[0].contentBlockIds).toHaveLength(0);
    expect(s.thinkingBlocks['b1']).toBe('裸 thinking');
  });

  it('startStream 清空 currentRun 和上一轮续传游标，并进入 streaming', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, setLastEntryId('99-1'));
    s = reducer(s, setStreamStatus('reconnecting'));
    s = reducer(s, startStream({ conversationId: 'c2', messageId: 'm2' }));
    expect(s.currentRun).toBeNull();
    expect(s.lastEntryId).toBe('0');
    expect(s.streamStatus).toBe('streaming');
  });

  it('appendTextDelta 带 stepId 时挂到 step.contentBlockIds', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, appendTextDelta({
      blockId: 'b_text', delta: 'answer', runId: 'r1', stepId: 's1',
    }));
    expect(s.currentRun?.steps[0].contentBlockIds).toContain('b_text');
    expect(s.textBlocks['b_text']).toBe('answer');
  });

  it('mergeToolCallDelta 不允许 BE delta 覆盖 status / toolCallId / toolName', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { q: 'x' }, sequence: 2,
    }));
    // 恶意 / 未来 BE 误发 delta 包含 status/toolCallId/toolName
    s = reducer(s, mergeToolCallDelta({
      runId: 'r1', toolCallId: 't1',
      delta: {
        status: 'failed',           // 应被忽略
        toolCallId: 'EVIL_ID',      // 应被忽略
        toolName: 'rogue_tool',     // 应被忽略
        startedAt: 0,               // 应被忽略
      } as Record<string, unknown>,
      sequence: 3,
    }));
    const tc = s.currentRun?.steps[0].toolCalls[0];
    expect(tc?.status).toBe('running');
    expect(tc?.toolCallId).toBe('t1');
    expect(tc?.toolName).toBe('web_search');
  });

  it('mergeToolCallDelta 允许 resultSummary / arguments 被 delta 覆盖', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { q: 'x' }, sequence: 2,
    }));
    s = reducer(s, mergeToolCallDelta({
      runId: 'r1', toolCallId: 't1',
      delta: {
        resultSummary: { kind: 'search', count: 3, truncated: false },
        arguments: { q: 'updated' },
      } as Record<string, unknown>,
      sequence: 3,
    }));
    const tc = s.currentRun?.steps[0].toolCalls[0];
    expect(tc?.resultSummary?.count).toBe(3);
    expect(tc?.arguments).toEqual({ q: 'updated' });
  });

  it('pushStep runId 不匹配时 noop（防 guard 被简化）', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r2', stepId: 's1', stepNumber: 1, sequence: 1 }));
    expect(s.currentRun?.steps).toHaveLength(0);
    expect(s.currentRun?.runId).toBe('r1');  // 仍是原 run
  });

  it('finalizeRun runId 不匹配时 noop', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, finalizeRun({ runId: 'r2', status: 'completed', sequence: 99 }));
    expect(s.currentRun?.status).toBe('running');  // 状态不变
  });

  it('initRun 同 runId 重放幂等：sequence ≤ lastSequence 时不清空 timeline', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: {}, sequence: 2,
    }));
    // 模拟重连重放 run_started(sequence=0)
    s = reducer(s, initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    // 已建 timeline 不被清空
    expect(s.currentRun?.steps).toHaveLength(1);
    expect(s.currentRun?.steps[0].toolCalls).toHaveLength(1);
  });

  it('initRun 不同 runId 时允许重建（新 run 覆盖旧）', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    // 新 run 启动
    s = reducer(s, initRun({ runId: 'r2', messageId: 'm2', config: baseConfig, sequence: 0 }));
    expect(s.currentRun?.runId).toBe('r2');
    expect(s.currentRun?.steps).toHaveLength(0);
  });

  it('totalToolCalls 跨多 step 累加（不绑定单 step.toolCalls.length）', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: {}, sequence: 2,
    }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't2',
      toolName: 'url_read', arguments: {}, sequence: 3,
    }));
    s = reducer(s, finalizeStep({ runId: 'r1', stepId: 's1', sequence: 4 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's2', stepNumber: 2, sequence: 5 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's2', toolCallId: 't3',
      toolName: 'web_search', arguments: {}, sequence: 6,
    }));
    expect(s.currentRun?.totalToolCalls).toBe(3);
    expect(s.currentRun?.steps[0].toolCalls).toHaveLength(2);
    expect(s.currentRun?.steps[1].toolCalls).toHaveLength(1);
  });

  it('initRun 写入 messageId 和 serverMessageId', () => {
    const s = reducer(initial(), initRun({
      runId: 'r1',
      messageId: 'local-placeholder-1',
      serverMessageId: 'server-msg-uuid',
      config: baseConfig,
      sequence: 0,
    }));
    expect(s.currentRun?.messageId).toBe('local-placeholder-1');
    expect(s.currentRun?.serverMessageId).toBe('server-msg-uuid');
  });

  it('endStream 保留 currentRun（跨流生命周期）', () => {
    let s = reducer(initial(), initRun({
      runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0,
    }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, endStream());
    expect(s.currentRun).not.toBeNull();
    expect(s.currentRun?.runId).toBe('r1');
    expect(s.currentRun?.steps).toHaveLength(1);
    // 但其它 streaming-only 字段应清空
    expect(s.isStreaming).toBe(false);
    expect(s.textBlocks).toEqual({});
  });

  it('startStream 清空 currentRun（新轮发送不复用旧 timeline）', () => {
    let s = reducer(initial(), initRun({
      runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0,
    }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, startStream({ conversationId: 'c2', messageId: 'm2' }));
    expect(s.currentRun).toBeNull();
  });

  it('continuation 旧 blocks 保留在新 delta 前', () => {
    let s = reducer(initial(), startStream({
      conversationId: 'c1',
      messageId: 'm1',
      staticBlocks: [{ type: 'text', id: 'old-text', text: '旧回答' }],
    }));

    s = reducer(s, appendTextDelta({
      blockId: 'new-text',
      delta: '新补充',
      runId: 'r2',
      stepId: 's1',
    }));

    expect(selectFullStreamContentBlocks(s)).toEqual([
      { type: 'text', id: 'old-text', text: '旧回答' },
      { type: 'text', id: 'new-text', text: '新补充' },
    ]);
  });
});

describe('streamSlice — interrupted 派生（contract §3）', () => {
  it('finalizeRun(status=interrupted) 把 running step 派生为 interrupted', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'interrupted', sequence: 2 }));
    expect(s.currentRun?.status).toBe('interrupted');
    expect(s.currentRun?.steps[0].status).toBe('interrupted');
    expect(s.currentRun?.steps[0].completedAt).toBeGreaterThan(0);
  });

  it('finalizeRun(status=interrupted) 把 running tool call 派生为 interrupted', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { q: 'x' }, sequence: 2,
    }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't2',
      toolName: 'url_read', arguments: { url: 'https://x' }, sequence: 3,
    }));
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'interrupted', sequence: 4 }));
    expect(s.currentRun?.steps[0].toolCalls[0].status).toBe('interrupted');
    expect(s.currentRun?.steps[0].toolCalls[1].status).toBe('interrupted');
    expect(s.currentRun?.steps[0].toolCalls[0].completedAt).toBeGreaterThan(0);
  });

  it('finalizeRun(status=interrupted) 不影响已完成的 step / tool call', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { q: 'x' }, sequence: 2,
    }));
    s = reducer(s, finalizeToolCall({
      runId: 'r1', toolCallId: 't1', status: 'success', durationMs: 10, sequence: 3,
    }));
    s = reducer(s, finalizeStep({ runId: 'r1', stepId: 's1', sequence: 4 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's2', stepNumber: 2, sequence: 5 }));
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'interrupted', sequence: 6 }));
    expect(s.currentRun?.steps[0].status).toBe('completed');
    expect(s.currentRun?.steps[0].toolCalls[0].status).toBe('success');
    expect(s.currentRun?.steps[1].status).toBe('interrupted');
  });

  it('finalizeRun(status=completed) 不派生 interrupted（防御性回归测试）', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { q: 'x' }, sequence: 2,
    }));
    // 此时 step + tool call 都是 running，run 直接 completed（不太合理但要防御）
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'completed', sequence: 3 }));
    expect(s.currentRun?.status).toBe('completed');
    // step / tool call 应保持 running 不被派生为 interrupted
    expect(s.currentRun?.steps[0].status).toBe('running');
    expect(s.currentRun?.steps[0].toolCalls[0].status).toBe('running');
  });

  // codex review: failed 路径之前只标 lastStep，不扫 running tool call，
  // tool 在 started 之后失败时 chip 会一直转。回归测：finalizeRun(failed) 后
  // 所有 running tool call 必须被标为 failed + completedAt 写入。
  it('finalizeRun(status=failed) 把 running step 和 running tool call 都派生为 failed', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { q: 'x' }, sequence: 2,
    }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't2',
      toolName: 'url_read', arguments: { url: 'https://x' }, sequence: 3,
    }));
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'failed', sequence: 4 }));
    expect(s.currentRun?.status).toBe('failed');
    expect(s.currentRun?.steps[0].status).toBe('failed');
    expect(s.currentRun?.steps[0].toolCalls[0].status).toBe('failed');
    expect(s.currentRun?.steps[0].toolCalls[1].status).toBe('failed');
    expect(s.currentRun?.steps[0].toolCalls[0].completedAt).toBeGreaterThan(0);
  });

  it('finalizeRun(status=failed) 不影响已完成的 tool call（只改 running 的）', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't1',
      toolName: 'web_search', arguments: { q: 'x' }, sequence: 2,
    }));
    s = reducer(s, finalizeToolCall({
      runId: 'r1', toolCallId: 't1', status: 'success', durationMs: 10, sequence: 3,
    }));
    s = reducer(s, pushToolCall({
      runId: 'r1', stepId: 's1', toolCallId: 't2',
      toolName: 'url_read', arguments: { url: 'https://x' }, sequence: 4,
    }));
    s = reducer(s, finalizeRun({ runId: 'r1', status: 'failed', sequence: 5 }));
    // t1 已 success，不应被改成 failed
    expect(s.currentRun?.steps[0].toolCalls[0].status).toBe('success');
    // t2 还在 running，应被派生为 failed
    expect(s.currentRun?.steps[0].toolCalls[1].status).toBe('failed');
  });
});

describe('streamSlice — contentBlockIds 关联（contract §6.5 defensive）', () => {
  it('appendTextDelta 首次 delta 带 stepId 时挂 contentBlockIds', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, appendTextDelta({ blockId: 'blk_1', delta: 'hello', runId: 'r1', stepId: 's1' }));
    expect(s.currentRun?.steps[0].contentBlockIds).toEqual(['blk_1']);
  });

  it('appendTextDelta 首次 delta 不带 stepId，后续 delta 带 stepId 也能挂 contentBlockIds（关键 bug 修复）', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    // 第一次 delta 不带 stepId
    s = reducer(s, appendTextDelta({ blockId: 'blk_1', delta: 'hello', runId: 'r1' }));
    expect(s.currentRun?.steps[0].contentBlockIds).toEqual([]);
    // 第二次 delta 带 stepId
    s = reducer(s, appendTextDelta({ blockId: 'blk_1', delta: ' world', runId: 'r1', stepId: 's1' }));
    expect(s.currentRun?.steps[0].contentBlockIds).toEqual(['blk_1']);
  });

  it('appendTextDelta 多次带 stepId 不会重复挂 contentBlockIds', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, appendTextDelta({ blockId: 'blk_1', delta: 'a', runId: 'r1', stepId: 's1' }));
    s = reducer(s, appendTextDelta({ blockId: 'blk_1', delta: 'b', runId: 'r1', stepId: 's1' }));
    s = reducer(s, appendTextDelta({ blockId: 'blk_1', delta: 'c', runId: 'r1', stepId: 's1' }));
    expect(s.currentRun?.steps[0].contentBlockIds).toEqual(['blk_1']);
  });

  it('appendThinkingDelta 首次 delta 不带 stepId，后续带 stepId 也能挂 contentBlockIds', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, appendThinkingDelta({ blockId: 'blk_t', delta: '...', runId: 'r1' }));
    expect(s.currentRun?.steps[0].contentBlockIds).toEqual([]);
    s = reducer(s, appendThinkingDelta({ blockId: 'blk_t', delta: '...', runId: 'r1', stepId: 's1' }));
    expect(s.currentRun?.steps[0].contentBlockIds).toEqual(['blk_t']);
  });
});
