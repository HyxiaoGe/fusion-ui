import { describe, expect, it, vi } from 'vitest';
import { createAgentStreamEventHandlers } from './streamEventHandlers';

describe('createAgentStreamEventHandlers', () => {
  it('映射 v1 run_started 和 v2 progress 到 Redux action', () => {
    const dispatch = vi.fn();
    const setServerMessageId = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
      setServerMessageId,
    });

    handlers.onRunStarted?.({
      type: 'run_started',
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'r1',
      ts: 0,
      conversation_id: 'c1',
      message_id: 'm1',
      model: 'gpt',
      tools: [],
      config: { max_steps: 8, max_tool_calls: 20, timeout_s: 300 },
    });
    handlers.onRunProgressUpdated?.({
      type: 'run_progress_updated',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 1,
      trace_id: 'r1',
      ts: 0,
      phase: 'planning',
      label: '正在理解问题',
      completed_steps: 0,
      total_steps: 4,
    });

    expect(setServerMessageId).toHaveBeenCalledWith('m1');
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0]).toMatchObject({
      type: 'stream/initRun',
      payload: {
        runId: 'r1',
        messageId: 'm1',
        serverMessageId: 'm1',
        config: { maxSteps: 8, maxToolCalls: 20, timeoutS: 300 },
        sequence: 0,
      },
    });
    expect(dispatch.mock.calls[1][0]).toMatchObject({
      type: 'stream/updateRunProgress',
      payload: {
        runId: 'r1',
        sequence: 1,
        progress: { phase: 'planning', label: '正在理解问题', completedSteps: 0, totalSteps: 4 },
      },
    });
  });

  it('inactive 时忽略所有 agent event', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => false,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onRunStarted?.({
      type: 'run_started',
      run_id: 'r1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'r1',
      ts: 0,
      conversation_id: 'c1',
      message_id: 'm1',
      model: 'gpt',
      tools: [],
      config: {},
    });

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('映射 selected evidence event 到 Redux action', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onEvidenceItemUpserted?.({
      type: 'evidence_item_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-search',
      sequence: 3,
      trace_id: 'r1',
      ts: 0,
      evidence: {
        id: 'ev-web-1',
        kind: 'web',
        status: 'selected',
        title: '建议深读来源',
        url: 'https://example.com/report',
        domain: 'example.com',
        claim: '建议深读：官方来源',
        snippet: '来自搜索关键词：OpenAI',
        used_by_final_answer: false,
      },
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/upsertEvidenceItem',
      payload: expect.objectContaining({
        runId: 'r1',
        sequence: 3,
        evidence: expect.objectContaining({
          id: 'ev-web-1',
          status: 'selected',
          usedByFinalAnswer: false,
        }),
      }),
    }));
  });

  it('把 content_block_upserted 的规范 content_block 写入 stream staticBlocks', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContentBlockUpserted?.({
      type: 'content_block_upserted',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: 'tc-place',
      sequence: 4,
      trace_id: 'r1',
      ts: 0,
      content_block: {
        type: 'place_results',
        id: 'places-1',
        schema_version: 1,
        provider: 'amap',
        query: '烤肉',
        near: '深圳民治',
        status: 'success',
        result_count: 1,
        places: [{ provider_place_id: 'p1', name: '民治烤肉店' }],
        limitations: [],
        tool_call_log_id: 'tc-place',
      },
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/upsertStaticContentBlock',
      payload: expect.objectContaining({
        runId: 'r1',
        sequence: 4,
        block: expect.objectContaining({
          type: 'place_results',
          id: 'places-1',
          provider: 'amap',
        }),
      }),
    }));
  });

  it('把 context_status_updated 作为单轮快照写入当前会话', () => {
    const dispatch = vi.fn();
    const handlers = createAgentStreamEventHandlers({
      dispatch,
      isActive: () => true,
      resolveMessageId: ev => ev.message_id,
      resolveConversationId: () => 'c1',
    });

    handlers.onContextStatusUpdated?.({
      type: 'context_status_updated',
      protocol_version: 2,
      run_id: 'r1',
      parent_run_id: null,
      step_id: 's1',
      parent_step_id: null,
      tool_call_id: null,
      sequence: 4,
      trace_id: 'r1',
      ts: 0,
      phase: 'final',
      message_id: 'server-m1',
      status: 'trimmed',
      window_tokens: 262_144,
      estimated_tokens_before: 232_305,
      estimated_tokens_after: 192_280,
      actual_prompt_tokens: 147_811,
      removed_turns: 1,
      removed_messages: 2,
      removed_tool_transactions: 0,
      round_index: 1,
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/updateContextUsage',
      payload: expect.objectContaining({
        conversationId: 'c1',
        runId: 'r1',
        messageId: 'server-m1',
        sequence: 4,
        phase: 'final',
        usage: expect.objectContaining({
          actual_prompt_tokens: 147_811,
          round_index: 1,
        }),
      }),
    }));
  });
});
