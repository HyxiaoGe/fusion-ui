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

import {
  StreamRequestError,
  continueAgentRunStream,
  getConversation,
  isRecoverableStreamError,
  reconnectStream,
  sendMessageStream,
  stopStream,
} from './chat';

describe('stopStream', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('向停止请求透传 AbortSignal', async () => {
    const controller = new AbortController();
    apiRequestMock.mockResolvedValue({ cancelled: true });

    await expect(stopStream('conv-1', undefined, controller.signal)).resolves.toBe(true);
    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/stop/conv-1'),
      { method: 'POST', signal: controller.signal },
    );
  });

  it('请求被主动取消时保留 AbortError 供上层释放停止屏障', async () => {
    const controller = new AbortController();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    controller.abort();
    apiRequestMock.mockRejectedValue(abortError);

    await expect(stopStream('conv-1', undefined, controller.signal)).rejects.toBe(abortError);
  });

  it('停止恢复流时在同一请求透传 partial content 供后端原子持久化', async () => {
    const partialContent = [{ type: 'text' as const, id: 'answer-1', text: '部分回答' }];
    apiRequestMock.mockResolvedValue({ cancelled: true });

    await expect(stopStream('conv-1', 'msg-1', undefined, partialContent)).resolves.toBe(true);

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/stop/conv-1?message_id=msg-1'),
      {
        method: 'POST',
        signal: undefined,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial_content: partialContent }),
      },
    );
  });

  it('partial 原子停止失败时向页面抛错，旧无 body 调用仍保持 false 降级', async () => {
    const failure = new Error('persist failed');
    apiRequestMock.mockRejectedValue(failure);

    await expect(stopStream('conv-1')).resolves.toBe(false);
    await expect(stopStream(
      'conv-1',
      'msg-1',
      undefined,
      [{ type: 'text', id: 'answer-1', text: '部分回答' }],
    )).rejects.toBe(failure);
  });

  it('preparing/tool 阶段也显式发送空 partial_content，不退回 legacy 无 body 请求', async () => {
    apiRequestMock.mockResolvedValue({ cancelled: true });

    await expect(stopStream('conv-1', 'msg-1', undefined, [])).resolves.toBe(true);

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/stop/conv-1?message_id=msg-1'),
      {
        method: 'POST',
        signal: undefined,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial_content: [] }),
      },
    );
  });
});

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

function createInterruptedStreamResponse(firstChunk: string, error = new TypeError('network disconnected')) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(firstChunk));
      queueMicrotask(() => controller.error(error));
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
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

  it('把前端生成的 user / assistant 稳定消息 ID 原样写入请求 payload', async () => {
    fetchWithAuthMock.mockResolvedValue(createStreamResponse(['data: [DONE]\n\n']));

    await sendMessageStream(
      {
        model_id: 'gpt',
        message: 'hi',
        conversation_id: 'conv-1',
        user_message_id: 'user-stable-id',
        assistant_message_id: 'assistant-stable-id',
      },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    const request = fetchWithAuthMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      conversation_id: 'conv-1',
      user_message_id: 'user-stable-id',
      assistant_message_id: 'assistant-stable-id',
      stream: true,
    });
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

  it('初次 send 也在完整 data frame 处理后递增上报 SSE entry cursor', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        'id: 100-1\n',
        envelope('answering', { block_id: 'answer', delta: '第一段' }),
        'id: 100-2\n',
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const order: string[] = [];

    await sendMessageStream(
      { model_id: 'g', message: 'q', conversation_id: 'conv-1' },
      {
        onReady: vi.fn(),
        onEntryId: (entryId) => order.push(`cursor:${entryId}`),
        onReasoning: vi.fn(),
        onAnswering: () => order.push('answer'),
        onDone: () => order.push('done'),
        onError: vi.fn(),
      },
    );

    expect(order).toEqual(['answer', 'cursor:100-1', 'done', 'cursor:100-2']);
  });

  it('仅收到 id 行就断线时不推进 cursor，避免重连跳过未处理 data frame', async () => {
    fetchWithAuthMock.mockResolvedValue(createInterruptedStreamResponse('id: 100-9\n'));
    const onEntryId = vi.fn();
    const onError = vi.fn();

    const error = await sendMessageStream(
      { model_id: 'g', message: 'q', conversation_id: 'conv-1' },
      {
        onReady: vi.fn(),
        onEntryId,
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone: vi.fn(),
        onError,
      },
    ).catch((caught) => caught);

    expect(isRecoverableStreamError(error)).toBe(true);
    expect(onEntryId).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('JSON 解析失败时不提交 pending entry cursor，避免跳过坏 frame', async () => {
    fetchWithAuthMock.mockResolvedValue(createStreamResponse([
      'id: 101-1\n',
      'data: {bad-json}\n\n',
      'data: [DONE]\n\n',
    ]));
    const onEntryId = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const error = await sendMessageStream(
      { model_id: 'g', message: 'q', conversation_id: 'conv-1' },
      {
        onReady: vi.fn(),
        onEntryId,
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    ).catch((caught) => caught);

    expect(error).toEqual(expect.objectContaining({
      message: 'SSE 数据解析失败',
      recoverable: true,
    }));
    expect(onEntryId).not.toHaveBeenCalled();
    warn.mockRestore();
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

  it('分发 content_block_upserted 并保留规范 content_block 字段', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent('content_block_upserted', {
          protocol_version: 2,
          tool_call_id: 'tc-route',
          content_block: {
            type: 'route_results',
            id: 'routes-1',
            schema_version: 1,
            provider: 'amap',
            status: 'degraded',
            origin: { label: '民治地铁站', city: '深圳' },
            destination: { label: '星河 WORLD', city: '深圳' },
            routes: [{ mode: 'driving', distance_m: 6200, duration_s: 1100 }],
            unavailable_modes: ['transit'],
            limitations: ['路线时间仅代表本次返回结果'],
            tool_call_log_id: 'tc-route',
          },
        }, 1),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onContentBlockUpserted = vi.fn();

    await sendMessageStream(
      { model_id: 'g', message: 'q' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onContentBlockUpserted,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(onContentBlockUpserted).toHaveBeenCalledWith(expect.objectContaining({
      type: 'content_block_upserted',
      content_block: expect.objectContaining({
        type: 'route_results',
        id: 'routes-1',
        status: 'degraded',
      }),
    }));
  });

  it('context_status_updated 预计态与真实态均 dispatch，重复重连事件由 sequence 去重', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent('context_status_updated', {
          protocol_version: 2,
          phase: 'estimated',
          message_id: 'server-message-1',
          round_index: 1,
          status: 'no_op',
          window_tokens: 262144,
          estimated_tokens_before: 1000,
          estimated_tokens_after: 1000,
          actual_prompt_tokens: null,
          removed_turns: 0,
          removed_messages: 0,
          removed_tool_transactions: 0,
        }, 1),
        agentEvent('context_status_updated', {
          protocol_version: 2,
          phase: 'estimated',
          message_id: 'server-message-1',
          round_index: 1,
          status: 'no_op',
          window_tokens: 262144,
          estimated_tokens_before: 1000,
          estimated_tokens_after: 1000,
          actual_prompt_tokens: null,
          removed_turns: 0,
          removed_messages: 0,
          removed_tool_transactions: 0,
        }, 1),
        agentEvent('context_status_updated', {
          protocol_version: 2,
          phase: 'final',
          message_id: 'server-message-1',
          round_index: 1,
          status: 'no_op',
          window_tokens: 262144,
          estimated_tokens_before: 1000,
          estimated_tokens_after: 1000,
          actual_prompt_tokens: 1012,
          removed_turns: 0,
          removed_messages: 0,
          removed_tool_transactions: 0,
        }, 2),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onContextStatusUpdated = vi.fn();

    await sendMessageStream(
      { model_id: 'g', message: 'q' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onContextStatusUpdated,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(onContextStatusUpdated).toHaveBeenCalledTimes(2);
    expect(onContextStatusUpdated).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'final',
      actual_prompt_tokens: 1012,
    }));
  });

  it('忽略未知协议版本或缺少 message_id 的 context_status_updated', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent('context_status_updated', {
          protocol_version: 1,
          phase: 'final',
          message_id: 'server-message-1',
          round_index: 1,
          status: 'no_op',
          window_tokens: 262144,
          estimated_tokens_before: 1000,
          estimated_tokens_after: 1000,
          actual_prompt_tokens: 1012,
          removed_turns: 0,
          removed_messages: 0,
          removed_tool_transactions: 0,
        }, 1),
        agentEvent('context_status_updated', {
          protocol_version: 2,
          phase: 'final',
          round_index: 1,
          status: 'no_op',
          window_tokens: 262144,
          estimated_tokens_before: 1000,
          estimated_tokens_after: 1000,
          actual_prompt_tokens: 1012,
          removed_turns: 0,
          removed_messages: 0,
          removed_tool_transactions: 0,
        }, 2),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const onContextStatusUpdated = vi.fn();

    await sendMessageStream(
      { model_id: 'g', message: 'q' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onContextStatusUpdated,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(onContextStatusUpdated).not.toHaveBeenCalled();
  });

  it('agent_event v2 五类事件 dispatch 到对应 callback 且不触发 onReady', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent('run_progress_updated', {
          protocol_version: 2,
          phase: 'researching',
          label: '正在搜索相关资料',
          completed_steps: 1,
          total_steps: 4,
        }, 0),
        agentEvent('plan_snapshot', {
          protocol_version: 2,
          plan_id: 'plan-r1',
          revision: 1,
          items: [
            {
              id: 'search',
              title: '搜索资料',
              status: 'running',
              kind: 'search',
              tool_names: ['web_search'],
              evidence_item_ids: [],
            },
          ],
        }, 1),
        agentEvent('plan_step_updated', {
          protocol_version: 2,
          plan_id: 'plan-r1',
          revision: 2,
          item: {
            id: 'search',
            title: '搜索资料',
            status: 'completed',
            kind: 'search',
            tool_names: ['web_search'],
            evidence_item_ids: ['ev-1'],
          },
        }, 2),
        agentEvent('tool_result_digest', {
          protocol_version: 2,
          tool_call_id: 'tc1',
          tool_name: 'web_search',
          status: 'success',
          title: '找到 2 条结果',
          summary: '优先保留官方来源。',
          key_findings: ['官方页面确认发布时间。'],
          source_refs: ['ev-1'],
          truncated: false,
        }, 3),
        agentEvent('evidence_item_upserted', {
          protocol_version: 2,
          evidence: {
            id: 'ev-1',
            kind: 'web',
            status: 'used',
            title: '官方发布页',
            url: 'https://example.com/news',
            domain: 'example.com',
            claim: '官方页面确认发布时间。',
            used_by_final_answer: true,
          },
        }, 4),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );
    const cbs = {
      onReady: vi.fn(),
      onRunProgressUpdated: vi.fn(),
      onPlanSnapshot: vi.fn(),
      onPlanStepUpdated: vi.fn(),
      onToolResultDigest: vi.fn(),
      onEvidenceItemUpserted: vi.fn(),
      onReasoning: vi.fn(),
      onAnswering: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    };

    await sendMessageStream({ model_id: 'g', message: 'q' }, cbs);

    expect(cbs.onReady).not.toHaveBeenCalled();
    expect(cbs.onRunProgressUpdated).toHaveBeenCalledTimes(1);
    expect(cbs.onPlanSnapshot).toHaveBeenCalledTimes(1);
    expect(cbs.onPlanStepUpdated).toHaveBeenCalledTimes(1);
    expect(cbs.onToolResultDigest).toHaveBeenCalledTimes(1);
    expect(cbs.onEvidenceItemUpserted).toHaveBeenCalledTimes(1);
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
    const error = await sendMessageStream(
      { model_id: 'g', message: 'q' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone: vi.fn(),
        onError,
      },
    ).catch((caught) => caught);

    expect(error).toEqual(expect.objectContaining({ message: '流异常结束' }));
    expect(isRecoverableStreamError(error)).toBe(true);
    expect(onError).not.toHaveBeenCalled();
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

  it('404 视为不可恢复，503 视为可退避重试', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(reconnectStream('c', '10-1', {
      onReady: vi.fn(),
      onReasoning: vi.fn(),
      onAnswering: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    })).rejects.toEqual(expect.objectContaining({ recoverable: false, statusCode: 404 }));

    fetchWithAuthMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const error = await reconnectStream('c', '10-1', {
      onReady: vi.fn(),
      onReasoning: vi.fn(),
      onAnswering: vi.fn(),
      onDone: vi.fn(),
      onError: vi.fn(),
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(StreamRequestError);
    expect(error).toEqual(expect.objectContaining({ recoverable: true, statusCode: 503 }));
  });

  it('503 STREAM_UNAVAILABLE 表示 Redis 初始化失败，不可重连且保留后端提示', async () => {
    fetchWithAuthMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'STREAM_UNAVAILABLE',
      message: '生成服务暂时不可用，请稍后重试',
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }));

    const error = await sendMessageStream(
      { model_id: 'g', message: 'q', conversation_id: 'conv-1' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    ).catch((caught) => caught);

    expect(error).toEqual(expect.objectContaining({
      message: '生成服务暂时不可用，请稍后重试',
      recoverable: false,
      statusCode: 503,
      code: 'STREAM_UNAVAILABLE',
    }));
  });

  it('SSE redis_read_failed 是可恢复读故障，不提前触发终态 onError', async () => {
    fetchWithAuthMock.mockResolvedValue(createStreamResponse([
      'id: 400-1\n',
      envelope('error', {
        code: 'redis_read_failed',
        message: 'Redis 暂时不可访问',
      }),
    ]));
    const onError = vi.fn();

    const error = await sendMessageStream(
      { model_id: 'g', message: 'q', conversation_id: 'conv-1' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone: vi.fn(),
        onError,
      },
    ).catch((caught) => caught);

    expect(error).toEqual(expect.objectContaining({
      code: 'redis_read_failed',
      recoverable: true,
      message: 'Redis 暂时不可访问',
    }));
    expect(onError).not.toHaveBeenCalled();
  });

  it('SSE stream_interrupted 保持不可恢复并立即触发终态 onError', async () => {
    fetchWithAuthMock.mockResolvedValue(createStreamResponse([
      envelope('error', {
        code: 'stream_interrupted',
        message: '生成已中断',
      }),
    ]));
    const onError = vi.fn();

    const error = await sendMessageStream(
      { model_id: 'g', message: 'q', conversation_id: 'conv-1' },
      {
        onReady: vi.fn(),
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone: vi.fn(),
        onError,
      },
    ).catch((caught) => caught);

    expect(error).toEqual(expect.objectContaining({
      code: 'stream_interrupted',
      recoverable: false,
    }));
    expect(onError).toHaveBeenCalledWith('生成已中断', expect.objectContaining({
      code: 'stream_interrupted',
    }));
  });
});

describe('continueAgentRunStream', () => {
  beforeEach(() => {
    fetchWithAuthMock.mockReset();
  });

  it('向 continuation endpoint 发起 POST 并复用 SSE envelope 回调', async () => {
    fetchWithAuthMock.mockResolvedValue(
      createStreamResponse([
        agentEvent(
          'run_started',
          {
            conversation_id: 'conv-1',
            message_id: 'msg-1',
            model: 'gpt',
            tools: [],
            config: { max_steps: 8, max_tool_calls: 20, timeout_s: 300 },
          },
          0,
          'run-2',
        ),
        envelope('done', {}),
        'data: [DONE]\n\n',
      ]),
    );

    const onReady = vi.fn();
    const onRunStarted = vi.fn();
    const onDone = vi.fn();

    await continueAgentRunStream(
      {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        previousRunId: 'run-1',
      },
      {
        onReady,
        onRunStarted,
        onReasoning: vi.fn(),
        onAnswering: vi.fn(),
        onDone,
        onError: vi.fn(),
      },
    );

    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/conversations/conv-1/messages/msg-1/continue'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ previous_run_id: 'run-1', stream: true }),
      }),
    );
    expect(onReady).toHaveBeenCalledWith({
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
    expect(onRunStarted).toHaveBeenCalledWith(expect.objectContaining({
      type: 'run_started',
      run_id: 'run-2',
      message_id: 'msg-1',
    }));
    expect(onDone).toHaveBeenCalledWith({
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
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
