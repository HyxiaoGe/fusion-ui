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
});
