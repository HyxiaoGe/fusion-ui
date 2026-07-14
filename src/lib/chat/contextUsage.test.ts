import { describe, expect, it } from 'vitest';

import {
  buildContextUsageView,
  makeSelectConversationContextStatus,
  normalizeContextUsage,
  selectConversationContextStatus,
  selectConversationContextUsage,
} from './contextUsage';

describe('contextUsage', () => {
  it('优先使用真实 Prompt Token 计算剩余比例，并保留自动优化信息', () => {
    const usage = normalizeContextUsage({
      status: 'trimmed',
      window_tokens: 262_144,
      estimated_tokens_before: 232_305,
      estimated_tokens_after: 192_280,
      actual_prompt_tokens: 147_811,
      removed_turns: 1,
      removed_messages: 2,
      removed_tool_transactions: 0,
    });

    expect(usage).not.toBeNull();
    expect(buildContextUsageView(usage!)).toMatchObject({
      phase: 'actual',
      usedTokens: 147_811,
      windowTokens: 262_144,
      remainingPercent: 43,
      optimized: true,
      removedTurns: 1,
      removedMessages: 2,
    });
  });

  it('预计态不展示估算 Token，未知窗口的 actual 仍保留实际 Token', () => {
    const estimated = normalizeContextUsage({
      status: 'no_op',
      window_tokens: 100_000,
      estimated_tokens_before: 20_000,
      estimated_tokens_after: 18_000,
      actual_prompt_tokens: null,
      removed_turns: 0,
      removed_messages: 0,
      removed_tool_transactions: 0,
    });
    const unknown = normalizeContextUsage({
      status: 'bypass_unknown_window',
      window_tokens: null,
      estimated_tokens_before: null,
      estimated_tokens_after: null,
      actual_prompt_tokens: 2_000,
      removed_turns: 0,
      removed_messages: 0,
      removed_tool_transactions: 0,
    });

    expect(buildContextUsageView(estimated!)).toMatchObject({
      phase: 'unavailable',
      usedTokens: null,
      remainingPercent: null,
    });
    expect(buildContextUsageView(unknown!)).toMatchObject({
      phase: 'actual',
      usedTokens: 2_000,
      windowTokens: null,
      remainingPercent: null,
    });
  });

  it('快速路径缺少裁剪后估算时保持计算中，不拿优化前 Token 冒充当前占比', () => {
    const usage = normalizeContextUsage({
      status: 'no_op_fast_path',
      window_tokens: 100_000,
      estimated_tokens_before: 80_000,
      estimated_tokens_after: null,
      actual_prompt_tokens: null,
      removed_turns: 0,
      removed_messages: 0,
      removed_tool_transactions: 0,
    });

    expect(buildContextUsageView(usage!)).toMatchObject({
      phase: 'unavailable',
      usedTokens: null,
      remainingPercent: null,
    });
  });

  it('拒绝无 status 的脏数据，并把负数安全归零', () => {
    expect(normalizeContextUsage({ window_tokens: 1000 })).toBeNull();
    expect(normalizeContextUsage({
      status: 'trimmed',
      window_tokens: 1000,
      estimated_tokens_before: -1,
      removed_turns: -2,
      round_index: -1,
    })).toMatchObject({
      status: 'trimmed',
      window_tokens: 1000,
      estimated_tokens_before: null,
      removed_turns: 0,
      round_index: null,
    });
  });

  it('流式 confirmed actual 只在会话 ID 匹配时优先，切换会话回退各自最新 assistant 历史', () => {
    const usageA = { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 400 };
    const usageB = { status: 'trimmed', window_tokens: 2000, actual_prompt_tokens: 1500 };
    const liveA = { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 500 };
    const state = {
      stream: {
        isStreaming: true,
        conversationId: 'chat-a',
        contextUsageConversationId: 'chat-a',
        contextUsage: liveA,
        contextUsageMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 2, phase: 'final' as const, roundIndex: 1,
        },
        contextUsageInFlightConversationId: 'chat-a',
        contextUsageInFlight: liveA,
        contextUsageInFlightMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 2, phase: 'final' as const, roundIndex: 1,
        },
      },
      conversation: {
        byId: {
          'chat-a': {
            messages: [{ role: 'assistant', usage: { input_tokens: 1, output_tokens: 1, context: usageA } }],
          },
          'chat-b': {
            messages: [
              { role: 'assistant', usage: { input_tokens: 1, output_tokens: 1, context: usageB } },
              { role: 'user' },
            ],
          },
        },
      },
    };

    expect(selectConversationContextUsage(state, 'chat-a')).toMatchObject({ actual_prompt_tokens: 500 });
    expect(selectConversationContextUsage(state, 'chat-b')).toMatchObject({ actual_prompt_tokens: 1500 });
    expect(selectConversationContextUsage(state, null)).toBeNull();
  });

  it('同会话新一轮开始后保留最近 confirmed actual，并标记更新中', () => {
    const state = {
      stream: { isStreaming: true, conversationId: 'chat-a', contextUsage: null },
      conversation: {
        byId: {
          'chat-a': {
            messages: [
              {
                id: 'assistant-old', role: 'assistant',
                usage: {
                  input_tokens: 1,
                  output_tokens: 1,
                  context: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 400 },
                },
              },
              { id: 'assistant-new', role: 'assistant', usage: null },
            ],
          },
        },
      },
    };

    expect(selectConversationContextStatus(state, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 400 },
      phase: 'estimated',
      pending: false,
      updating: true,
    });
  });

  it('首次没有 confirmed actual 时才显示计算中', () => {
    const state = {
      stream: { isStreaming: true, conversationId: 'chat-a', contextUsage: null },
      conversation: {
        byId: {
          'chat-a': { messages: [{ id: 'assistant-new', role: 'assistant', usage: null }] },
        },
      },
    };

    expect(selectConversationContextStatus(state, 'chat-a')).toMatchObject({
      usage: null,
      phase: 'estimated',
      pending: true,
      updating: false,
    });
  });

  it('Agent 下一轮 estimated 保留 confirmed actual，final actual 到达后原子替换', () => {
    const confirmed = { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 410 };
    const estimated = {
      status: 'no_op', window_tokens: 1000, estimated_tokens_after: 430,
      actual_prompt_tokens: null, round_index: 2,
    };
    const baseState = {
      stream: {
        isStreaming: true,
        conversationId: 'chat-a',
        contextUsageConversationId: 'chat-a',
        contextUsage: confirmed,
        contextUsageMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 5, phase: 'final' as const, roundIndex: 1,
        },
        contextUsageInFlightConversationId: 'chat-a',
        contextUsageInFlight: estimated,
        contextUsageInFlightMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 7, phase: 'estimated' as const, roundIndex: 2,
        },
      },
      conversation: {
        byId: { 'chat-a': { messages: [{ id: 'assistant-a', role: 'assistant', usage: null }] } },
      },
    };

    expect(selectConversationContextStatus(baseState, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 410 },
      updating: true,
      pending: false,
    });

    const finalUsage = { ...estimated, actual_prompt_tokens: 450 };
    expect(selectConversationContextStatus({
      ...baseState,
      stream: {
        ...baseState.stream,
        contextUsage: finalUsage,
        contextUsageMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 8, phase: 'final' as const, roundIndex: 2,
        },
        contextUsageInFlight: finalUsage,
        contextUsageInFlightMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 8, phase: 'final' as const, roundIndex: 2,
        },
      },
    }, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 450 },
      updating: false,
      pending: false,
    });
  });

  it('final 无 actual 或错误时结束计算并保留最近 confirmed actual', () => {
    const confirmed = { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 410 };
    const common = {
      isStreaming: true,
      conversationId: 'chat-a',
      contextUsageConversationId: 'chat-a',
      contextUsage: confirmed,
      contextUsageMeta: {
        runId: 'run-a', messageId: 'assistant-a', sequence: 5, phase: 'final' as const, roundIndex: 1,
      },
    };
    const conversation = {
      byId: { 'chat-a': { messages: [{ id: 'assistant-a', role: 'assistant', usage: null }] } },
    };

    expect(selectConversationContextStatus({
      stream: {
        ...common,
        contextUsageInFlightConversationId: 'chat-a',
        contextUsageInFlight: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: null, round_index: 2 },
        contextUsageInFlightMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 8, phase: 'final' as const, roundIndex: 2,
        },
      },
      conversation,
    }, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 410 },
      phase: 'final',
      pending: false,
      updating: false,
      latestActualUnavailable: true,
    });

    expect(selectConversationContextStatus({
      stream: {
        ...common,
        contextUsageInFlightConversationId: 'chat-a',
        contextUsageInFlight: { status: 'estimator_unavailable', window_tokens: 1000, actual_prompt_tokens: null },
        contextUsageInFlightMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 9, phase: 'error' as const, roundIndex: 2,
        },
      },
      conversation,
    }, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 410 },
      phase: 'error',
      errorKind: 'check_failed',
      updating: false,
      latestActualUnavailable: true,
    });
  });

  it('非流式 continuation 的当前终态覆盖同一 assistant 的旧 persisted actual', () => {
    const conversation = {
      byId: {
        'chat-a': {
          messages: [{
            id: 'assistant-a',
            role: 'assistant',
            usage: { context: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 400 } },
          }],
        },
      },
    };
    const baseStream = {
      isStreaming: false,
      contextUsageInFlightConversationId: 'chat-a',
      currentRun: {
        runId: 'run-new', messageId: 'assistant-a', serverMessageId: 'server-assistant-a',
      },
    };

    expect(selectConversationContextStatus({
      stream: {
        ...baseStream,
        contextUsageInFlight: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: null },
        contextUsageInFlightMeta: {
          runId: 'run-new', messageId: 'server-assistant-a', sequence: 8, phase: 'final' as const, roundIndex: 2,
        },
      },
      conversation,
    }, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 400 },
      phase: 'final',
      pending: false,
      latestActualUnavailable: true,
    });

    expect(selectConversationContextStatus({
      stream: {
        ...baseStream,
        contextUsageInFlight: { status: 'estimator_unavailable', window_tokens: 1000, actual_prompt_tokens: null },
        contextUsageInFlightMeta: {
          runId: 'run-new', messageId: 'server-assistant-a', sequence: 9, phase: 'error' as const, roundIndex: 2,
        },
      },
      conversation,
    }, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 400 },
      phase: 'error',
      errorKind: 'check_failed',
      latestActualUnavailable: true,
    });
  });

  it('流结束后当前终态无 actual 时仅回退到会话最近 actual', () => {
    const state = {
      stream: {
        isStreaming: false,
        contextUsageInFlightConversationId: 'chat-a',
        contextUsageInFlight: {
          status: 'no_op', window_tokens: 1000, actual_prompt_tokens: null, round_index: 1,
        },
        contextUsageInFlightMeta: {
          runId: 'run-new', messageId: 'server-assistant-new', sequence: 8,
          phase: 'final' as const, roundIndex: 1,
        },
        currentRun: {
          runId: 'run-new', messageId: 'assistant-new', serverMessageId: 'server-assistant-new',
        },
      },
      conversation: {
        byId: {
          'chat-a': {
            messages: [
              {
                id: 'assistant-old', role: 'assistant',
                usage: { context: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 360 } },
              },
              { id: 'assistant-new', role: 'assistant', usage: null },
            ],
          },
        },
      },
    };

    expect(selectConversationContextStatus(state, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 360 },
      phase: 'final',
      latestActualUnavailable: true,
    });
  });

  it('非流式只读取最新 assistant，不向前捞取旧 context', () => {
    const state = {
      stream: {
        isStreaming: false,
        conversationId: null,
        contextUsageConversationId: 'chat-a',
        contextUsage: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 500 },
        contextUsageMeta: {
          runId: 'old-run', messageId: 'assistant-old', sequence: 3, phase: 'final' as const, roundIndex: 1,
        },
        currentRun: {
          runId: 'old-run', messageId: 'assistant-old', serverMessageId: 'assistant-old',
        },
      },
      conversation: {
        byId: {
          'chat-a': {
            messages: [
              {
                id: 'assistant-old', role: 'assistant',
                usage: { context: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 400 } },
              },
              { id: 'assistant-new', role: 'assistant', usage: null },
            ],
          },
        },
      },
    };

    expect(selectConversationContextStatus(state, 'chat-a')).toBeNull();
  });

  it('最新持久化 context 优先于 retained snapshot', () => {
    const state = {
      stream: {
        isStreaming: false,
        conversationId: null,
        contextUsageConversationId: 'chat-a',
        contextUsage: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 500 },
        contextUsageMeta: {
          runId: 'run-a', messageId: 'assistant-a', sequence: 3, phase: 'final' as const, roundIndex: 1,
        },
      },
      conversation: {
        byId: {
          'chat-a': {
            messages: [{
              id: 'assistant-a', role: 'assistant',
              usage: { context: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 450 } },
            }],
          },
        },
      },
    };

    expect(selectConversationContextStatus(state, 'chat-a')).toMatchObject({
      usage: { actual_prompt_tokens: 450 },
      pending: false,
    });
  });

  it('retained snapshot 仅在 meta 或 currentRun 能证明对应最新 assistant 时兜底', () => {
    const base = {
      isStreaming: false,
      conversationId: null,
      contextUsageConversationId: 'chat-a',
      contextUsage: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 500 },
      contextUsageMeta: {
        runId: 'run-a', messageId: 'server-assistant', sequence: 3, phase: 'final' as const, roundIndex: 1,
      },
    };
    const conversation = {
      byId: {
        'chat-a': { messages: [{ id: 'local-assistant', role: 'assistant', usage: null }] },
      },
    };

    expect(selectConversationContextStatus({
      stream: { ...base, currentRun: null },
      conversation,
    }, 'chat-a')).toBeNull();
    expect(selectConversationContextStatus({
      stream: {
        ...base,
        currentRun: {
          runId: 'run-a', messageId: 'local-assistant', serverMessageId: 'server-assistant',
        },
      },
      conversation,
    }, 'chat-a')).toMatchObject({ usage: { actual_prompt_tokens: 500 } });
  });

  it.each([
    ['required_context_over_budget', 'not_sent'],
    ['estimator_unavailable', 'check_failed'],
  ] as const)('历史错误状态 %s 映射为明确失败语义', (status, errorKind) => {
    const state = {
      stream: { isStreaming: false },
      conversation: {
        byId: {
          'chat-a': {
            messages: [{
              id: 'assistant-a', role: 'assistant',
              usage: { context: { status, window_tokens: 1000 } },
            }],
          },
        },
      },
    };

    expect(selectConversationContextStatus(state, 'chat-a')).toMatchObject({
      phase: 'error',
      pending: false,
      errorKind,
    });
  });

  it('相同会话输入未变化时复用上下文状态对象引用', () => {
    const state = {
      stream: { isStreaming: false },
      conversation: {
        byId: {
          'chat-a': {
            messages: [{
              id: 'assistant-a', role: 'assistant',
              usage: { context: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 400 } },
            }],
          },
        },
      },
    };
    const selector = makeSelectConversationContextStatus('chat-a');

    const first = selector(state);
    expect(selector(state)).toBe(first);
    expect(selector({ ...state })).toBe(first);
    expect(selector({
      ...state,
      stream: { ...state.stream },
    })).not.toBe(first);
  });
});
