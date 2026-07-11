import { act, renderHook, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContinueAgentRun } from './useContinueAgentRun';
import {
  continueAgentRunStream,
  getConversation,
  reconnectStream,
  stopStream,
} from '@/lib/api/chat';
import conversationReducer, { upsertConversation } from '@/redux/slices/conversationSlice';
import streamReducer from '@/redux/slices/streamSlice';

vi.mock('@/lib/api/chat', () => ({
  continueAgentRunStream: vi.fn(),
  reconnectStream: vi.fn(),
  isRecoverableStreamError: (error: unknown) => Boolean((error as { recoverable?: boolean })?.recoverable),
  getConversation: vi.fn(),
  stopStream: vi.fn(),
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => vi.fn(),
}));

vi.mock('react-redux', () => ({
  useStore: () => ({
    getState: () => ({}),
  }),
}));

function recoverableError(message: string, code?: string) {
  return Object.assign(new Error(message), { recoverable: true, code });
}

function terminalError(message: string, code = 'stream_interrupted') {
  return Object.assign(new Error(message), { recoverable: false, code });
}

function createReducerBackedHarness() {
  const store = configureStore({
    reducer: {
      conversation: conversationReducer,
      stream: streamReducer,
    },
  });
  store.dispatch(upsertConversation({
    id: 'conv-1',
    title: '会话',
    model_id: 'deepseek-chat',
    messages: [{
      id: 'msg-1',
      role: 'assistant',
      content: [{ type: 'text', id: 'old-text', text: '旧回答' }],
      timestamp: 1,
    }],
    createdAt: 1,
    updatedAt: 1,
  }));
  const dispatch = vi.spyOn(store, 'dispatch');
  return { store, dispatch };
}

describe('useContinueAgentRun', () => {
  beforeEach(() => {
    vi.mocked(continueAgentRunStream).mockReset();
    vi.mocked(reconnectStream).mockReset();
    vi.mocked(getConversation).mockReset();
    vi.mocked(stopStream).mockReset();
    vi.mocked(stopStream).mockResolvedValue(true);
  });

  it('以已有 assistant content 启动 continuation stream', async () => {
    const dispatch = vi.fn();
    const store = {
      getState: () => ({
        conversation: {
          byId: {
            'conv-1': {
              id: 'conv-1',
              messages: [
                {
                  id: 'msg-1',
                  role: 'assistant',
                  content: [{ type: 'text', id: 'old-text', text: '旧回答' }],
                },
              ],
            },
          },
        },
        stream: {
          currentRun: null,
          staticBlocks: [{ type: 'text', id: 'old-text', text: '旧回答' }],
          textBlocks: {},
          thinkingBlocks: {},
          blockOrder: [],
          blockTypes: {},
        },
      }),
    };

    vi.mocked(continueAgentRunStream).mockImplementation(async (_payload, callbacks) => {
      callbacks.onReady({ messageId: 'msg-1', conversationId: 'conv-1' });
      callbacks.onDone({ messageId: 'msg-1', conversationId: 'conv-1' });
    });

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch,
      store: store as never,
    }));

    await act(async () => {
      await result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
        previousRunId: 'run-1',
      });
    });

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/startStream',
      payload: expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        staticBlocks: [{ type: 'text', id: 'old-text', text: '旧回答' }],
      }),
    }));
    expect(continueAgentRunStream).toHaveBeenCalledWith(
      {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        previousRunId: 'run-1',
      },
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it.each([
    ['异常 EOF', recoverableError('流异常结束')],
    ['redis_read_failed', recoverableError('Redis 暂时不可访问', 'redis_read_failed')],
    ['可恢复 503', Object.assign(recoverableError('网关暂时不可用'), { statusCode: 503 })],
  ])('%s 只 POST 一次并从安全 cursor 续传，期间复用同一 assistant 与 partial', async (_label, failure) => {
    const { store, dispatch } = createReducerBackedHarness();
    let initialCallbacks: Parameters<typeof continueAgentRunStream>[1] | undefined;
    let partialSnapshot: ReturnType<typeof store.getState> | undefined;

    vi.mocked(continueAgentRunStream).mockImplementationOnce(async (_payload, callbacks) => {
      initialCallbacks = callbacks;
      callbacks.onEntryId?.('500-1');
      callbacks.onAnswering({ block_id: 'answer', delta: '补充前半段' });
      throw failure;
    });
    vi.mocked(reconnectStream).mockImplementationOnce(
      async (_conversationId, lastEntryId, callbacks) => {
        expect(lastEntryId).toBe('500-1');
        expect(callbacks).toBe(initialCallbacks);
        partialSnapshot = store.getState();
        callbacks.onAnswering({ block_id: 'answer', delta: '后半段' });
        callbacks.onDone({ messageId: 'msg-1', conversationId: 'conv-1' });
        return { entryId: '500-2' };
      },
    );

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch: dispatch as never,
      store: store as never,
    }));

    await act(async () => {
      await result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
        previousRunId: 'run-1',
      });
    });

    expect(continueAgentRunStream).toHaveBeenCalledTimes(1);
    expect(reconnectStream).toHaveBeenCalledTimes(1);
    expect(partialSnapshot?.stream.textBlocks.answer).toBe('补充前半段');
    expect(partialSnapshot?.conversation.byId['conv-1'].messages).toHaveLength(1);
    expect(partialSnapshot?.conversation.byId['conv-1'].messages[0].id).toBe('msg-1');
    const assistant = store.getState().conversation.byId['conv-1'].messages[0];
    expect(assistant.id).toBe('msg-1');
    expect(assistant.content).toEqual([
      { type: 'text', id: 'old-text', text: '旧回答' },
      expect.objectContaining({ type: 'text', id: 'answer', text: '补充前半段后半段' }),
    ]);
  });

  it('可恢复错误最多发起 3 次 GET，耗尽后仍保存同一 assistant 的 partial', async () => {
    const { store, dispatch } = createReducerBackedHarness();

    vi.mocked(continueAgentRunStream).mockImplementationOnce(async (_payload, callbacks) => {
      callbacks.onEntryId?.('600-1');
      callbacks.onAnswering({ block_id: 'answer', delta: '已生成部分' });
      throw recoverableError('流异常结束');
    });
    vi.mocked(reconnectStream).mockRejectedValue(recoverableError('仍未恢复'));

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch: dispatch as never,
      store: store as never,
    }));

    await act(async () => {
      await result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      });
    });

    expect(continueAgentRunStream).toHaveBeenCalledTimes(1);
    expect(reconnectStream).toHaveBeenCalledTimes(3);
    expect(vi.mocked(reconnectStream).mock.calls.every((call) => call[1] === '600-1')).toBe(true);
    const messages = store.getState().conversation.byId['conv-1'].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(expect.objectContaining({
      id: 'msg-1',
      content: [
        { type: 'text', id: 'old-text', text: '旧回答' },
        expect.objectContaining({ type: 'text', id: 'answer', text: '已生成部分' }),
      ],
    }));
  });

  it('终态错误不发起 GET 重连', async () => {
    const { store, dispatch } = createReducerBackedHarness();
    vi.mocked(continueAgentRunStream).mockRejectedValueOnce(
      terminalError('生成已中断'),
    );

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch: dispatch as never,
      store: store as never,
    }));

    await act(async () => {
      await result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      });
    });

    expect(reconnectStream).not.toHaveBeenCalled();
    expect(store.getState().stream.lastError?.message).toBe('生成已中断');
  });

  it('结构化终态 onError 已落 code/data 后，外层 catch 不再用 message-only 覆盖', async () => {
    const { store, dispatch } = createReducerBackedHarness();
    vi.mocked(continueAgentRunStream).mockImplementationOnce(async (_payload, callbacks) => {
      callbacks.onError('生成已中断', {
        code: 'stream_interrupted',
        data: { reason: 'worker_shutdown' },
      });
      throw terminalError('生成已中断');
    });

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch: dispatch as never,
      store: store as never,
    }));

    await act(async () => {
      await result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      });
    });

    expect(store.getState().stream.lastError).toEqual({
      message: '生成已中断',
      code: 'stream_interrupted',
      data: { reason: 'worker_shutdown' },
    });
    expect(
      dispatch.mock.calls
        .map(([action]) => action)
        .filter((action) => action.type === 'stream/setStreamError'),
    ).toHaveLength(1);
  });

  it('stop 能中断正在等待退避的重连且不再发起后续 GET', async () => {
    const { store, dispatch } = createReducerBackedHarness();
    vi.mocked(continueAgentRunStream).mockRejectedValueOnce(recoverableError('流异常结束'));
    vi.mocked(reconnectStream).mockRejectedValueOnce(recoverableError('首次重连失败'));

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch: dispatch as never,
      store: store as never,
    }));

    let continuation: Promise<void> | undefined;
    await act(async () => {
      continuation = result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      });
    });
    await waitFor(() => expect(reconnectStream).toHaveBeenCalledTimes(1));

    await act(async () => {
      expect(await result.current.stopContinueAgentRun()).toBe(true);
      await continuation;
    });

    await new Promise(resolve => setTimeout(resolve, 300));
    expect(reconnectStream).toHaveBeenCalledTimes(1);
  });

  it('stop 能中断正在进行的 GET 重连，abort 不会触发下一次重试', async () => {
    const { store, dispatch } = createReducerBackedHarness();
    let reconnectSignal: AbortSignal | undefined;
    vi.mocked(continueAgentRunStream).mockRejectedValueOnce(recoverableError('流异常结束'));
    vi.mocked(reconnectStream).mockImplementationOnce(
      async (_conversationId, _lastEntryId, _callbacks, signal) => {
        reconnectSignal = signal;
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        });
        return { entryId: '0' };
      },
    );

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch: dispatch as never,
      store: store as never,
    }));

    let continuation: Promise<void> | undefined;
    await act(async () => {
      continuation = result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      });
    });
    await waitFor(() => expect(reconnectStream).toHaveBeenCalledTimes(1));

    await act(async () => {
      expect(await result.current.stopContinueAgentRun()).toBe(true);
      await continuation;
    });

    expect(reconnectSignal?.aborted).toBe(true);
    expect(reconnectStream).toHaveBeenCalledTimes(1);
  });

  it('完成后刷新会话失败时不产生未处理的 stream error', async () => {
    const dispatch = vi.fn();
    const streamState = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      staticBlocks: [{ type: 'text', id: 'old-text', text: '旧回答' }],
      textBlocks: { 'new-text': '补充回答' },
      thinkingBlocks: {},
      blockOrder: ['new-text'],
      blockTypes: { 'new-text': 'text' },
      totalTextLength: 4,
      displayedTextLength: 4,
      isStreaming: true,
      isStreamingReasoning: false,
      isThinkingPhaseComplete: false,
      reasoningStartTime: null,
      reasoningEndTime: undefined,
      searchSources: [],
      lastEntryId: '0',
      streamStatus: 'streaming',
      currentRun: {
        runId: 'run-1',
        messageId: 'msg-1',
        status: 'limit_reached',
        config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
        totalSteps: 3,
        totalToolCalls: 1,
        steps: [],
        lastSequence: 3,
      },
      lastError: null,
    };
    const store = {
      getState: () => ({
        conversation: {
          byId: {
            'conv-1': {
              id: 'conv-1',
              messages: [
                {
                  id: 'msg-1',
                  role: 'assistant',
                  content: [{ type: 'text', id: 'old-text', text: '旧回答' }],
                },
              ],
            },
          },
        },
        stream: streamState,
      }),
    };

    vi.mocked(getConversation).mockRejectedValue(new Error('刷新失败'));
    vi.mocked(continueAgentRunStream).mockImplementation(async (_payload, callbacks) => {
      callbacks.onRunStarted?.({
        type: 'run_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 1,
        trace_id: 'run-1',
        ts: 1,
        conversation_id: 'conv-1',
        message_id: 'msg-1',
        model: 'deepseek-chat',
        tools: [],
        config: { max_steps: 3, max_tool_calls: 5, timeout_s: 60 },
      });
      callbacks.onDone({ messageId: 'msg-1', conversationId: 'conv-1' });
      await Promise.resolve();
    });

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch,
      store: store as never,
    }));

    await act(async () => {
      await result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
        previousRunId: 'run-1',
      });
      await Promise.resolve();
    });

    expect(getConversation).toHaveBeenCalledWith('conv-1');
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'stream/endStream' }));
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'stream/setStreamError' }));
  });

  it('完成后刷新会话时将服务端 agent_run 转成前端 AgentRunState', async () => {
    const dispatch = vi.fn();
    const store = {
      getState: () => ({
        conversation: {
          byId: {
            'conv-1': {
              id: 'conv-1',
              messages: [
                {
                  id: 'msg-1',
                  role: 'assistant',
                  content: [{ type: 'text', id: 'old-text', text: '旧回答' }],
                },
              ],
            },
          },
        },
        stream: {
          conversationId: 'conv-1',
          messageId: 'msg-1',
          staticBlocks: [{ type: 'text', id: 'old-text', text: '旧回答' }],
          textBlocks: {},
          thinkingBlocks: {},
          blockOrder: [],
          blockTypes: {},
          totalTextLength: 0,
          displayedTextLength: 0,
          isStreaming: true,
          isStreamingReasoning: false,
          isThinkingPhaseComplete: false,
          reasoningStartTime: null,
          reasoningEndTime: undefined,
          searchSources: [],
          lastEntryId: '0',
          streamStatus: 'streaming',
          currentRun: {
            runId: 'run-1',
            messageId: 'msg-1',
            status: 'limit_reached',
            config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
            totalSteps: 3,
            totalToolCalls: 1,
            steps: [],
            lastSequence: 3,
          },
          lastError: null,
        },
      }),
    };

    vi.mocked(getConversation).mockResolvedValue({
      id: 'conv-1',
      title: '会话',
      model_id: 'deepseek-chat',
      created_at: '2026-06-28T10:00:00Z',
      updated_at: '2026-06-28T10:01:00Z',
      messages: [
        {
          id: 'msg-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'db-text', text: '数据库回答' }],
          model_id: 'deepseek-chat',
          created_at: '2026-06-28T10:01:00Z',
          agent_run: {
            run_id: 'run-1',
            status: 'limit_reached',
            config: { max_steps: 3, max_tool_calls: 5, timeout_s: 60 },
            total_steps: 3,
            total_tool_calls: 5,
            limit_reason: 'max_steps',
          },
        },
      ],
    });
    vi.mocked(continueAgentRunStream).mockImplementation(async (_payload, callbacks) => {
      callbacks.onDone({ messageId: 'msg-1', conversationId: 'conv-1' });
      await Promise.resolve();
    });

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch,
      store: store as never,
    }));

    await act(async () => {
      await result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
        previousRunId: 'run-1',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const refreshPatch = dispatch.mock.calls
      .map(([action]) => action)
      .find(action => action?.type === 'conversation/updateMessage' && action.payload?.patch?.agent_run);

    expect(refreshPatch?.payload.patch.agent_run).toMatchObject({
      runId: 'run-1',
      messageId: 'msg-1',
      serverMessageId: 'msg-1',
      status: 'limit_reached',
      config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
      limitReachedReason: 'max_steps',
    });
  });

  it('停止 continuation 时保存静态内容和当前增量，并忽略迟到 done', async () => {
    const dispatch = vi.fn();
    const streamState = {
      conversationId: 'conv-1',
      messageId: 'msg-1',
      staticBlocks: [{ type: 'text', id: 'old-text', text: '旧回答' }],
      textBlocks: { 'new-text': '补充回答' },
      thinkingBlocks: {},
      blockOrder: ['new-text'],
      blockTypes: { 'new-text': 'text' },
      totalTextLength: 4,
      displayedTextLength: 4,
      isStreaming: true,
      isStreamingReasoning: false,
      isThinkingPhaseComplete: false,
      reasoningStartTime: null,
      reasoningEndTime: undefined,
      searchSources: [],
      lastEntryId: '0',
      streamStatus: 'streaming',
      currentRun: {
        runId: 'run-1',
        messageId: 'msg-1',
        serverMessageId: 'server-msg-1',
        status: 'running',
        config: { maxSteps: 3, maxToolCalls: 5, timeoutS: 60 },
        totalSteps: 1,
        totalToolCalls: 0,
        steps: [],
        lastSequence: 1,
      },
      lastError: null,
    };
    const store = {
      getState: () => ({
        conversation: {
          byId: {
            'conv-1': {
              id: 'conv-1',
              messages: [
                {
                  id: 'msg-1',
                  role: 'assistant',
                  content: [{ type: 'text', id: 'old-text', text: '旧回答' }],
                },
              ],
            },
          },
        },
        stream: streamState,
      }),
    };
    let capturedCallbacks: Parameters<typeof continueAgentRunStream>[1] | null = null;
    let capturedSignal: AbortSignal | null = null;
    vi.mocked(continueAgentRunStream).mockImplementation(async (_payload, callbacks, signal) => {
      capturedCallbacks = callbacks;
      capturedSignal = signal ?? null;
      callbacks.onRunStarted?.({
        type: 'run_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 1,
        trace_id: 'run-1',
        ts: 1,
        conversation_id: 'conv-1',
        message_id: 'server-msg-1',
        model: 'deepseek-chat',
        tools: [],
        config: { max_steps: 3, max_tool_calls: 5, timeout_s: 60 },
      });
      await new Promise<void>(resolve => signal?.addEventListener('abort', () => resolve(), { once: true }));
      callbacks.onDone({ messageId: 'server-msg-1', conversationId: 'conv-1' });
    });

    const { result } = renderHook(() => useContinueAgentRun({
      dispatch,
      store: store as never,
    }));

    await act(async () => {
      void result.current.continueAgentRun({
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
        previousRunId: 'run-1',
      });
      await Promise.resolve();
    });

    await act(async () => {
      const stopped = await result.current.stopContinueAgentRun();
      expect(stopped).toBe(true);
      capturedCallbacks?.onDone({ messageId: 'server-msg-1', conversationId: 'conv-1' });
      await Promise.resolve();
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(stopStream).toHaveBeenCalledWith('conv-1', 'server-msg-1');
    const contentPatches = dispatch.mock.calls
      .map(([action]) => action)
      .filter(action => action?.type === 'conversation/updateMessage' && action.payload?.patch?.content);
    expect(contentPatches).toHaveLength(1);
    expect(contentPatches[0].payload.patch.content).toEqual([
      { type: 'text', id: 'old-text', text: '旧回答' },
      { type: 'text', id: 'new-text', text: '补充回答' },
    ]);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'stream/endStream' }));
  });
});
