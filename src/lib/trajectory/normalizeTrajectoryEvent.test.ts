import { describe, expect, it } from 'vitest';

import {
  normalizeSseTrajectoryEvent,
  normalizeTrajectoryRecord,
} from './normalizeTrajectoryEvent';

const timestamp = '2026-08-22T00:00:00.000Z';

describe('normalizeTrajectoryEvent', () => {
  it('缺失 schema_version 的已知 SSE 事件按 legacy 版本归一化', () => {
    const tools = ['weather'];
    const normalized = normalizeSseTrajectoryEvent({
      type: 'run_started',
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 0,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      conversation_id: 'conversation-1',
      message_id: 'message-1',
      task_id: 'task-1',
      model: 'deepseek-chat',
      tools,
    });

    expect(normalized).toEqual({
      runId: 'run-1',
      sequence: 0,
      eventType: 'run_started',
      schemaVersion: 0,
      timestamp,
      stepId: null,
      toolCallId: null,
      parentStepId: null,
      traceId: 'trace-1',
      payload: {
        conversation_id: 'conversation-1',
        message_id: 'message-1',
        task_id: 'task-1',
        model: 'deepseek-chat',
        tools: ['weather'],
      },
    });
    expect(normalized?.payload.tools).not.toBe(tools);
  });

  it('拒绝未知 schema 或不在公共 union 的 SSE 事件', () => {
    const baseEvent = {
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 1,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
    };

    expect(normalizeSseTrajectoryEvent({
      ...baseEvent,
      type: 'run_started',
      schema_version: 2,
      conversation_id: 'conversation-1',
      message_id: 'message-1',
      task_id: 'task-1',
      model: 'deepseek-chat',
      tools: [],
    })).toBeNull();
    expect(normalizeSseTrajectoryEvent({ ...baseEvent, type: 'internal_debug_event' })).toBeNull();
  });

  it('只保留事件类型 allowlist 字段且不保留原 payload 引用', () => {
    const payload = {
      tool_name: 'weather',
      status: 'success',
      duration_ms: 120,
      plan_item_id: 'plan-1',
      arguments: { api_key: 'secret' },
      internal_note: '不可进入普通用户轨迹',
    };

    const normalized = normalizeSseTrajectoryEvent({
      type: 'tool_call_completed',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: 'step-1',
      parent_step_id: null,
      tool_call_id: 'tool-1',
      sequence: 2,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      ...payload,
    });

    expect(normalized?.payload).toEqual({
      tool_name: 'weather',
      status: 'success',
      duration_ms: 120,
      plan_item_id: 'plan-1',
    });
    expect(normalized?.payload).not.toBe(payload);
  });

  it('保留 LLM 完成事件的推理 Token，同时丢弃未声明字段', () => {
    const normalized = normalizeSseTrajectoryEvent({
      type: 'llm_round_completed',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: 'step-1',
      parent_step_id: null,
      tool_call_id: null,
      sequence: 3,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      llm_round_id: 'round-1',
      status: 'success',
      input_tokens: 100,
      output_tokens: 40,
      reasoning_tokens: 24,
      duration_ms: 800,
      internal_usage_detail: { secret: true },
    });

    expect(normalized?.payload).toMatchObject({
      llm_round_id: 'round-1',
      status: 'success',
      input_tokens: 100,
      output_tokens: 40,
      reasoning_tokens: 24,
      duration_ms: 800,
    });
    expect(normalized?.payload).not.toHaveProperty('internal_usage_detail');
  });

  it('对 plan_snapshot 的嵌套项应用字段白名单、脱敏和有界列表', () => {
    const normalized = normalizeSseTrajectoryEvent({
      type: 'plan_snapshot',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 3,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      protocol_version: 2,
      plan_id: 'plan-1',
      items: Array.from({ length: 51 }, (_, index) => ({
        id: `item-${index}`,
        title: 'api_key=live-secret',
        summary: '长文本'.repeat(300),
        tool_names: Array.from({ length: 51 }, (_, toolIndex) => `token=tool-${toolIndex}`),
        arguments: { api_key: '不能进入 UI' },
        raw_tool_output: '不能进入 UI',
      })),
    });

    const items = normalized?.payload.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(50);
    expect(Object.keys(items[0]).sort()).toEqual(['id', 'summary', 'title', 'tool_names']);
    expect(items[0].title).toBe('api_key=[REDACTED]');
    expect(items[0].summary).toHaveLength(512);
    expect(items[0].tool_names).toEqual(Array(50).fill('token=[REDACTED]'));
  });

  it('对 evidence URL、嵌套未知字段和文本 secret 应用普通用户安全边界', () => {
    const normalized = normalizeSseTrajectoryEvent({
      type: 'evidence_item_upserted',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 4,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      protocol_version: 2,
      evidence: {
        id: 'evidence-1',
        title: 'authorization: Bearer live-token',
        url: 'https://example.com/guide?access_token=live-token#section',
        raw_tool_output: '不能进入 UI',
      },
    });

    expect(normalized?.payload.evidence).toEqual({
      id: 'evidence-1',
      title: 'authorization=[REDACTED]',
      url: 'https://example.com/guide',
    });
  });

  it('将 P1 record 与相同 SSE 事件归一为同一普通用户事件', () => {
    const record = {
      sequence: 2,
      event_type: 'tool_call_completed',
      schema_version: 1,
      timestamp,
      step_id: 'step-1',
      tool_call_id: 'tool-1',
      parent_step_id: null,
      trace_id: 'trace-1',
      span_id: 'tool:tool-1',
      payload: {
        type: 'tool_call_completed',
        run_id: 'run-1',
        tool_name: 'weather',
        status: 'success',
        duration_ms: 120,
        plan_item_id: 'plan-1',
        arguments: { api_key: 'secret' },
      },
    };
    const sse = {
      type: 'tool_call_completed',
      schema_version: 1,
      run_id: 'run-1',
      parent_run_id: null,
      step_id: 'step-1',
      parent_step_id: null,
      tool_call_id: 'tool-1',
      sequence: 2,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      tool_name: 'weather',
      status: 'success',
      duration_ms: 120,
      plan_item_id: 'plan-1',
      arguments: { api_key: 'secret' },
    };

    expect(normalizeTrajectoryRecord('run-1', record)).toEqual(normalizeSseTrajectoryEvent(sse));
  });

  it.each([
    ['UTC 整秒', '2026-08-22T00:00:00Z', '2026-08-22T00:00:00.000Z'],
    ['六位微秒', '2026-08-22T00:00:00.123456Z', '2026-08-22T00:00:00.123Z'],
    ['带 offset', '2026-08-22T08:00:00.123+08:00', '2026-08-22T00:00:00.123Z'],
  ])('把真实 P1 %s timestamp 归一为 UTC 毫秒 ISO', (_label, durableTimestamp, expected) => {
    const normalized = normalizeTrajectoryRecord('run-1', {
      sequence: 1,
      event_type: 'step_started',
      schema_version: 1,
      timestamp: durableTimestamp,
      step_id: 'step-1',
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-1',
      span_id: 'step:step-1',
      payload: {
        type: 'step_started',
        run_id: 'run-1',
        step_number: 1,
      },
    });

    expect(normalized?.timestamp).toBe(expected);
  });

  it.each([
    ['非时间字符串', 'not-a-timestamp'],
    ['不存在的日期', '2026-02-30T00:00:00Z'],
  ])('拒绝%s的真实 P1 timestamp，不回退到当前时间', (_label, timestamp) => {
    expect(normalizeTrajectoryRecord('run-1', {
      sequence: 1,
      event_type: 'step_started',
      schema_version: 1,
      timestamp,
      step_id: 'step-1',
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-1',
      span_id: 'step:step-1',
      payload: {
        type: 'step_started',
        run_id: 'run-1',
        step_number: 1,
      },
    })).toBeNull();
  });

  it('将 P1 schema_version=0 record 与缺失版本的 SSE 归一为相同 legacy 事件', () => {
    const record = {
      sequence: 5,
      event_type: 'run_completed',
      schema_version: 0,
      timestamp,
      step_id: null,
      tool_call_id: null,
      parent_step_id: null,
      trace_id: 'trace-1',
      span_id: null,
      payload: {
        type: 'run_completed',
        run_id: 'run-1',
        total_steps: 2,
        total_tool_calls: 1,
        finish_reason: 'stop',
      },
    };
    const sse = {
      type: 'run_completed',
      run_id: 'run-1',
      parent_run_id: null,
      step_id: null,
      parent_step_id: null,
      tool_call_id: null,
      sequence: 5,
      trace_id: 'trace-1',
      ts: Date.parse(timestamp) / 1000,
      total_steps: 2,
      total_tool_calls: 1,
      finish_reason: 'stop',
    };

    expect(normalizeTrajectoryRecord('run-1', record)).toEqual(normalizeSseTrajectoryEvent(sse));
    expect(normalizeSseTrajectoryEvent(sse)?.schemaVersion).toBe(0);
  });
});
