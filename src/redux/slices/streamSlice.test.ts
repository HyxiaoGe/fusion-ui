import { describe, it, expect } from 'vitest';
import streamSliceReducer, {
  startStream,
  initRun,
  pushStep,
  pushToolCall,
  mergeToolCallDelta,
  finalizeToolCall,
  finalizeStep,
  markLimitReached,
  finalizeRun,
  appendTextDelta,
  appendThinkingDelta,
  endStream,
} from './streamSlice';

const reducer = streamSliceReducer;

function initial() {
  return reducer(undefined, { type: '@@INIT' });
}

const baseConfig = { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 };

describe('streamSlice — agent run timeline', () => {
  it('initRun 创建 currentRun (status=running, lastSequence=0)', () => {
    const state = reducer(initial(), initRun({
      runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0,
    }));
    expect(state.currentRun?.runId).toBe('r1');
    expect(state.currentRun?.status).toBe('running');
    expect(state.currentRun?.lastSequence).toBe(0);
    expect(state.currentRun?.steps).toHaveLength(0);
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

  it('startStream 清空 currentRun', () => {
    let s = reducer(initial(), initRun({ runId: 'r1', messageId: 'm1', config: baseConfig, sequence: 0 }));
    s = reducer(s, pushStep({ runId: 'r1', stepId: 's1', stepNumber: 1, sequence: 1 }));
    s = reducer(s, startStream({ conversationId: 'c2', messageId: 'm2' }));
    expect(s.currentRun).toBeNull();
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
});
