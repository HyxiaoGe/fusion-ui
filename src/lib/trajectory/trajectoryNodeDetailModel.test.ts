import { describe, expect, it } from 'vitest';

import type { TrajectoryCell } from './TrajectoryCellProjection';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import { buildTrajectoryNodeDetailModel } from './trajectoryNodeDetailModel';
import type { TrajectorySpan } from '@/types/trajectory';

function event(
  sequence: number,
  eventType: string,
  timestamp: string,
  payload: Record<string, unknown>,
): NormalizedTrajectoryEvent {
  return {
    runId: 'run-1',
    sequence,
    eventType,
    schemaVersion: 1,
    timestamp,
    stepId: 'step-1',
    toolCallId: 'tool-1',
    parentStepId: null,
    traceId: 'trace-1',
    payload,
  };
}

function baseCell(): {
  runId: string;
  userMessageId: string;
  assistantMessageId: string;
  completenessSources: TrajectoryCell['completenessSources'];
  sourceSequences: number[];
} {
  return {
    runId: 'run-1',
    userMessageId: 'user-1',
    assistantMessageId: 'assistant-1',
    completenessSources: ['durable-snapshot'],
    sourceSequences: [3, 4],
  };
}

describe('buildTrajectoryNodeDetailModel', () => {
  it('从用户与回答 cell 生成本地摘要和上海时区时间，不依赖节点详情', () => {
    const user: TrajectoryCell = {
      ...baseCell(),
      key: 'message:user:user-1',
      type: 'user',
      runId: null,
      userMessageId: 'user-1',
      assistantMessageId: null,
      completenessSources: ['message'],
      sourceSequences: [],
      message: {
        id: 'user-1',
        role: 'user',
        timestamp: Date.parse('2026-08-23T00:00:00.000Z'),
        content: [{ id: 'text-1', type: 'text', text: '查询上海天气' }],
      },
    };
    const answer: TrajectoryCell = {
      ...baseCell(),
      key: 'message:assistant:assistant-1',
      type: 'message',
      runId: null,
      userMessageId: null,
      assistantMessageId: 'assistant-1',
      completenessSources: ['message'],
      sourceSequences: [],
      message: {
        id: 'assistant-1',
        role: 'assistant',
        status: 'failed',
        content: [{ id: 'text-2', type: 'text', text: '暂时无法回答' }],
      },
    };

    expect(buildTrajectoryNodeDetailModel(user, null)).toMatchObject({
      title: '用户提问',
      nodeType: '用户消息',
      status: '已记录',
      summary: '查询上海天气',
      startedAt: '2026-08-23 08:00:00.000',
      endedAt: null,
      duration: null,
      ttft: null,
      errorSummary: null,
    });
    expect(buildTrajectoryNodeDetailModel(answer, null)).toMatchObject({
      title: '回答',
      nodeType: '回答消息',
      status: '失败',
      summary: '暂时无法回答',
      errorSummary: '回答未能完成',
    });
  });

  it('关联 span 时生成 Run 的 Summary 与可信 Timing，并忽略非法结束时间', () => {
    const run: TrajectoryCell = {
      ...baseCell(),
      key: 'run:run-1',
      type: 'run',
      summarySource: 'run-summary',
      attemptIndex: 1,
      runStatus: 'completed',
      totalSteps: 3,
      totalToolCalls: 2,
      startedAt: '2026-08-23T00:00:00.000Z',
      endedAt: '2026-08-23T00:00:02.000Z',
      isSelected: true,
      isHydrated: true,
      association: 'explicit',
      trajectoryBadge: { status: 'complete', source: 'durable-snapshot', reason: null },
      records: [],
      spans: [],
      liveTail: [],
    };
    const span: TrajectorySpan = {
      span_id: 'llm:round-1',
      kind: 'llm',
      name: '生成回答',
      parent_span_id: 'run:run-1',
      start_sequence: 1,
      end_sequence: 2,
      started_at: '2026-08-23T00:00:00.250Z',
      ended_at: 'not-a-time',
      duration_ms: 1750,
      status: 'completed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: 320,
      record_sequences: [1, 2],
    };

    expect(buildTrajectoryNodeDetailModel(run, span)).toMatchObject({
      title: '生成回答',
      nodeType: '模型阶段',
      status: '已完成',
      summary: '3 步 · 2 次工具',
      duration: '1.75 秒',
      ttft: '320 毫秒',
      startedAt: '2026-08-23 08:00:00.250',
      endedAt: null,
      attemptCount: 2,
    });
  });

  it('Tool 与 Attempt 只从各自安全事件生成状态、错误与 Timing', () => {
    const tool: TrajectoryCell = {
      ...baseCell(),
      key: 'run:run-1:tool:tool-1',
      type: 'tool',
      toolCallId: 'tool-1',
      stepId: 'step-1',
      toolName: 'web_search',
      status: 'success',
      events: [
        event(3, 'tool_call_started', '2026-08-23T00:00:01.000Z', { tool_name: 'web_search' }),
        event(4, 'tool_call_completed', '2026-08-23T00:00:01.080Z', {
          tool_name: 'web_search',
          status: 'success',
          duration_ms: 80,
        }),
        event(5, 'tool_attempt_completed', '2026-08-23T00:00:01.090Z', {
          tool_attempt_id: 'attempt-unrelated',
          status: 'failed',
          error_code: 'unrelated_attempt_failure',
          duration_ms: 10,
        }),
      ],
    };
    const attempt: TrajectoryCell = {
      ...baseCell(),
      key: 'run:run-1:subtool:attempt-2',
      type: 'subtool',
      toolCallId: 'tool-1',
      toolAttemptId: 'attempt-2',
      toolName: 'web_search',
      attemptIndex: 1,
      status: 'failed',
      events: [
        event(5, 'tool_attempt_started', '2026-08-23T00:00:01.100Z', {
          tool_attempt_id: 'attempt-2',
          tool_name: 'web_search',
          attempt_index: 1,
        }),
        event(6, 'tool_attempt_completed', '2026-08-23T00:00:01.140Z', {
          tool_attempt_id: 'attempt-2',
          status: 'failed',
          error_code: 'provider_timeout_internal',
          duration_ms: 40,
        }),
        event(7, 'run_failed', '2026-08-23T00:00:01.150Z', {
          error_code: 'unrelated_run_failure',
          message: '不属于当前 Attempt 的运行错误',
        }),
      ],
    };

    expect(buildTrajectoryNodeDetailModel(tool, null)).toMatchObject({
      title: '搜索',
      nodeType: '工具',
      status: '完成',
      duration: '80 毫秒',
      startedAt: '2026-08-23 08:00:01.000',
      endedAt: '2026-08-23 08:00:01.080',
      errorSummary: null,
    });
    const attemptModel = buildTrajectoryNodeDetailModel(attempt, null);
    expect(attemptModel).toMatchObject({
      title: '工具尝试',
      nodeType: '工具尝试',
      status: '失败',
      duration: '40 毫秒',
      attemptCount: 2,
      errorSummary: '工具尝试未能完成',
    });
    expect(attemptModel.errorSummary).not.toContain('provider_timeout_internal');
  });
});
