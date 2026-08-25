import { describe, expect, it } from 'vitest';

import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import {
  resolveTrajectoryActionPolicy,
  type TrajectoryActionPolicyInput,
} from './trajectoryActionPolicy';

function run(
  runId: string,
  overrides: Partial<TrajectoryRunSummary> = {},
): TrajectoryRunSummary {
  return {
    run_id: runId,
    message_id: 'assistant-latest',
    turn_message_id: 'user-latest',
    attempt_index: 1,
    status: 'completed',
    trajectory_status: 'complete',
    total_steps: 1,
    total_tool_calls: 0,
    duration_ms: 120,
    started_at: '2026-08-22T00:00:01.000Z',
    ended_at: '2026-08-22T00:00:01.120Z',
    llm_detail_schema_version: 1,
    llm_round_count: 0,
    ...overrides,
  };
}

const messages: Message[] = [
  {
    id: 'user-old',
    role: 'user',
    content: [{ type: 'text', id: 'old-question', text: '旧问题' }],
  },
  {
    id: 'assistant-old',
    role: 'assistant',
    content: [{ type: 'text', id: 'old-answer', text: '旧回答' }],
  },
  {
    id: 'user-latest',
    role: 'user',
    content: [{ type: 'text', id: 'latest-question', text: '新问题' }],
  },
  {
    id: 'assistant-latest',
    role: 'assistant',
    content: [{ type: 'text', id: 'latest-answer', text: '新回答' }],
  },
];

function input(
  overrides: Partial<TrajectoryActionPolicyInput> = {},
): TrajectoryActionPolicyInput {
  const selected = run('run-latest');
  return {
    runs: [run('run-first', {
      attempt_index: 0,
      started_at: '2026-08-22T00:00:00.000Z',
      ended_at: '2026-08-22T00:00:00.120Z',
    }), selected],
    messages,
    selectedRunId: selected.run_id,
    runListStatus: 'ready',
    selectedRunHydrated: true,
    selectedTrajectoryStatus: 'complete',
    selectedRunTruncated: false,
    reconciliationStatus: 'ready',
    hasActiveStream: false,
    retryCapabilityAvailable: true,
    modelAvailable: true,
    knowledgeBaseStatus: 'ready',
    knowledgeBaseIds: [],
    ...overrides,
  };
}

describe('resolveTrajectoryActionPolicy', () => {
  it('只允许最后一轮最新 attempt 重试，并把所选 run 作为唯一 previous_run_id', () => {
    const policy = resolveTrajectoryActionPolicy(input());

    expect(policy.retry).toEqual({ allowed: true, blockers: [] });
    expect(policy.target).toEqual({
      previousRunId: 'run-latest',
      retryMessageId: 'assistant-latest',
      userMessageId: 'user-latest',
      assistantMessageId: 'assistant-latest',
    });

    const historicalAttempt = resolveTrajectoryActionPolicy(input({
      selectedRunId: 'run-first',
    }));
    expect(historicalAttempt.retry).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining(['run-not-latest-attempt']),
    });

    const historicalTurn = run('run-old-turn', {
      message_id: 'assistant-old',
      turn_message_id: 'user-old',
      attempt_index: 0,
    });
    const oldTurnPolicy = resolveTrajectoryActionPolicy(input({
      runs: [historicalTurn],
      selectedRunId: historicalTurn.run_id,
    }));
    expect(oldTurnPolicy.retry).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining(['run-not-last-turn']),
    });
  });

  it('同一轮 attempt_index 不唯一或缺失时保持只读', () => {
    const duplicatedAttempt = resolveTrajectoryActionPolicy(input({
      runs: [run('run-latest'), run('run-duplicate')],
    }));
    expect(duplicatedAttempt.retry).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining(['run-attempt-ambiguous']),
    });

    const unknownAttempt = resolveTrajectoryActionPolicy(input({
      runs: [run('run-latest'), run('run-unknown', { attempt_index: null })],
    }));
    expect(unknownAttempt.retry).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining(['run-attempt-ambiguous']),
    });
  });

  it.each([
    ['active stream', { hasActiveStream: true }, 'active-stream'],
    ['能力缺失', { retryCapabilityAvailable: false }, 'retry-capability-unavailable'],
    ['模型不可用', { modelAvailable: false }, 'model-unavailable'],
    ['知识库不可用', { knowledgeBaseStatus: 'unavailable' }, 'knowledge-unavailable'],
    ['run list 非最新', { runListStatus: 'failed' }, 'run-list-not-ready'],
    ['快照未水合', { selectedRunHydrated: false }, 'trajectory-unverified'],
    ['仍在对账', { reconciliationStatus: 'reconciling' }, 'trajectory-unverified'],
  ] as const)('%s 时 Agent retry 只读', (_, overrides, blocker) => {
    const policy = resolveTrajectoryActionPolicy(input(overrides));

    expect(policy.retry.allowed).toBe(false);
    expect(policy.retry.blockers).toContain(blocker);
  });

  it.each([
    ['legacy', 'legacy', false, 'trajectory-legacy'],
    ['degraded', 'degraded', false, 'trajectory-degraded'],
    ['truncated', 'complete', true, 'trajectory-truncated'],
  ] as const)('%s 轨迹显式只读，不伪造 Agent action', (_, status, truncated, blocker) => {
    const selected = run('run-latest', { trajectory_status: status });
    const policy = resolveTrajectoryActionPolicy(input({
      runs: [selected],
      selectedRunId: selected.run_id,
      selectedTrajectoryStatus: status,
      selectedRunTruncated: truncated,
    }));

    expect(policy.retry.allowed).toBe(false);
    expect(policy.continue.allowed).toBe(false);
    expect(policy.retry.blockers).toContain(blocker);
  });

  it('continue 复用所选 run 和 assistant，仅在 limit_reached 时允许', () => {
    const limitRun = run('run-limit', { status: 'limit_reached' });
    const policy = resolveTrajectoryActionPolicy(input({
      runs: [limitRun],
      selectedRunId: limitRun.run_id,
    }));

    expect(policy.retry.allowed).toBe(true);
    expect(policy.continue).toEqual({ allowed: true, blockers: [] });
    expect(policy.target).toMatchObject({
      previousRunId: 'run-limit',
      assistantMessageId: 'assistant-latest',
    });

    expect(resolveTrajectoryActionPolicy(input()).continue).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining(['run-not-limit-reached']),
    });
  });

  it('知识库回答不能伪造 continue，但满足前置条件时仍可 Agent retry', () => {
    const limitRun = run('run-limit', { status: 'limit_reached' });
    const knowledgeMessages: Message[] = messages.map(message => (
      message.id === 'assistant-latest'
        ? {
            ...message,
            content: [{
              type: 'knowledge_evidence' as const,
              id: 'knowledge-1',
              schema_version: 1 as const,
              query: '知识问题',
              status: 'success' as const,
              source_count: 1,
              knowledge_base_ids: ['kb-1'],
              source_refs: [],
            }],
          }
        : message
    ));
    const policy = resolveTrajectoryActionPolicy(input({
      runs: [limitRun],
      selectedRunId: limitRun.run_id,
      messages: knowledgeMessages,
      knowledgeBaseIds: ['kb-1'],
    }));

    expect(policy.retry.allowed).toBe(true);
    expect(policy.continue).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining(['knowledge-continuation-unsupported']),
    });
  });

  it('当前知识库与历史附件互斥时不允许 Agent retry', () => {
    const attachmentMessages: Message[] = messages.map(message => (
      message.id === 'user-latest'
        ? {
            ...message,
            content: [{
              type: 'file' as const,
              id: 'file-block',
              file_id: 'file-1',
              filename: '依据.txt',
              mime_type: 'text/plain',
            }],
          }
        : message
    ));
    const policy = resolveTrajectoryActionPolicy(input({
      messages: attachmentMessages,
      knowledgeBaseIds: ['kb-1'],
    }));

    expect(policy.retry).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining(['knowledge-attachment-conflict']),
    });
  });
});
