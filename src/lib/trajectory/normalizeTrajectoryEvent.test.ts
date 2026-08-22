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
      schemaVersion: null,
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
});
