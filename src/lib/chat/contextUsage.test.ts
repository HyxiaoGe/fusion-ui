import { describe, expect, it } from 'vitest';

import {
  buildContextUsageView,
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

  it('预计态使用裁剪后 Token，未知窗口不伪造百分比', () => {
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
      phase: 'estimated',
      usedTokens: 18_000,
      remainingPercent: 82,
    });
    expect(buildContextUsageView(unknown!).remainingPercent).toBeNull();
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

  it('流式状态只在会话 ID 匹配时优先，切换会话回退各自最新 assistant 历史', () => {
    const usageA = { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 400 };
    const usageB = { status: 'trimmed', window_tokens: 2000, actual_prompt_tokens: 1500 };
    const liveA = { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 500 };
    const state = {
      stream: { isStreaming: true, conversationId: 'chat-a', contextUsage: liveA },
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

  it('同会话新一轮已开始但 live 事件尚未到达时不闪回上一轮历史占比', () => {
    const state = {
      stream: { isStreaming: true, conversationId: 'chat-a', contextUsage: null },
      conversation: {
        byId: {
          'chat-a': {
            messages: [{
              role: 'assistant',
              usage: {
                input_tokens: 1,
                output_tokens: 1,
                context: { status: 'no_op', window_tokens: 1000, actual_prompt_tokens: 400 },
              },
            }],
          },
        },
      },
    };

    expect(selectConversationContextStatus(state, 'chat-a')).toMatchObject({
      usage: null,
      phase: 'estimated',
      pending: true,
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
});
