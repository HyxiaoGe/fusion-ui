import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fetchWithAuthMock,
  apiRequestMock,
} = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  apiRequestMock: vi.fn(),
}));

vi.mock('./fetchWithAuth', () => ({
  default: fetchWithAuthMock,
  apiRequest: apiRequestMock,
}));

import { getConversation, reconnectStream, sendMessageStream } from './chat';

function createStreamResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

function envelope(chunk_type: string, data: unknown): string {
  return `data: ${JSON.stringify({ chunk_type, data })}\n\n`;
}

function agentEvent(
  type: string,
  fields: Record<string, unknown>,
  seq: number,
  runId = 'r1',
): string {
  return envelope('agent_event', {
    type,
    run_id: runId,
    parent_run_id: null,
    step_id: fields.step_id ?? null,
    parent_step_id: null,
    tool_call_id: fields.tool_call_id ?? null,
    sequence: seq,
    trace_id: runId,
    ts: 0,
    ...fields,
  });
}

describe('sendMessageStream — 新 envelope 协议', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
  });

  it('run_started 触发 onReady 并携带 messageId / conversationId', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        envelope('preparing', {}),
        agentEvent(
          'run_started',
          {
            conversation_id: 'conv-1',
            message_id: 'msg-1',
            model: 'gpt',
            tools: ['web_search'],
            config: { max_steps: 8 },
          },
          0,
        ),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onReady = vi.fn();
    const onRunStarted = vi.fn();
    const onPreparing = vi.fn();
    const onDone = vi.fn();
    await sendMessageStream(
      { model_id: 'gpt', message: 'hi', conversation_id: 'conv-1' },
      {
        onReady,
        onPreparing,
        onRunStarted,
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone,
        onError: vi.fn(),
      },
    );
    expect(onPreparing).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith({
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
    expect(onRunStarted).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
  });

  it('reasoning / answering 透传 run_id / step_id', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent(
          'run_started',
          {
            conversation_id: 'c',
            message_id: 'm',
            model: 'g',
            tools: [],
            config: {},
          },
          0,
        ),
        envelope('reasoning', {
          block_id: 'b1',
          delta: '思考',
          run_id: 'r1',
          step_id: 's1',
        }),
        envelope('answering', {
          block_id: 'b2',
          delta: '回答',
          run_id: 'r1',
          step_id: 's1',
        }),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onReasoning = vi.fn();
    const onAnswering = vi.fn();
    await sendMessageStream(
      { model_id: 'g', message: 'q' },
      {
        onReady: vi.fn(),
        onReasoning,
        onAnswering,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );
    expect(onReasoning).toHaveBeenCalledWith({
      block_id: 'b1',
      delta: '思考',
      run_id: 'r1',
      step_id: 's1',
    });
    expect(onAnswering).toHaveBeenCalledWith({
      block_id: 'b2',
      delta: '回答',
      run_id: 'r1',
      step_id: 's1',
    });
  });

  it('agent_event 二级 dispatch 全 10 type', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent(
          'run_started',
          {
            conversation_id: 'c',
            message_id: 'm',
            model: 'g',
            tools: [],
            config: {},
          },
          0,
        ),
        agentEvent('step_started', { step_number: 1, step_id: 's1' }, 1),
        agentEvent(
          'tool_call_started',
          {
            tool_call_id: 't1',
            step_id: 's1',
            tool_name: 'web_search',
            arguments: { q: 'x' },
          },
          2,
        ),
        agentEvent(
          'tool_call_delta',
          {
            tool_call_id: 't1',
            step_id: 's1',
            tool_name: 'web_search',
            delta: { partial: true },
          },
          3,
        ),
        agentEvent(
          'tool_call_completed',
          {
            tool_call_id: 't1',
            step_id: 's1',
            tool_name: 'web_search',
            status: 'success',
            duration_ms: 10,
            result_summary: { kind: 'search', truncated: false },
          },
          4,
        ),
        agentEvent(
          'step_completed',
          {
            step_id: 's1',
            step_number: 1,
            tool_call_count: 1,
            duration_ms: 20,
          },
          5,
        ),
        agentEvent('run_limit_reached', { reason: 'timeout' }, 6),
        agentEvent('run_interrupted', { reason: 'user_cancelled' }, 7),
        agentEvent('run_failed', { error_code: 'X', message: 'boom' }, 8),
        agentEvent(
          'run_completed',
          { total_steps: 1, total_tool_calls: 1, finish_reason: 'stop' },
          9,
        ),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const cbs = {
      onReady: vi.fn(),
      onReasoning: vi.fn(),
      onAnswering: vi.fn(),
      onRunStarted: vi.fn(),
      onStepStarted: vi.fn(),
      onToolCallStarted: vi.fn(),
      onToolCallDelta: vi.fn(),
      onToolCallCompleted: vi.fn(),
      onStepCompleted: vi.fn(),
      onRunLimitReached: vi.fn(),
      onRunInterrupted: vi.fn(),
      onRunFailed: vi.fn(),
      onRunCompleted: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };
    await sendMessageStream({ model_id: 'g', message: 'q' }, cbs);
    expect(cbs.onRunStarted).toHaveBeenCalledTimes(1);
    expect(cbs.onStepStarted).toHaveBeenCalledTimes(1);
    expect(cbs.onToolCallStarted).toHaveBeenCalledTimes(1);
    expect(cbs.onToolCallDelta).toHaveBeenCalledTimes(1);
    expect(cbs.onToolCallCompleted).toHaveBeenCalledTimes(1);
    expect(cbs.onStepCompleted).toHaveBeenCalledTimes(1);
    expect(cbs.onRunLimitReached).toHaveBeenCalledTimes(1);
    expect(cbs.onRunInterrupted).toHaveBeenCalledTimes(1);
    expect(cbs.onRunFailed).toHaveBeenCalledTimes(1);
    expect(cbs.onRunCompleted).toHaveBeenCalledTimes(1);
  });

  it('未知 chunk_type warn 不抛', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        envelope('totally_new_type', { foo: 1 }),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    await sendMessageStream(
      { model_id: 'g', message: 'q' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('未知 chunk_type'),
      'totally_new_type',
    );
    warn.mockRestore();
  });

  it('agent_event sequence 倒退被丢弃 + warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent(
          'run_started',
          {
            conversation_id: 'c',
            message_id: 'm',
            model: 'g',
            tools: [],
            config: {},
          },
          5,
        ),
        agentEvent('step_started', { step_number: 1, step_id: 's1' }, 3), // OOO
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onStepStarted = vi.fn();
    await sendMessageStream(
      { model_id: 'g', message: 'q' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onStepStarted,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );
    expect(onStepStarted).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('sequence 倒退'),
      expect.objectContaining({ sequence: 3 }),
    );
    warn.mockRestore();
  });

  it('error chunk 调 onError 抛 + 携带 code/message', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent(
          'run_started',
          {
            conversation_id: 'c',
            message_id: 'm',
            model: 'g',
            tools: [],
            config: {},
          },
          0,
        ),
        envelope('error', {
          code: 'PROVIDER_OFFLINE',
          message: 'Provider 离线',
          data: { provider_id: 'p1' },
        }),
      ]),
    );
    const onError = vi.fn();
    await expect(
      sendMessageStream(
        { model_id: 'g', message: 'q' },
        {
          onReady: vi.fn(),
          onReasoning: vi.fn(),
          onAnswering: vi.fn(),
          onDone: vi.fn(),
          onError,
        },
      ),
    ).rejects.toThrow('Provider 离线');
    expect(onError).toHaveBeenCalledWith(
      'Provider 离线',
      expect.objectContaining({
        code: 'PROVIDER_OFFLINE',
        data: { provider_id: 'p1' },
      }),
    );
  });

  it('error chunk 字符串 fallback（{code:stream_error, message:用户中止}）', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent(
          'run_started',
          {
            conversation_id: 'c',
            message_id: 'm',
            model: 'g',
            tools: [],
            config: {},
          },
          0,
        ),
        envelope('error', { code: 'stream_error', message: '用户中止' }),
      ]),
    );
    const onError = vi.fn();
    await expect(
      sendMessageStream(
        { model_id: 'g', message: 'q' },
        {
          onReady: vi.fn(),
          onReasoning: vi.fn(),
          onAnswering: vi.fn(),
          onDone: vi.fn(),
          onError,
        },
      ),
    ).rejects.toThrow('用户中止');
  });

  it('eof 无 [DONE] 视为流异常结束', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent(
          'run_started',
          {
            conversation_id: 'c',
            message_id: 'm',
            model: 'g',
            tools: [],
            config: {},
          },
          0,
        ),
      ]),
    );
    const onError = vi.fn();
    await expect(
      sendMessageStream(
        { model_id: 'g', message: 'q' },
        {
          onReady: vi.fn(),
          onReasoning: vi.fn(),
          onAnswering: vi.fn(),
          onDone: vi.fn(),
          onError,
        },
      ),
    ).rejects.toThrow('流异常结束');
    expect(onError).toHaveBeenCalledWith('流异常结束');
  });

  it('done chunk 在 run_started 之前到达 → onDone 收到空 messageId（容错路径）', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onDone = vi.fn();
    await sendMessageStream(
      { model_id: 'g', message: 'q', conversation_id: 'conv-1' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone,
        onError: vi.fn(),
      },
    );
    // 当前契约：messageId 空（run_started 没到），conversationId fallback 为 request.conversation_id
    expect(onDone).toHaveBeenCalledWith({ messageId: '', conversationId: 'conv-1' });
  });
});

describe('reconnectStream — 新 envelope 协议', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
  });

  it('重连场景下 onReady 仍触发（每次 new function 重置 readyFired）', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'id: 1234-5\n',
        agentEvent(
          'run_started',
          {
            conversation_id: 'conv-2',
            message_id: 'msg-resumed',
            model: 'g',
            tools: [],
            config: {},
          },
          5,
          'r-resume',
        ),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onReady = vi.fn();
    const onRunStarted = vi.fn();
    const result = await reconnectStream('conv-2', '1234-0', {
      onReady,
      onRunStarted,
      onReasoning: vi.fn(),
      onAnswering: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(onReady).toHaveBeenCalledWith({
      messageId: 'msg-resumed',
      conversationId: 'conv-2',
    });
    expect(onRunStarted).toHaveBeenCalledTimes(1);
    expect(result.entryId).toBe('1234-5');
  });

  it('reconnectStream 也做 sequence dedup（每次调用 new Map）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent(
          'run_started',
          {
            conversation_id: 'c',
            message_id: 'm',
            model: 'g',
            tools: [],
            config: {},
          },
          10,
          'r1',
        ),
        agentEvent('step_started', { step_number: 1, step_id: 's1' }, 8, 'r1'), // 倒退
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onStepStarted = vi.fn();
    await reconnectStream('c', '0', {
      onReady: vi.fn(),
      onStepStarted,
      onReasoning: vi.fn(),
      onAnswering: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    });
    expect(onStepStarted).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('sequence 倒退'),
      expect.any(Object),
    );
    warn.mockRestore();
  });
});

describe('getConversation', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
    apiRequestMock.mockReset();
  });

  it('passes abort signal when fetching a conversation', async () => {
    const controller = new AbortController();
    apiRequestMock.mockResolvedValue({ id: 'chat-1' });

    await getConversation('chat-1', controller.signal);

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/conversations/chat-1'),
      { signal: controller.signal },
    );
  });

  it('surfaces backend detail when fetching a conversation fails', async () => {
    apiRequestMock.mockRejectedValue(new Error('对话不存在或无权访问'));

    await expect(getConversation('missing-chat')).rejects.toThrow(
      '对话不存在或无权访问',
    );
  });
});
