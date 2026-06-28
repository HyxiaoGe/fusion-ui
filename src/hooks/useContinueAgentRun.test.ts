import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContinueAgentRun } from './useContinueAgentRun';
import { continueAgentRunStream, getConversation, stopStream } from '@/lib/api/chat';

vi.mock('@/lib/api/chat', () => ({
  continueAgentRunStream: vi.fn(),
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

describe('useContinueAgentRun', () => {
  beforeEach(() => {
    vi.mocked(continueAgentRunStream).mockReset();
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
