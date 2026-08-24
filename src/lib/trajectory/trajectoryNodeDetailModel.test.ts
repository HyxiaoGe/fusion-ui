import { describe, expect, it } from 'vitest';

import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary, TrajectorySpan } from '@/types/trajectory';

import {
  projectTrajectoryCells,
  type TrajectoryCell,
} from './TrajectoryCellProjection';
import type { NormalizedTrajectoryEvent } from './normalizeTrajectoryEvent';
import { buildTrajectoryNodeDetailModel } from './trajectoryNodeDetailModel';

function event(
  sequence: number,
  eventType: string,
  timestamp: string,
  payload: Record<string, unknown>,
  overrides: Partial<NormalizedTrajectoryEvent> = {},
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
    ...overrides,
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

  it('LLM span 由 RunCell 承载时只使用 span 自身身份与记录，不混入其他 round 或 Run 摘要', () => {
    const run: TrajectoryCell = {
      ...baseCell(),
      key: 'run:run-1',
      type: 'run',
      summarySource: 'run-summary',
      attemptIndex: 2,
      runStatus: 'completed',
      totalSteps: 3,
      totalToolCalls: 2,
      startedAt: '2026-08-23T00:00:00.000Z',
      endedAt: '2026-08-23T00:00:02.000Z',
      isSelected: true,
      isHydrated: true,
      association: 'explicit',
      trajectoryBadge: { status: 'complete', source: 'durable-snapshot', reason: null },
      records: [
        event(10, 'llm_round_started', '2026-08-23T00:00:00.250Z', {
          llm_round_id: 'round-selected',
          model: 'deepseek-chat',
        }, { toolCallId: null }),
        event(11, 'llm_round_failed', '2026-08-23T00:00:01.250Z', {
          llm_round_id: 'round-selected',
          status: 'failed',
          error_code: 'provider_unavailable',
          message: '当前模型阶段暂时不可用',
        }, { toolCallId: null }),
        event(20, 'llm_round_completed', '2026-08-23T00:00:02.000Z', {
          llm_round_id: 'round-unrelated',
          status: 'completed',
          ttft_ms: 999,
          duration_ms: 9_999,
        }, { toolCallId: null }),
      ],
      spans: [],
      liveTail: [],
    };
    const span: TrajectorySpan = {
      span_id: 'llm:round-1',
      kind: 'llm',
      name: 'round-sensitive-id',
      parent_span_id: 'run:run-1',
      start_sequence: 10,
      end_sequence: 11,
      started_at: '2026-08-23T00:00:00.250Z',
      ended_at: 'not-a-time',
      duration_ms: null,
      status: 'failed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: null,
      record_sequences: [10, 11],
    };

    expect(buildTrajectoryNodeDetailModel(run, span)).toMatchObject({
      title: '模型调用',
      nodeType: '模型阶段',
      status: '失败',
      summary: '模型调用',
      duration: null,
      ttft: null,
      startedAt: '2026-08-23 08:00:00.250',
      endedAt: null,
      attemptCount: null,
      errorSummary: '当前模型阶段暂时不可用',
    });
  });

  it('Run span 使用稳定用户标题，不把后端 name 中的 run_id 暴露到默认区域', () => {
    const run: Extract<TrajectoryCell, { type: 'run' }> = {
      ...baseCell(),
      key: 'run:run-sensitive-id',
      type: 'run',
      runId: 'run-sensitive-id',
      summarySource: 'run-summary',
      attemptIndex: 0,
      runStatus: 'completed',
      totalSteps: 1,
      totalToolCalls: 0,
      startedAt: '2026-08-23T00:00:00.000Z',
      endedAt: '2026-08-23T00:00:01.000Z',
      isSelected: true,
      isHydrated: true,
      association: 'explicit',
      trajectoryBadge: { status: 'complete', source: 'durable-snapshot', reason: null },
      records: [],
      spans: [],
      liveTail: [],
    };
    const span: TrajectorySpan = {
      span_id: 'run:run-sensitive-id',
      kind: 'run',
      name: 'run-sensitive-id',
      parent_span_id: null,
      start_sequence: 0,
      end_sequence: 1,
      started_at: '2026-08-23T00:00:00.000Z',
      ended_at: '2026-08-23T00:00:01.000Z',
      duration_ms: 1_000,
      status: 'completed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: null,
      record_sequences: [0, 1],
    };

    const model = buildTrajectoryNodeDetailModel(run, span);

    expect(model).toMatchObject({
      title: '运行',
      nodeType: '运行',
      summary: '运行',
      attemptCount: null,
    });
    expect(model.title).not.toContain('run-sensitive-id');
  });

  it.each([
    ['run', '运行'],
    ['step', '执行步骤'],
    ['llm', '模型调用'],
    ['retrieval', '资料获取'],
    ['tool', '工具'],
    ['tool_attempt', '工具尝试'],
    ['message', '消息'],
  ])('span kind=%s 使用稳定标题且忽略不可信 name', (kind, expectedTitle) => {
    const carrier: Extract<TrajectoryCell, { type: 'run' }> = {
      ...baseCell(),
      key: 'run:run-1',
      type: 'run',
      summarySource: 'run-summary',
      attemptIndex: 0,
      runStatus: 'completed',
      totalSteps: 1,
      totalToolCalls: 0,
      startedAt: '2026-08-23T00:00:00.000Z',
      endedAt: '2026-08-23T00:00:01.000Z',
      isSelected: true,
      isHydrated: true,
      association: 'explicit',
      trajectoryBadge: { status: 'complete', source: 'durable-snapshot', reason: null },
      records: [],
      spans: [],
      liveTail: [],
    };
    const span: TrajectorySpan = {
      span_id: `${kind}:internal-id`,
      kind,
      name: 'internal-sensitive-id',
      parent_span_id: 'run:run-1',
      start_sequence: 1,
      end_sequence: 2,
      started_at: '2026-08-23T00:00:00.000Z',
      ended_at: '2026-08-23T00:00:01.000Z',
      duration_ms: 1_000,
      status: 'completed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: null,
      record_sequences: [],
    };

    const model = buildTrajectoryNodeDetailModel(carrier, span);

    expect(model.title).toBe(expectedTitle);
    expect(model.title).not.toContain('internal-sensitive-id');
  });

  it('真实 tool_attempt span 只使用 span 身份与 Timing，不回退承载 Cell 的 attempt index', () => {
    const attempt: Extract<TrajectoryCell, { type: 'subtool' }> = {
      ...baseCell(),
      key: 'run:run-1:subtool:attempt-sensitive-id',
      type: 'subtool',
      sourceSequences: [5, 6],
      toolCallId: 'tool-1',
      toolAttemptId: 'attempt-sensitive-id',
      toolName: 'web_search',
      attemptIndex: 7,
      status: 'success',
      events: [
        event(5, 'tool_attempt_started', '2026-08-23T00:00:01.100Z', {
          tool_attempt_id: 'attempt-sensitive-id',
          tool_name: 'web_search',
          attempt_index: 1,
        }),
        event(6, 'tool_attempt_completed', '2026-08-23T00:00:01.140Z', {
          tool_attempt_id: 'attempt-sensitive-id',
          status: 'failed',
          error_code: 'provider_timeout_internal',
          duration_ms: 40,
        }),
      ],
    };
    const span: TrajectorySpan = {
      span_id: 'tool_attempt:attempt-sensitive-id',
      kind: 'tool_attempt',
      name: 'attempt-sensitive-id',
      parent_span_id: 'tool:tool-1',
      start_sequence: 5,
      end_sequence: 6,
      started_at: '2026-08-23T00:00:01.100Z',
      ended_at: '2026-08-23T00:00:01.140Z',
      duration_ms: 40,
      status: 'failed',
      terminal_source: 'recorded',
      inferred_reason: null,
      ttft_ms: null,
      record_sequences: [5, 6],
    };

    expect(buildTrajectoryNodeDetailModel(attempt, span)).toMatchObject({
      title: '工具尝试 · 搜索',
      nodeType: '工具尝试',
      status: '失败',
      summary: '工具尝试',
      duration: '40 毫秒',
      ttft: null,
      attemptCount: null,
      attemptMode: null,
      errorSummary: '工具尝试未能完成',
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
      attemptMode: 'ordinal',
      errorSummary: '工具尝试未能完成',
    });
    expect(attemptModel.errorSummary).not.toContain('provider_timeout_internal');
  });

  it('逻辑 Tool 从真实 projectTrajectoryCells 的 sibling attempts 计算尝试次数', () => {
    const run: TrajectoryRunSummary = {
      run_id: 'run-1',
      message_id: 'assistant-1',
      turn_message_id: 'user-1',
      attempt_index: 0,
      status: 'completed',
      trajectory_status: 'complete',
      total_steps: 1,
      total_tool_calls: 1,
      duration_ms: 120,
      started_at: '2026-08-23T00:00:00.000Z',
      ended_at: '2026-08-23T00:00:00.120Z',
    };
    const messages: Message[] = [
      {
        id: 'user-1',
        role: 'user',
        content: [{ id: 'user-text', type: 'text', text: '查询天气' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ id: 'assistant-text', type: 'text', text: '天气结果' }],
      },
    ];
    const events = [
      event(0, 'run_started', '2026-08-23T00:00:00.000Z', {}, {
        stepId: null,
        toolCallId: null,
      }),
      event(1, 'tool_call_started', '2026-08-23T00:00:00.010Z', {
        tool_name: 'web_search',
      }),
      event(2, 'tool_attempt_started', '2026-08-23T00:00:00.020Z', {
        tool_attempt_id: 'attempt-1',
        tool_name: 'web_search',
        attempt_index: 0,
      }),
      event(3, 'tool_attempt_completed', '2026-08-23T00:00:00.040Z', {
        tool_attempt_id: 'attempt-1',
        status: 'failed',
        error_code: 'provider_timeout',
        duration_ms: 20,
      }),
      event(4, 'tool_attempt_started', '2026-08-23T00:00:00.050Z', {
        tool_attempt_id: 'attempt-2',
        tool_name: 'web_search',
        attempt_index: 1,
      }),
      event(5, 'tool_attempt_completed', '2026-08-23T00:00:00.090Z', {
        tool_attempt_id: 'attempt-2',
        status: 'success',
        duration_ms: 40,
      }),
      event(6, 'tool_call_completed', '2026-08-23T00:00:00.100Z', {
        tool_name: 'web_search',
        status: 'success',
        duration_ms: 90,
      }),
    ];
    const projection = projectTrajectoryCells({
      messages,
      runs: [run],
      runSummariesById: { 'run-1': run },
      snapshotsByRunId: {
        'run-1': {
          snapshotRequestId: 'snapshot-1',
          run,
          spans: [],
          completeness: {
            status: 'complete',
            degraded_reason: null,
            event_count: 7,
            expected_last_sequence: 6,
            loaded_event_count: 7,
            first_sequence: 0,
            last_sequence: 6,
          },
          truncated: false,
          durableLastSequence: 6,
          events,
        },
      },
      liveEventsByRunId: {},
      selectedRunId: 'run-1',
      runsTruncated: false,
    });
    const tool = projection.cells.find(
      (cell): cell is Extract<TrajectoryCell, { type: 'tool' }> => cell.type === 'tool',
    );
    const attempts = projection.cells.filter(cell => cell.type === 'subtool');

    expect(tool?.events.map(item => item.eventType)).toEqual([
      'tool_call_started',
      'tool_call_completed',
    ]);
    expect(attempts).toHaveLength(2);
    expect(tool && buildTrajectoryNodeDetailModel(tool, null, projection.cells)).toMatchObject({
      attemptCount: 2,
      attemptMode: 'count',
    });
  });
});
