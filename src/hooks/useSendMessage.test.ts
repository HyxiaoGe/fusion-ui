import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import authReducer from '@/redux/slices/authSlice';
import conversationReducer from '@/redux/slices/conversationSlice';
import modelsReducer from '@/redux/slices/modelsSlice';
import streamReducer from '@/redux/slices/streamSlice';
import { upsertConversation } from '@/redux/slices/conversationSlice';
import { useSendMessage } from './useSendMessage';
import type { StreamCallbacks } from '@/lib/api/chat';

const {
  sendMessageStreamMock,
  getConversationMock,
  generateChatTitleMock,
  uuidMock,
} = vi.hoisted(() => ({
  sendMessageStreamMock: vi.fn(),
  getConversationMock: vi.fn(),
  generateChatTitleMock: vi.fn(),
  uuidMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  sendMessageStream: sendMessageStreamMock,
  getConversation: getConversationMock,
  // useSendMessage 内部 dynamic import('@/lib/api/chat') 取 stopStream，
  // 必须在 mock 里也提供 stub，避免「No "stopStream" export」错误
  stopStream: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/title', () => ({
  generateChatTitle: generateChatTitleMock,
}));

vi.mock('uuid', () => ({
  v4: uuidMock,
}));

function createStore() {
  return configureStore({
    reducer: {
      auth: authReducer,
      conversation: conversationReducer,
      models: modelsReducer,
      stream: streamReducer,
    },
    middleware: (getDefaultMiddleware: any) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
    preloadedState: {
      auth: {
        isAuthenticated: true,
        token: null,
        status: 'idle' as const,
        error: null,
        user: null,
      },
      models: {
        models: [
          {
            id: 'model-1',
            name: 'Model One',
            provider: 'openai',
            enabled: true,
            temperature: 0.7,
            capabilities: {
              deepThinking: true,
              fileSupport: false,
            },
          },
        ],
        providers: [],
        selectedModelId: 'model-1',
        isLoading: false,
      },
    } as any,
  } as any);
}

function createWrapper(store: ReturnType<typeof createStore>) {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store }, children);
  };
}

let nextIntervalId = 0;
let intervalCallbacks = new Map<number, () => void>();

function tickIntervals(times = 1) {
  for (let i = 0; i < times; i += 1) {
    const callbacks = Array.from(intervalCallbacks.values());
    callbacks.forEach((callback) => callback());
  }
}

describe('useSendMessage', () => {
  beforeEach(() => {
    sendMessageStreamMock.mockReset();
    getConversationMock.mockReset();
    generateChatTitleMock.mockReset();
    generateChatTitleMock.mockResolvedValue('Generated Title');
    uuidMock.mockReset();
    uuidMock
      .mockReturnValueOnce('temp-conv')
      .mockReturnValueOnce('user-1')
      .mockReturnValueOnce('assistant-1')
      .mockReturnValueOnce('temp-conv-2')
      .mockReturnValueOnce('user-2')
      .mockReturnValueOnce('assistant-2');
    nextIntervalId = 0;
    intervalCallbacks = new Map<number, () => void>();
    vi.stubGlobal(
      'setInterval',
      vi.fn((callback: TimerHandler) => {
        const id = ++nextIntervalId;
        intervalCallbacks.set(id, callback as () => void);
        return id;
      })
    );
    vi.stubGlobal(
      'clearInterval',
      vi.fn((id: number) => {
        intervalCallbacks.delete(id);
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('materializes a draft conversation and migrates the active stream', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();

    sendMessageStreamMock.mockImplementation(
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onReasoning({ block_id: 'blk_t', delta: 'think' });
        callbacks.onReasoning({ block_id: 'blk_t', delta: 'ing' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'ans' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'wer' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', {
        conversationId: null,
        onMaterialized,
      });
    });

    await act(async () => {
      tickIntervals(2);
    });

    await waitFor(() => {
      const state = store.getState();
      expect(onMaterialized).toHaveBeenCalledWith('server-conv');
      expect(state.conversation.pendingConversationId).toBeNull();
      expect(state.conversation.byId['server-conv']).toBeDefined();
      expect(state.conversation.byId['server-conv'].messages[0]).toEqual(
        expect.objectContaining({ id: 'user-1', status: null, chatId: 'server-conv' })
      );
      // assistant message should have content blocks
      const assistantMsg = state.conversation.byId['server-conv'].messages[1];
      expect(assistantMsg.id).toBe('assistant-1');
      expect(assistantMsg.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'thinking' }),
          expect.objectContaining({ type: 'text' }),
        ])
      );
      expect(state.stream.isStreaming).toBe(false);
    });
  });

  it('uses completion time as assistant timestamp so long first replies can still fetch suggestions', async () => {
    const store = createStore();
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    sendMessageStreamMock.mockImplementation(
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'long answer' });
        vi.mocked(Date.now).mockReturnValue(95_000);
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', {
        conversationId: null,
      });
    });

    await act(async () => {
      tickIntervals(4);
    });

    await waitFor(() => {
      const assistantMsg = store.getState().conversation.byId['server-conv'].messages.find(
        (m: any) => m.role === 'assistant'
      );
      expect(assistantMsg?.timestamp).toBe(95_000);
    });
  });

  it('exposes the local draft conversation before waiting for the stream to be ready', async () => {
    const store = createStore();
    const onDraftCreated = vi.fn();
    let releaseStream: (() => void) | undefined;

    sendMessageStreamMock.mockImplementation(
      async () => {
        await new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', {
        conversationId: null,
        onDraftCreated,
      } as any);
    });

    await waitFor(() => {
      expect(onDraftCreated).toHaveBeenCalledWith('temp-conv');
    });

    const state = store.getState();
    expect(state.conversation.byId['temp-conv']?.messages).toHaveLength(2);
    expect(state.stream.conversationId).toBe('temp-conv');
    expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);

    releaseStream?.();
  });

  it('stops the previous stream before sending a new message', async () => {
    const store = createStore();
    let firstSignal: AbortSignal | undefined;
    let releaseFirstStream: (() => void) | undefined;

    sendMessageStreamMock
      .mockImplementationOnce(
        async (_payload: any, _callbacks: any, signal?: AbortSignal) => {
          firstSignal = signal;
          await new Promise<void>((resolve) => {
            releaseFirstStream = resolve;
          });
        }
      )
      .mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-2', conversationId: 'server-conv-2' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'second answer' });
        callbacks.onDone({ messageId: 'assistant-2', conversationId: 'server-conv-2' });
      });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('first', { conversationId: null });
    });

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(true);
    });

    await act(async () => {
      await result.current.sendMessage('second', { conversationId: null });
    });

    releaseFirstStream?.();

    await act(async () => {
      tickIntervals(4);
    });

    await waitFor(() => {
      const state = store.getState();
      expect(firstSignal?.aborted).toBe(true);
      expect(state.conversation.byId['server-conv-2']).toBeDefined();
    });
  });

  it('handles stream errors gracefully', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onReasoning({ block_id: 'blk_t', delta: 'thinking' });
      callbacks.onAnswering({ block_id: 'blk_c', delta: 'hello world!' });
      tickIntervals(2);
      callbacks.onError('模型调用超时');
      throw new Error('模型调用超时');
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await waitFor(() => {
      const state = store.getState();
      expect(state.stream.isStreaming).toBe(false);
      expect(state.conversation.globalError).toBe('模型调用超时');
      expect(state.conversation.byId['existing-conv'].messages[0]).toEqual(
        expect.objectContaining({ role: 'user', status: 'failed' })
      );
    });
  });

  it('把图片尺寸不合规的模型原始错误转成可读提示', async () => {
    const store = createStore();
    const rawImageSizeError = "litellm.BadRequestError: Error code: 400 - {'error': {'message': 'litellm.BadRequestError: OpenAIException - <400> InternalError.Algo.InvalidParameter: The image length and width do not meet the model restrictions. [height:2 or width:2 must be larger than 10]. Received Model Group=qwen3.6-plus\\nAvailable Model Group Fallbacks=None', 'type': 'invalid_request_error', 'param': None, 'code': '400'}}";
    const friendlyMessage = '图片尺寸过小，当前模型要求宽高都大于 10 像素，请换一张更大的图片后重试';

    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onError(rawImageSizeError, { code: '400' });
      throw new Error(rawImageSizeError);
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('描述图片', { conversationId: 'existing-conv' }, [
        {
          fileId: 'file-small-image',
          filename: 'tiny.png',
          mimeType: 'image/png',
        },
      ]);
    });

    await waitFor(() => {
      const state = store.getState();
      expect(state.conversation.globalError).toBe(friendlyMessage);
      expect(state.stream.lastError?.message).toBe(friendlyMessage);
      expect(state.conversation.byId['existing-conv'].messages[0]).toEqual(
        expect.objectContaining({ role: 'user', status: 'failed' })
      );
    });
  });

  it('materializes draft on first streamed chunk before completion', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();
    let releaseStream: (() => void) | undefined;

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'server-assistant-id', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'part' });
        await new Promise<void>((resolve) => { releaseStream = resolve; });
        callbacks.onDone({ messageId: 'server-assistant-id', conversationId: 'server-conv' });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', {
        conversationId: null,
        onMaterialized,
      });
    });

    await waitFor(() => {
      const state = store.getState();
      expect(onMaterialized).toHaveBeenCalledWith('server-conv');
      expect(state.conversation.byId['server-conv']).toBeDefined();
      expect(state.stream.conversationId).toBe('server-conv');
    });

    await act(async () => { releaseStream?.(); });
    await act(async () => { tickIntervals(4); });

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(false);
    });
  });

  it('dispatches initRun when onRunStarted fires', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    let releaseStream: (() => void) | undefined;
    let runSnapshot: ReturnType<typeof store.getState>['stream']['currentRun'] = null;

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onRunStarted?.({
        type: 'run_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 1,
        trace_id: 'trace-1',
        ts: Date.now(),
        conversation_id: 'existing-conv',
        message_id: 'assistant-1',
        model: 'model-1',
        tools: ['web_search'],
        config: { max_steps: 5, max_tool_calls: 10, timeout_s: 60 },
      });
      // 在流结束前快照 currentRun（doCompleteStream 会 endStream 清空）
      runSnapshot = store.getState().stream.currentRun;
      await new Promise<void>((resolve) => { releaseStream = resolve; });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await waitFor(() => {
      expect(runSnapshot).not.toBeNull();
    });

    expect(runSnapshot?.runId).toBe('run-1');
    expect(runSnapshot?.config).toEqual({ maxSteps: 5, maxToolCalls: 10, timeoutS: 60 });

    await act(async () => { releaseStream?.(); });
  });

  it('dispatches finalizeToolCall when onToolCallCompleted fires', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    let releaseStream: (() => void) | undefined;
    let runSnapshot: ReturnType<typeof store.getState>['stream']['currentRun'] = null;

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onRunStarted?.({
        type: 'run_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 1,
        trace_id: 'trace-1',
        ts: Date.now(),
        conversation_id: 'existing-conv',
        message_id: 'assistant-1',
        model: 'model-1',
        tools: ['web_search'],
        config: { max_steps: 5, max_tool_calls: 10, timeout_s: 60 },
      });
      callbacks.onStepStarted?.({
        type: 'step_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 2,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
      });
      callbacks.onToolCallStarted?.({
        type: 'tool_call_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: 'tc-1',
        sequence: 3,
        trace_id: 'trace-1',
        ts: Date.now(),
        tool_name: 'web_search',
        arguments: { query: 'hello' },
      });
      callbacks.onToolCallCompleted?.({
        type: 'tool_call_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: 'tc-1',
        sequence: 4,
        trace_id: 'trace-1',
        ts: Date.now(),
        tool_name: 'web_search',
        status: 'success',
        duration_ms: 123,
        result_summary: { kind: 'web_search', count: 3, truncated: false },
        error: null,
      });
      runSnapshot = store.getState().stream.currentRun;
      await new Promise<void>((resolve) => { releaseStream = resolve; });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await waitFor(() => {
      expect(runSnapshot).not.toBeNull();
    });

    const tc = runSnapshot?.steps[0]?.toolCalls[0];
    expect(tc?.status).toBe('success');
    expect(tc?.resultSummary).toEqual({ kind: 'web_search', count: 3, truncated: false });

    await act(async () => { releaseStream?.(); });
  });

  it('普通无工具问答：endStream 保留 currentRun，不触发 agent DB refresh', async () => {
    // 场景：走过 onRunStarted 但 totalToolCalls=0（如 stop 即结束），
    // 修复后 isAgentMode 应为 false，不触发 getConversation
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onRunStarted?.({
        type: 'run_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 1,
        trace_id: 'trace-1',
        ts: Date.now(),
        conversation_id: 'existing-conv',
        message_id: 'assistant-1',
        model: 'model-1',
        tools: [],
        config: { max_steps: 5, max_tool_calls: 10, timeout_s: 60 },
      });
      callbacks.onStepStarted?.({
        type: 'step_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 2,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
      });
      callbacks.onAnswering({ block_id: 'blk_c', delta: 'plain answer' });
      callbacks.onStepCompleted?.({
        type: 'step_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 3,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
        tool_call_count: 0,
        duration_ms: 10,
      });
      callbacks.onRunCompleted?.({
        type: 'run_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 4,
        trace_id: 'trace-1',
        ts: Date.now(),
        total_steps: 1,
        total_tool_calls: 0,
        finish_reason: 'stop',
      });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await act(async () => {
      tickIntervals(5);
    });

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(false);
    });

    // 关键断言：currentRun 仍保留（方案 A），但因 totalToolCalls=0 不应触发 getConversation
    expect(store.getState().stream.currentRun).not.toBeNull();
    expect(store.getState().stream.currentRun?.totalToolCalls).toBe(0);
    expect(getConversationMock).not.toHaveBeenCalled();
  });

  it('普通无工具问答：reasoning-only 完成时恢复为正文，避免最终正文空白', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onRunStarted?.({
        type: 'run_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 1,
        trace_id: 'trace-1',
        ts: Date.now(),
        conversation_id: 'existing-conv',
        message_id: 'assistant-1',
        model: 'model-1',
        tools: [],
        config: { max_steps: 5, max_tool_calls: 10, timeout_s: 60 },
      });
      callbacks.onStepStarted?.({
        type: 'step_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 2,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
      });
      callbacks.onReasoning({ block_id: 'blk_t', delta: '你好！我是 DeepSeek。' });
      callbacks.onStepCompleted?.({
        type: 'step_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 3,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
        tool_call_count: 0,
        duration_ms: 10,
      });
      callbacks.onRunCompleted?.({
        type: 'run_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 4,
        trace_id: 'trace-1',
        ts: Date.now(),
        total_steps: 1,
        total_tool_calls: 0,
        finish_reason: 'stop',
      });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(false);
    });

    const assistantMsg = store.getState().conversation.byId['existing-conv'].messages.find(
      (m: any) => m.role === 'assistant'
    );
    expect(assistantMsg?.content).toEqual([
      { type: 'text', id: 'recovered-blk_t', text: '你好！我是 DeepSeek。' },
    ]);
    expect(getConversationMock).not.toHaveBeenCalled();
  });

  it('run_completed finish_reason=incomplete 时保留 incomplete 状态', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onRunStarted?.({
        type: 'run_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 1,
        trace_id: 'trace-1',
        ts: Date.now(),
        conversation_id: 'existing-conv',
        message_id: 'assistant-1',
        model: 'model-1',
        tools: [],
        config: { max_steps: 5, max_tool_calls: 10, timeout_s: 60 },
      });
      callbacks.onStepStarted?.({
        type: 'step_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 2,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
      });
      callbacks.onAnswering({ block_id: 'blk_c', delta: 'partial answer' });
      callbacks.onStepCompleted?.({
        type: 'step_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 3,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
        tool_call_count: 0,
        duration_ms: 10,
      });
      callbacks.onRunCompleted?.({
        type: 'run_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 4,
        trace_id: 'trace-1',
        ts: Date.now(),
        total_steps: 1,
        total_tool_calls: 0,
        finish_reason: 'incomplete',
      });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await act(async () => {
      tickIntervals(5);
    });

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(false);
    });

    expect(store.getState().stream.currentRun?.status).toBe('incomplete');
  });

  it('agent run 含 tool_call：仍触发 agent DB refresh', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    getConversationMock.mockResolvedValue({
      id: 'existing-conv',
      messages: [
        {
          id: 'srv-asst-1',
          role: 'assistant',
          content: [{ type: 'text', text: 'final from db' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      ],
    });

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onRunStarted?.({
        type: 'run_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 1,
        trace_id: 'trace-1',
        ts: Date.now(),
        conversation_id: 'existing-conv',
        message_id: 'assistant-1',
        model: 'model-1',
        tools: ['web_search'],
        config: { max_steps: 5, max_tool_calls: 10, timeout_s: 60 },
      });
      callbacks.onStepStarted?.({
        type: 'step_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 2,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
      });
      callbacks.onToolCallStarted?.({
        type: 'tool_call_started',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: 'tc-1',
        sequence: 3,
        trace_id: 'trace-1',
        ts: Date.now(),
        tool_name: 'web_search',
        arguments: { query: 'hello' },
      });
      callbacks.onToolCallCompleted?.({
        type: 'tool_call_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: 'tc-1',
        sequence: 4,
        trace_id: 'trace-1',
        ts: Date.now(),
        tool_name: 'web_search',
        status: 'success',
        duration_ms: 50,
        result_summary: { kind: 'web_search', count: 2, truncated: false },
        error: null,
      });
      callbacks.onAnswering({ block_id: 'blk_c', delta: 'agent answer' });
      callbacks.onStepCompleted?.({
        type: 'step_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: 'step-1',
        parent_step_id: null,
        tool_call_id: null,
        sequence: 5,
        trace_id: 'trace-1',
        ts: Date.now(),
        step_number: 1,
        tool_call_count: 1,
        duration_ms: 60,
      });
      callbacks.onRunCompleted?.({
        type: 'run_completed',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 6,
        trace_id: 'trace-1',
        ts: Date.now(),
        total_steps: 1,
        total_tool_calls: 1,
        finish_reason: 'stop',
      });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await act(async () => {
      tickIntervals(5);
    });

    await waitFor(() => {
      expect(getConversationMock).toHaveBeenCalledWith('existing-conv');
    });
    expect(store.getState().stream.currentRun?.totalToolCalls).toBe(1);

    await waitFor(() => {
      const assistantMsg = store.getState().conversation.byId['existing-conv'].messages.find(
        (m: any) => m.role === 'assistant'
      );
      expect(assistantMsg).toEqual(
        expect.objectContaining({
          id: 'srv-asst-1',
          content: [{ type: 'text', text: 'final from db' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        })
      );
    });
  });

  it('completes immediately when onDone arrives without any content', async () => {
    const store = createStore();

    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onReasoning({ block_id: 'blk_t', delta: 'thinking' });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await waitFor(() => {
      const state = store.getState();
      expect(state.stream.isStreaming).toBe(false);
      const assistantMsg = state.conversation.byId['existing-conv'].messages.find(
        (m: any) => m.role === 'assistant'
      );
      expect(assistantMsg?.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'thinking', thinking: 'thinking' }),
        ])
      );
    });
  });
});
