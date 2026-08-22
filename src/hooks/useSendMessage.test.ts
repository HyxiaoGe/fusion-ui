import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import authReducer, { logout } from '@/redux/slices/authSlice';
import conversationReducer, {
  appendMessage,
  setComposerAgentMode,
  setHydrationStatus,
} from '@/redux/slices/conversationSlice';
import modelsReducer, {
  setSelectedModel,
  updateModels,
} from '@/redux/slices/modelsSlice';
import streamReducer from '@/redux/slices/streamSlice';
import trajectoryReducer from '@/redux/slices/trajectorySlice';
import { resetConversationState, upsertConversation } from '@/redux/slices/conversationSlice';
import { useSendMessage } from './useSendMessage';
import type { StreamCallbacks } from '@/lib/api/chat';
import type { NormalizedTrajectoryEvent } from '@/lib/trajectory/normalizeTrajectoryEvent';
import type { Message } from '@/types/conversation';
import {
  loadConversationDetail,
  resetConversationDetailResource,
} from '@/lib/chat/conversationDetailResource';
import {
  CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY,
  CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY,
  CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
} from '@/lib/chat/contextStatusPersistence';

const {
  sendMessageStreamMock,
  getChatCapabilitiesMock,
  reconnectStreamMock,
  stopStreamMock,
  getConversationMock,
  generateChatTitleMock,
  uuidMock,
} = vi.hoisted(() => ({
  sendMessageStreamMock: vi.fn(),
  getChatCapabilitiesMock: vi.fn(),
  reconnectStreamMock: vi.fn(),
  stopStreamMock: vi.fn(),
  getConversationMock: vi.fn(),
  generateChatTitleMock: vi.fn(),
  uuidMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  getChatCapabilities: getChatCapabilitiesMock,
  sendMessageStream: sendMessageStreamMock,
  reconnectStream: reconnectStreamMock,
  isRecoverableStreamError: (error: unknown) => Boolean((error as { recoverable?: boolean })?.recoverable),
  getConversation: getConversationMock,
  // useSendMessage 内部 dynamic import('@/lib/api/chat') 取 stopStream，
  // 必须在 mock 里也提供 stub，避免「No "stopStream" export」错误
  stopStream: stopStreamMock,
}));

vi.mock('@/lib/api/title', () => ({
  generateChatTitle: generateChatTitleMock,
}));

vi.mock('uuid', () => ({
  v4: uuidMock,
}));

function createUser(id: string) {
  return {
    id,
    username: id,
    email: null,
    nickname: null,
    avatar: null,
    mobile: null,
    system_prompt: '',
    is_superuser: false,
  };
}

function createStore({
  functionCalling = true,
  searchCapable = true,
  agentTools = true,
}: {
  functionCalling?: boolean;
  searchCapable?: boolean;
  agentTools?: boolean;
} = {}) {
  return configureStore({
    reducer: {
      auth: authReducer,
      conversation: conversationReducer,
      models: modelsReducer,
      stream: streamReducer,
      trajectory: trajectoryReducer,
    },
    middleware: (getDefaultMiddleware: any) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
    preloadedState: {
      auth: {
        isAuthenticated: true,
        token: 'token-user-a',
        status: 'idle' as const,
        error: null,
        user: createUser('user-a'),
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
              functionCalling,
              searchCapable,
              agentTools,
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
    const TypedProvider = Provider as React.ComponentType<{
      store: ReturnType<typeof createStore>;
    }>;
    return React.createElement(TypedProvider, { store }, children);
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

function streamError(message: string, recoverable: boolean) {
  return Object.assign(new Error(message), { recoverable });
}

function emitRunStarted(callbacks: StreamCallbacks) {
  callbacks.onRunStarted?.({
    type: 'run_started',
    protocol_version: 2,
    run_id: 'run-knowledge',
    parent_run_id: null,
    step_id: null,
    parent_step_id: null,
    tool_call_id: null,
    sequence: 0,
    trace_id: 'run-knowledge',
    ts: 0,
    conversation_id: 'server-conv',
    message_id: 'assistant-1',
    model: 'model-1',
    tools: [],
    config: {
      max_steps: 8,
      max_tool_calls: 20,
      timeout_s: 300,
      plan_mode: 'auto',
      task_mode: 'standard',
    },
  });
}

function normalizedRunEvent(
  eventType: 'run_started' | 'run_completed',
  sequence: number,
): NormalizedTrajectoryEvent {
  return {
    runId: 'run-trajectory',
    sequence,
    eventType,
    schemaVersion: 1,
    timestamp: `2026-08-22T00:00:0${sequence}.000Z`,
    stepId: null,
    toolCallId: null,
    parentStepId: null,
    traceId: 'trace-trajectory',
    payload: eventType === 'run_started'
      ? { conversation_id: 'server-conv', message_id: 'assistant-1' }
      : { total_steps: 1, total_tool_calls: 0, finish_reason: 'stop' },
  };
}

function knowledgeEvidenceBlock(status: 'success' | 'empty') {
  return {
    type: 'knowledge_evidence',
    id: `knowledge-${status}`,
    schema_version: 1,
    query: '退款时限',
    status,
    source_count: status === 'success' ? 1 : 0,
    knowledge_base_ids: ['kb-1'],
    source_refs: status === 'success'
      ? [{
          kind: 'knowledge',
          evidence_id: 'knowledge-ref-1',
          citation_index: 1,
          knowledge_base_id: 'kb-1',
          knowledge_base_name: '客服手册',
          document_id: 'doc-1',
          index_version: 'v2',
          chunk_id: 'chunk-1',
          ordinal: 0,
          filename: '退款.md',
          page: 2,
          section: '退款时限',
          char_start: 0,
          char_end: 100,
          status: 'success',
        }]
      : [],
  };
}

describe('useSendMessage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    sendMessageStreamMock.mockReset();
    getChatCapabilitiesMock.mockReset();
    getChatCapabilitiesMock.mockResolvedValue({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
      message_retry_v1: true,
    });
    reconnectStreamMock.mockReset();
    stopStreamMock.mockReset();
    stopStreamMock.mockResolvedValue(undefined);
    getConversationMock.mockReset();
    getConversationMock.mockRejectedValue(new Error('测试默认跳过完成后权威水合'));
    resetConversationDetailResource();
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
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('发送知识库范围并强制关闭 deep_research，同时把选择保留在本地会话', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    store.dispatch(setComposerAgentMode('deep_research'));
    sendMessageStreamMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('只按手册回答', {
        conversationId: 'existing-conv',
        knowledgeBaseIds: ['kb-1', 'kb-2'],
      });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledge_base_ids: ['kb-1', 'kb-2'],
        options: expect.objectContaining({
          task_mode: 'standard',
        }),
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
    expect(store.getState().conversation.byId['existing-conv'].knowledge_base_ids).toEqual([
      'kb-1',
      'kb-2',
    ]);
  });

  it('服务端缺少严格知识库能力时在任何乐观写入前终止发送', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-old'],
      messages: [],
      createdAt: 100,
      updatedAt: 200,
    }));
    getChatCapabilitiesMock.mockRejectedValueOnce(new Error('404'));

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('只按手册回答', {
        conversationId: 'existing-conv',
        knowledgeBaseIds: ['kb-new'],
      });
    });

    expect(sendMessageStreamMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.byId['existing-conv'].knowledge_base_ids).toEqual(['kb-old']);
    expect(store.getState().conversation.byId['existing-conv'].messages).toEqual([]);
    expect(store.getState().conversation.globalError).toBe('知识库问答当前不可用，请刷新页面后重试');
  });

  it('严格知识库能力预检期间拒绝另一 composer 的普通发送且只启动一个后台流', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-1'],
      messages: [],
      createdAt: 100,
      updatedAt: 200,
    }));
    let resolveCapabilities: (value: {
      knowledge_grounding_v1: boolean;
      knowledge_grounding_max_bases: number;
    }) => void = () => {
      throw new Error('能力预检尚未开始');
    };
    getChatCapabilitiesMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCapabilities = resolve;
    }));
    sendMessageStreamMock.mockResolvedValue(undefined);
    const firstRejected = vi.fn();
    const secondRejected = vi.fn();

    const { result: firstSender } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    const { result: secondSender } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    let firstSend: Promise<void>;
    let secondSend: Promise<void>;
    act(() => {
      firstSend = firstSender.current.sendMessage('第一条', {
        conversationId: 'existing-conv',
        knowledgeBaseIds: ['kb-1'],
        onRejectedBeforeSend: firstRejected,
      });
      secondSend = secondSender.current.sendMessage('第二条普通消息', {
        conversationId: 'existing-conv',
        knowledgeBaseIds: [],
        onRejectedBeforeSend: secondRejected,
      });
    });

    await waitFor(() => {
      expect(getChatCapabilitiesMock).toHaveBeenCalledTimes(1);
      expect(secondRejected).toHaveBeenCalledTimes(1);
    });
    expect(sendMessageStreamMock).not.toHaveBeenCalled();

    resolveCapabilities({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
    });
    await act(async () => {
      await Promise.all([firstSend!, secondSend!]);
    });

    expect(firstRejected).not.toHaveBeenCalled();
    expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);
  });

  it('轨迹 retry 在知识库能力等待期间失效时拒绝发送且不替换消息', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-1'],
      messages: [],
      createdAt: 100,
      updatedAt: 200,
    }));
    let resolveCapabilities!: (value: {
      knowledge_grounding_v1: boolean;
      knowledge_grounding_max_bases: number;
    }) => void;
    getChatCapabilitiesMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCapabilities = resolve;
    }));
    let eligible = true;
    const onRejectedBeforeSend = vi.fn();
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    let pendingSend!: Promise<void>;
    act(() => {
      pendingSend = result.current.sendMessage('重新回答', {
        conversationId: 'existing-conv',
        knowledgeBaseIds: ['kb-1'],
        canStart: () => eligible,
        onRejectedBeforeSend,
      });
    });
    await waitFor(() => expect(getChatCapabilitiesMock).toHaveBeenCalledTimes(1));
    eligible = false;
    resolveCapabilities({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
    });
    await act(async () => {
      await pendingSend;
    });

    expect(onRejectedBeforeSend).toHaveBeenCalledTimes(1);
    expect(sendMessageStreamMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.byId['existing-conv'].messages).toEqual([]);
  });

  it('严格知识库能力预检期间切换账号时拒绝旧会话草稿且不启动后台流', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-1'],
      messages: [],
      createdAt: 100,
      updatedAt: 200,
    }));
    let resolveCapabilities: (value: {
      knowledge_grounding_v1: boolean;
      knowledge_grounding_max_bases: number;
    }) => void = () => {
      throw new Error('能力预检尚未开始');
    };
    getChatCapabilitiesMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveCapabilities = resolve;
    }));
    const onRejectedBeforeSend = vi.fn();

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    let pendingSend: Promise<void>;
    act(() => {
      pendingSend = result.current.sendMessage('旧账号草稿', {
        conversationId: 'existing-conv',
        knowledgeBaseIds: ['kb-1'],
        onRejectedBeforeSend,
      });
    });
    await waitFor(() => expect(getChatCapabilitiesMock).toHaveBeenCalledTimes(1));

    act(() => {
      store.dispatch({
        type: 'auth/fetchUserProfile/fulfilled',
        payload: createUser('user-b'),
      });
    });
    resolveCapabilities({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
    });
    await act(async () => {
      await pendingSend!;
    });

    expect(onRejectedBeforeSend).toHaveBeenCalledTimes(1);
    expect(sendMessageStreamMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.byId['existing-conv'].messages).toEqual([]);
  });

  it('严格知识库发送遵循服务端协商的知识库数量上限', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-old'],
      messages: [],
      createdAt: 100,
      updatedAt: 200,
    }));
    getChatCapabilitiesMock.mockResolvedValueOnce({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 1,
    });
    const onRejectedBeforeSend = vi.fn();

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('超出协商上限', {
        conversationId: 'existing-conv',
        knowledgeBaseIds: ['kb-1', 'kb-2'],
        onRejectedBeforeSend,
      });
    });

    expect(onRejectedBeforeSend).toHaveBeenCalledTimes(1);
    expect(sendMessageStreamMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.byId['existing-conv'].knowledge_base_ids).toEqual(['kb-old']);
    expect(store.getState().conversation.globalError).toBe('最多只能选择 1 个知识库');
  });

  it('服务端拒绝知识库选择变更时回滚到发送前会话快照', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-old'],
      messages: [],
      createdAt: 100,
      updatedAt: 200,
    }));
    sendMessageStreamMock.mockRejectedValueOnce(Object.assign(
      new Error('知识库已不可用'),
      { status: 409 },
    ));

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('只按新手册回答', {
        conversationId: 'existing-conv',
        knowledgeBaseIds: ['kb-new'],
      });
    });

    const conversation = store.getState().conversation.byId['existing-conv'];
    expect(conversation.knowledge_base_ids).toEqual(['kb-old']);
    expect(conversation.updatedAt).toBe(200);
  });

  it('未显式改选但会话已有知识库时仍强制标准模式并保持服务端选择', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      knowledge_base_ids: ['kb-existing'],
      messages: [],
      createdAt: 100,
      updatedAt: 200,
    }));
    store.dispatch(setComposerAgentMode('deep_research'));
    sendMessageStreamMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('继续按手册回答', {
        conversationId: 'existing-conv',
      });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        knowledge_base_ids: undefined,
        options: expect.objectContaining({ task_mode: 'standard' }),
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
    expect(store.getState().conversation.byId['existing-conv'].knowledge_base_ids).toEqual([
      'kb-existing',
    ]);
  });

  it('materializes a draft conversation and migrates the active stream', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();
    sessionStorage.setItem(
      CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['temp-conv']),
    );
    sessionStorage.setItem(
      CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['temp-conv']),
    );
    sessionStorage.setItem(
      CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['temp-conv']),
    );

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
      expect(state.conversation.conversationListDirtyIds).toEqual(['server-conv']);
      expect(state.stream.isStreaming).toBe(false);
    });
    expect(sessionStorage.getItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY)).toBe(
      JSON.stringify(['server-conv']),
    );
    expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBe(
      JSON.stringify(['server-conv']),
    );
    expect(sessionStorage.getItem(CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY)).toBe(
      JSON.stringify(['server-conv']),
    );
  });

  it('pending 事件用服务端 message_id 精确 patch 当前本地 placeholder', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    let releaseStream: (() => void) | undefined;

    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({
        messageId: 'server-assistant',
        conversationId: 'existing-conv',
      });
      callbacks.onSuggestedQuestionsPending?.({
        type: 'suggested_questions_pending',
        run_id: 'run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 2,
        trace_id: 'run-1',
        ts: Date.now(),
        message_id: 'server-assistant',
        revision: 3,
        status: 'pending',
      });
      await new Promise<void>((resolve) => { releaseStream = resolve; });
      callbacks.onAnswering({ block_id: 'answer', delta: '回答' });
      callbacks.onDone({ messageId: 'server-assistant', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('问题', { conversationId: 'existing-conv' });
    });

    await waitFor(() => expect(
      store.getState().conversation.byId['existing-conv'].messages.at(-1),
    ).toMatchObject({
      id: 'user-1',
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 3,
    }));

    await act(async () => { releaseStream?.(); });
    await act(async () => { tickIntervals(2); });
  });

  it('本轮完成但未收到 pending 事件时登记服务端与本地消息 ID 进行权威观察', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'server-assistant', conversationId: 'existing-conv' });
      callbacks.onAnswering({ block_id: 'answer', delta: '回答' });
      callbacks.onDone({ messageId: 'server-assistant', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    await act(async () => {
      await result.current.sendMessage('问题', { conversationId: 'existing-conv' });
      tickIntervals(2);
    });

    await waitFor(() => expect(
      store.getState().conversation.suggestedQuestionsObservations['existing-conv'],
    ).toEqual({
      messageIds: ['user-1', 'server-assistant'],
    }));
  });

  it('把用户开启的计划模式作为受控请求选项发送给后端', async () => {
    const store = createStore();
    store.dispatch(setComposerAgentMode('plan'));
    sendMessageStreamMock.mockImplementation(
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'answer' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('规划一次复杂行程', { conversationId: null });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          use_reasoning: true,
          plan_mode: 'on',
          task_mode: 'standard',
        }),
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it('切换到不支持工具调用的模型后不会发送不可满足的强制计划模式', async () => {
    const store = createStore({ functionCalling: false });
    store.dispatch(setComposerAgentMode('plan'));
    sendMessageStreamMock.mockImplementation(
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'answer' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('直接回答', { conversationId: null });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          plan_mode: 'auto',
          task_mode: 'standard',
        }),
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it('深度研究发送强制计划并携带任务模式', async () => {
    const store = createStore();
    store.dispatch(setComposerAgentMode('deep_research'));
    sendMessageStreamMock.mockImplementation(
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'answer' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('深入调查这个问题', { conversationId: null });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          plan_mode: 'on',
          task_mode: 'deep_research',
        }),
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it('深度研究在模型缺少联网工具时发送前安全回退自动模式', async () => {
    const store = createStore({ searchCapable: false, agentTools: false });
    store.dispatch(setComposerAgentMode('deep_research'));
    sendMessageStreamMock.mockImplementation(
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'blk_c', delta: 'answer' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('深入调查这个问题', { conversationId: null });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          plan_mode: 'auto',
          task_mode: 'standard',
        }),
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it('发送开始会让发送前详情请求失效，并立即解除旧 loading 状态', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      })
    );
    store.dispatch(setHydrationStatus({ id: 'existing-conv', status: 'loading' }));

    let resolvePreSendDetail: ((value: unknown) => void) | undefined;
    getConversationMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolvePreSendDetail = resolve;
      }))
      .mockRejectedValueOnce(new Error('完成后权威水合失败'));
    const preSendRequest = loadConversationDetail('existing-conv');
    const preSendResult = preSendRequest.catch((error) => error);

    let releaseStream: (() => void) | undefined;
    let streamCallbacks: StreamCallbacks | undefined;
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        streamCallbacks = callbacks;
        await new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
    );
    uuidMock.mockReset().mockReturnValueOnce('local-user').mockReturnValueOnce('local-assistant');

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('新问题', { conversationId: 'existing-conv' });
    });
    await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(1));
    expect(store.getState().conversation.hydrationStatus['existing-conv']).toBe('done');

    await act(async () => {
      resolvePreSendDetail?.({
        id: 'existing-conv',
        title: '旧快照',
        model_id: 'model-1',
        messages: [],
      });
    });
    await expect(preSendResult).resolves.toMatchObject({
      name: 'StaleConversationDetailRequestError',
    });
    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message: Message) => message.id)
    ).toEqual(['local-user', 'local-assistant']);

    await act(async () => {
      streamCallbacks?.onDone({
        messageId: 'server-assistant',
        conversationId: 'existing-conv',
      });
      releaseStream?.();
      await sendPromise;
    });
  });

  it('新 UI 对接忽略客户端消息 ID 的旧 API 时，完成后权威快照替换乐观副本且顺序唯一', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [
          { id: 'history-user', role: 'user', content: [], sequence: 1, timestamp: 1 },
          { id: 'history-assistant', role: 'assistant', content: [], sequence: 2, timestamp: 2 },
        ],
        createdAt: 1,
        updatedAt: 2,
      })
    );
    uuidMock.mockReset().mockReturnValueOnce('local-user').mockReturnValueOnce('local-assistant');
    getConversationMock.mockResolvedValueOnce({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      created_at: 1,
      updated_at: 4,
      messages: [
        { id: 'history-user', role: 'user', content: [], sequence: 1, created_at: 1 },
        { id: 'history-assistant', role: 'assistant', content: [], sequence: 2, created_at: 2 },
        { id: 'server-user', role: 'user', content: [], sequence: 3, created_at: 3 },
        {
          id: 'server-assistant',
          role: 'assistant',
          content: [{ type: 'text', id: 'answer', text: '服务端答案' }],
          sequence: 4,
          created_at: 4,
          usage: { input_tokens: 11, output_tokens: 7 },
        },
      ],
    });
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({
          messageId: 'server-assistant',
          conversationId: 'existing-conv',
        });
        callbacks.onDone({
          messageId: 'server-assistant',
          conversationId: 'existing-conv',
        });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    await act(async () => {
      await result.current.sendMessage('新问题', { conversationId: 'existing-conv' });
    });

    await waitFor(() => {
      expect(
        store.getState().conversation.byId['existing-conv'].messages.map((message: Message) => message.id)
      ).toEqual([
        'history-user',
        'history-assistant',
        'server-user',
        'server-assistant',
      ]);
    });
    const messages = store.getState().conversation.byId['existing-conv'].messages as Message[];
    expect(messages.map((message) => message.sequence)).toEqual([1, 2, 3, 4]);
    expect(messages.some((message) => message.id === 'local-user')).toBe(false);
    expect(messages.some((message) => message.id === 'local-assistant')).toBe(false);
    expect(sendMessageStreamMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        user_message_id: 'local-user',
        assistant_message_id: 'local-assistant',
      })
    );
  });

  it('安全重试复用原 user 和 assistant，乐观状态不追加重复问题', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [
          {
            id: 'retry-user',
            role: 'user',
            content: [{ type: 'text', id: 'user-text', text: '原始问题' }],
            sequence: 11,
            timestamp: 1,
          },
          {
            id: 'retry-assistant',
            role: 'assistant',
            content: [{ type: 'text', id: 'old-answer', text: '旧回答' }],
            sequence: 12,
            timestamp: 2,
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      })
    );
    sendMessageStreamMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    await act(async () => {
      await result.current.sendMessage('原始问题', {
        conversationId: 'existing-conv',
        retryUserMessageId: 'retry-user',
        retryAssistantMessageId: 'retry-assistant',
      });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_message_id: 'retry-user',
        assistant_message_id: 'retry-assistant',
        retry_user_message_id: 'retry-user',
        retry_assistant_message_id: 'retry-assistant',
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
    const messages = store.getState().conversation.byId['existing-conv'].messages as Message[];
    expect(messages.map((message) => message.id)).toEqual(['retry-user', 'retry-assistant']);
    expect(messages[0]).toEqual(expect.objectContaining({ status: 'pending' }));
    expect(messages[1]).toEqual(expect.objectContaining({ content: [] }));
  });

  it('Agent run retry 把 previousRunId 映射为后端 previous_run_id', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [
          {
            id: 'retry-user',
            role: 'user',
            content: [{ type: 'text', id: 'user-text', text: '原始问题' }],
          },
          {
            id: 'retry-assistant',
            role: 'assistant',
            content: [{ type: 'text', id: 'old-answer', text: '旧回答' }],
          },
        ],
        createdAt: 1,
        updatedAt: 2,
      }),
    );
    sendMessageStreamMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    await act(async () => {
      await result.current.sendMessage('原始问题', {
        conversationId: 'existing-conv',
        retryUserMessageId: 'retry-user',
        retryAssistantMessageId: 'retry-assistant',
        previousRunId: 'run-selected',
      });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        retry_user_message_id: 'retry-user',
        retry_assistant_message_id: 'retry-assistant',
        previous_run_id: 'run-selected',
      }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it('安全重试在服务端接管前失败时恢复原问题和原回答', async () => {
    const store = createStore();
    const originalUser: Message = {
      id: 'retry-user',
      role: 'user',
      content: [{ type: 'text', id: 'user-text', text: '原始问题' }],
      sequence: 11,
      status: null,
      timestamp: 1,
    };
    const originalAssistant: Message = {
      id: 'retry-assistant',
      role: 'assistant',
      content: [{ type: 'text', id: 'old-answer', text: '原始回答' }],
      sequence: 12,
      usage: { input_tokens: 8, output_tokens: 5 },
      timestamp: 2,
    };
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [originalUser, originalAssistant],
      createdAt: 1,
      updatedAt: 2,
    }));
    sendMessageStreamMock.mockRejectedValueOnce(new Error('重试目标已失效'));

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    await act(async () => {
      await result.current.sendMessage('原始问题', {
        conversationId: 'existing-conv',
        retryUserMessageId: 'retry-user',
        retryAssistantMessageId: 'retry-assistant',
      });
    });

    expect(store.getState().conversation.byId['existing-conv'].messages).toEqual([
      expect.objectContaining(originalUser),
      expect.objectContaining(originalAssistant),
    ]);
  });

  it('完成后权威水合保留请求发出后新增的本地消息', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
      })
    );
    uuidMock.mockReset().mockReturnValueOnce('local-user').mockReturnValueOnce('local-assistant');
    let resolveAuthoritativeDetail: ((value: unknown) => void) | undefined;
    getConversationMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveAuthoritativeDetail = resolve;
    }));
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({
          messageId: 'local-assistant',
          conversationId: 'existing-conv',
        });
        callbacks.onDone({
          messageId: 'local-assistant',
          conversationId: 'existing-conv',
        });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    await act(async () => {
      await result.current.sendMessage('第一轮', { conversationId: 'existing-conv' });
    });
    await waitFor(() => expect(getConversationMock).toHaveBeenCalledTimes(1));

    act(() => {
      store.dispatch(appendMessage({
        conversationId: 'existing-conv',
        message: {
          id: 'later-user',
          role: 'user',
          content: [{ type: 'text', id: 'later-text', text: '第二轮本地消息' }],
          status: 'pending',
          timestamp: 10,
        },
      }));
    });
    await act(async () => {
      resolveAuthoritativeDetail?.({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        created_at: 1,
        updated_at: 2,
        messages: [
          { id: 'local-user', role: 'user', content: [], sequence: 1, created_at: 1 },
          {
            id: 'local-assistant',
            role: 'assistant',
            content: [{ type: 'text', id: 'answer', text: '权威答案' }],
            sequence: 2,
            created_at: 2,
            usage: { input_tokens: 3, output_tokens: 5 },
          },
        ],
      });
    });

    await waitFor(() => {
      expect(
        store.getState().conversation.byId['existing-conv'].messages.map((message: Message) => message.id)
      ).toEqual(['local-user', 'local-assistant', 'later-user']);
    });
    expect(store.getState().conversation.byId['existing-conv'].messages[1]).toEqual(
      expect.objectContaining({
        sequence: 2,
        usage: { input_tokens: 3, output_tokens: 5 },
      })
    );
  });

  it.each(['logout', 'switch-account', 'reset'] as const)(
    'draft pending send 在 %s 后忽略迟到 onReady/onDone',
    async (boundary) => {
      const store = createStore();
      const onMaterialized = vi.fn();
      const onStreamEnd = vi.fn();
      let callbacks: StreamCallbacks | undefined;
      let signal: AbortSignal | undefined;
      let releaseStream: (() => void) | undefined;
      sendMessageStreamMock.mockImplementationOnce(
        async (_payload: unknown, nextCallbacks: StreamCallbacks, nextSignal: AbortSignal) => {
          callbacks = nextCallbacks;
          signal = nextSignal;
          await new Promise<void>((resolve) => {
            releaseStream = resolve;
          });
        }
      );
      const { result } = renderHook(() => useSendMessage(), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        void result.current.sendMessage('旧会话请求', {
          conversationId: null,
          onMaterialized,
          onStreamEnd,
        });
      });
      await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(1));

      act(() => {
        if (boundary === 'logout') {
          store.dispatch(logout());
        } else if (boundary === 'switch-account') {
          store.dispatch({
            type: 'auth/fetchUserProfile/fulfilled',
            payload: createUser('user-b'),
          });
        } else {
          store.dispatch(resetConversationState());
        }
      });
      expect(signal?.aborted).toBe(true);

      await act(async () => {
        callbacks?.onReady({ messageId: 'server-assistant', conversationId: 'server-conv' });
        callbacks?.onAnswering({ block_id: 'answer', delta: '迟到正文' });
        callbacks?.onDone({ messageId: 'server-assistant', conversationId: 'server-conv' });
        tickIntervals(8);
        releaseStream?.();
      });

      expect(onMaterialized).not.toHaveBeenCalled();
      expect(onStreamEnd).not.toHaveBeenCalled();
      expect(store.getState().conversation.byId['server-conv']).toBeUndefined();
      expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
      expect(store.getState().stream.isStreaming).toBe(false);
    }
  );

  it('普通会话 pending send 在 logout 后忽略迟到 done/error 与 metadata refresh', async () => {
    const store = createStore();
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    }));
    const onStreamEnd = vi.fn();
    let callbacks: StreamCallbacks | undefined;
    let signal: AbortSignal | undefined;
    let rejectStream: ((error: Error) => void) | undefined;
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, nextCallbacks: StreamCallbacks, nextSignal: AbortSignal) => {
        callbacks = nextCallbacks;
        signal = nextSignal;
        await new Promise<void>((_resolve, reject) => {
          rejectStream = reject;
        });
      }
    );
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('旧账号普通会话', {
        conversationId: 'existing-conv',
        onStreamEnd,
      });
    });
    await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(1));
    act(() => {
      store.dispatch(logout());
    });
    expect(signal?.aborted).toBe(true);

    await act(async () => {
      callbacks?.onAnswering({ block_id: 'answer', delta: '迟到正文' });
      callbacks?.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks?.onError('迟到错误', { code: 'LATE' });
      rejectStream?.(new Error('迟到异常'));
      tickIntervals(8);
    });

    expect(onStreamEnd).not.toHaveBeenCalled();
    expect(store.getState().conversation.globalError).toBeNull();
    expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
    expect(store.getState().stream.lastError).toBeNull();
  });

  it('同 session 路由 handoff unmount 后继续消费 draft ready/done', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();
    const onStreamEnd = vi.fn();
    let callbacks: StreamCallbacks | undefined;
    let signal: AbortSignal | undefined;
    let releaseStream: (() => void) | undefined;
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, nextCallbacks: StreamCallbacks, nextSignal: AbortSignal) => {
        callbacks = nextCallbacks;
        signal = nextSignal;
        await new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
    );
    const { result, unmount } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    await act(async () => {
      void result.current.sendMessage('即将卸载', {
        conversationId: null,
        onMaterialized,
        onStreamEnd,
      });
    });
    await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(1));

    unmount();
    expect(signal?.aborted).toBe(false);
    await act(async () => {
      callbacks?.onReady({ messageId: 'server-assistant', conversationId: 'server-conv' });
      callbacks?.onAnswering({ block_id: 'answer', delta: '继续输出' });
      callbacks?.onDone({ messageId: 'server-assistant', conversationId: 'server-conv' });
      releaseStream?.();
      tickIntervals(4);
    });

    expect(onMaterialized).toHaveBeenCalledWith('server-conv');
    expect(onStreamEnd).toHaveBeenCalledWith('server-conv');
    expect(store.getState().conversation.byId['server-conv']).toBeDefined();
    expect(store.getState().stream.isStreaming).toBe(false);
  });

  it('auth reset 与 unmount 同批发生时中止旧 session 并拒绝迟到回调', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();
    let callbacks: StreamCallbacks | undefined;
    let signal: AbortSignal | undefined;
    let releaseStream: (() => void) | undefined;
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, nextCallbacks: StreamCallbacks, nextSignal: AbortSignal) => {
        callbacks = nextCallbacks;
        signal = nextSignal;
        await new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
      }
    );
    const { result, unmount } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });
    await act(async () => {
      void result.current.sendMessage('旧 session', {
        conversationId: null,
        onMaterialized,
      });
    });
    await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(1));

    act(() => {
      store.dispatch(resetConversationState());
      unmount();
    });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      callbacks?.onReady({ messageId: 'server-assistant', conversationId: 'server-conv' });
      callbacks?.onDone({ messageId: 'server-assistant', conversationId: 'server-conv' });
      releaseStream?.();
    });

    expect(onMaterialized).not.toHaveBeenCalled();
    expect(store.getState().conversation.byId['server-conv']).toBeUndefined();
  });

  it('postStreamActions 等待标题期间 reset，迟到标题不得写回或刷新 metadata', async () => {
    const store = createStore();
    let resolveTitle: ((title: string) => void) | undefined;
    generateChatTitleMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTitle = resolve;
    }));
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'answer', delta: '尚未排空的正文' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('生成标题', { conversationId: null });
    });
    await waitFor(() => expect(generateChatTitleMock).toHaveBeenCalledTimes(1));
    act(() => {
      store.dispatch(resetConversationState());
    });
    await act(async () => {
      resolveTitle?.('迟到标题');
      await Promise.resolve();
    });

    expect(store.getState().conversation.animatingTitleId).toBeNull();
    expect(store.getState().conversation.conversationListDirtyIds).toEqual([]);
    expect(store.getState().conversation.byId['server-conv']).toBeUndefined();
  });

  it('新会话网络完成后立即且只启动一次标题生成，不等待打字机排空', async () => {
    const store = createStore();
    let callbacks: StreamCallbacks | undefined;
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, nextCallbacks: StreamCallbacks) => {
        callbacks = nextCallbacks;
        nextCallbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        nextCallbacks.onAnswering({ block_id: 'answer', delta: '这是一段尚未播放完的长回答' });
        nextCallbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('立即生成标题', { conversationId: null });
    });

    expect(store.getState().stream.isStreaming).toBe(true);
    expect(generateChatTitleMock).toHaveBeenCalledTimes(1);
    expect(generateChatTitleMock).toHaveBeenCalledWith(
      'server-conv',
      undefined,
      { max_length: 20 }
    );

    act(() => {
      callbacks?.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      tickIntervals(20);
    });

    await waitFor(() => expect(store.getState().stream.isStreaming).toBe(false));
    expect(generateChatTitleMock).toHaveBeenCalledTimes(1);
  });

  it('严格知识库空命中的新会话跳过标题 LLM，但保留本地标题和列表刷新', async () => {
    const store = createStore();
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        emitRunStarted(callbacks);
        callbacks.onContentBlockUpserted?.({
          type: 'content_block_upserted',
          protocol_version: 2,
          run_id: 'run-knowledge',
          parent_run_id: null,
          step_id: 'step-knowledge',
          parent_step_id: null,
          tool_call_id: 'tool-knowledge',
          sequence: 1,
          trace_id: 'run-knowledge',
          ts: 0,
          content_block: knowledgeEvidenceBlock('empty'),
        });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      },
    );
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('只按知识库回答', {
        conversationId: null,
        knowledgeBaseIds: ['kb-1'],
      });
    });

    expect(generateChatTitleMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.byId['server-conv']?.title).toBe('只按知识库回答');
    expect(store.getState().conversation.conversationListDirtyIds).toContain('server-conv');
  });

  it('严格知识库成功命中的新会话仍正常生成标题', async () => {
    const store = createStore();
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        emitRunStarted(callbacks);
        callbacks.onContentBlockUpserted?.({
          type: 'content_block_upserted',
          protocol_version: 2,
          run_id: 'run-knowledge',
          parent_run_id: null,
          step_id: 'step-knowledge',
          parent_step_id: null,
          tool_call_id: 'tool-knowledge',
          sequence: 1,
          trace_id: 'run-knowledge',
          ts: 0,
          content_block: knowledgeEvidenceBlock('success'),
        });
        callbacks.onAnswering({ block_id: 'answer', delta: '退款期限为七天[1]。' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      },
    );
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('只按知识库回答', {
        conversationId: null,
        knowledgeBaseIds: ['kb-1'],
      });
    });

    expect(generateChatTitleMock).toHaveBeenCalledTimes(1);
    expect(generateChatTitleMock).toHaveBeenCalledWith(
      'server-conv',
      undefined,
      { max_length: 20 },
    );
  });

  it('标题生成已启动后，同 session 路由 handoff 不取消标题写回', async () => {
    const store = createStore();
    let resolveTitle: ((title: string) => void) | undefined;
    generateChatTitleMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTitle = resolve;
    }));
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'answer', delta: '尚未排空' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );
    const { result, unmount } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('路由切换标题', { conversationId: null });
    });
    await waitFor(() => expect(generateChatTitleMock).toHaveBeenCalledTimes(1));
    unmount();

    await act(async () => {
      resolveTitle?.('切换后标题');
      await Promise.resolve();
    });

    expect(store.getState().conversation.byId['server-conv']?.title).toBe('切换后标题');
    expect(store.getState().conversation.conversationListDirtyIds).toEqual(['server-conv']);
  });

  it('标题生成已启动后，同 session 后续发送不取消标题写回', async () => {
    const store = createStore();
    let resolveTitle: ((title: string) => void) | undefined;
    generateChatTitleMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTitle = resolve;
    }));
    sendMessageStreamMock
      .mockImplementationOnce(async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'answer', delta: '第一轮尚未排空' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      })
      .mockImplementationOnce(async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-2', conversationId: 'server-conv' });
        callbacks.onDone({ messageId: 'assistant-2', conversationId: 'server-conv' });
      });
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('第一轮', { conversationId: null });
    });
    await waitFor(() => expect(generateChatTitleMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.sendMessage('第二轮', { conversationId: 'server-conv' });
    });
    await act(async () => {
      resolveTitle?.('首轮生成标题');
      await Promise.resolve();
    });

    expect(generateChatTitleMock).toHaveBeenCalledTimes(1);
    expect(store.getState().conversation.byId['server-conv']?.title).toBe('首轮生成标题');
  });

  it('标题生成失败会记录告警并继续定向刷新会话 metadata', async () => {
    const store = createStore();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    generateChatTitleMock.mockRejectedValueOnce(new Error('title service unavailable'));
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
      }
    );
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('标题失败', { conversationId: null });
    });

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        '自动生成会话标题失败',
        expect.any(Error)
      );
      expect(store.getState().conversation.conversationListDirtyIds).toEqual(['server-conv']);
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
    expect(state.conversation.byId['temp-conv']?.messages[0]).toEqual(
      expect.objectContaining({ role: 'user', status: 'pending' })
    );
    expect(state.conversation.byId['temp-conv']?.messages[1]).toEqual(
      expect.objectContaining({ role: 'assistant', content: [] })
    );
    expect(state.stream.conversationId).toBe('temp-conv');
    expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);

    releaseStream?.();
  });

  it('服务端接管前失败时移除本地草稿并回到新建页状态', async () => {
    const store = createStore();

    sendMessageStreamMock.mockRejectedValueOnce(new Error('发送失败'));

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', {
        conversationId: null,
      } as any);
    });

    expect(store.getState().conversation.byId['temp-conv']).toBeUndefined();
    expect(store.getState().conversation.pendingConversationId).toBeNull();
  });

  it('带附件草稿始终复用上传阶段的 pending conversation ID', async () => {
    const store = createStore();
    const onDraftCreated = vi.fn();
    let releaseStream: (() => void) | undefined;

    sendMessageStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage(
        '看图',
        {
          conversationId: 'pending-upload-conv',
          isDraft: true,
          onDraftCreated,
        },
        [{ fileId: 'file-1', filename: 'image.png', mimeType: 'image/png' }]
      );
    });

    await waitFor(() => expect(onDraftCreated).toHaveBeenCalledWith('pending-upload-conv'));
    const [localUserMessage, localAssistantMessage] =
      store.getState().conversation.byId['pending-upload-conv'].messages;
    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'pending-upload-conv',
        user_message_id: localUserMessage.id,
        assistant_message_id: localAssistantMessage.id,
        file_ids: ['file-1'],
      }),
      expect.any(Object),
      expect.any(AbortSignal)
    );
    expect(store.getState().conversation.byId['pending-upload-conv']?.messages).toHaveLength(2);

    releaseStream?.();
  });

  it('首个 SSE 前停止生成会清理本地草稿并回到新建页状态', async () => {
    const store = createStore();
    let releaseStop: ((cancelled: boolean) => void) | undefined;
    stopStreamMock.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseStop = resolve;
      })
    );
    sendMessageStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>(() => {});
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', {
        conversationId: null,
      });
    });

    await waitFor(() => {
      expect(store.getState().conversation.pendingConversationId).toBe('temp-conv');
    });

    let stopPromise: Promise<void> | undefined;
    await act(async () => {
      stopPromise = result.current.stopStreaming();
      await Promise.resolve();
    });

    expect(store.getState().conversation.pendingConversationId).toBeNull();
    expect(store.getState().conversation.byId['temp-conv']).toBeUndefined();
    expect(store.getState().stream.isStreaming).toBe(false);

    await waitFor(() => {
      expect(stopStreamMock).toHaveBeenCalledWith(
        'temp-conv',
        undefined,
        expect.any(AbortSignal)
      );
    });
    releaseStop?.(true);
    await act(async () => {
      await stopPromise;
    });
    expect(stopStreamMock).toHaveBeenCalledWith(
      'temp-conv',
      undefined,
      expect.any(AbortSignal)
    );
  });

  it('首个 SSE 前取消早于 Redis 初始化时会有限重试', async () => {
    const store = createStore();
    stopStreamMock
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    sendMessageStreamMock.mockImplementationOnce(async () => {
      await new Promise<void>(() => {});
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', {
        conversationId: null,
      });
    });
    await waitFor(() => {
      expect(store.getState().conversation.pendingConversationId).toBe('temp-conv');
    });

    await act(async () => {
      await result.current.stopStreaming();
    });

    expect(stopStreamMock).toHaveBeenCalledTimes(2);
    expect(stopStreamMock.mock.calls).toEqual([
      ['temp-conv', undefined, expect.any(AbortSignal)],
      ['temp-conv', undefined, expect.any(AbortSignal)],
    ]);
  });

  it('停止重新生成后立即恢复原回答而不是保留半截新回答', async () => {
    const store = createStore();
    const originalUser: Message = {
      id: 'retry-user',
      role: 'user',
      content: [{ type: 'text', id: 'question-1', text: '原问题' }],
      timestamp: 1,
    };
    const originalAssistant: Message = {
      id: 'retry-assistant',
      role: 'assistant',
      content: [{ type: 'text', id: 'answer-old', text: '原完整回答' }],
      timestamp: 2,
    };
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [originalUser, originalAssistant],
      createdAt: 1,
      updatedAt: 2,
    }));
    stopStreamMock.mockResolvedValue(true);
    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({
        messageId: 'retry-assistant',
        conversationId: 'existing-conv',
        taskId: 'retry-task-1',
      });
      callbacks.onRunStarted?.({
        type: 'run_started',
        protocol_version: 2,
        run_id: 'retry-run-1',
        parent_run_id: null,
        step_id: null,
        parent_step_id: null,
        tool_call_id: null,
        sequence: 0,
        trace_id: 'retry-run-1',
        ts: 0,
        conversation_id: 'existing-conv',
        message_id: 'retry-assistant',
        task_id: 'retry-task-1',
        model: 'model-1',
        tools: ['web_search'],
        config: {
          max_steps: 8,
          max_tool_calls: 20,
          timeout_s: 300,
          plan_mode: 'auto',
          task_mode: 'standard',
        },
      });
      callbacks.onAnswering({ block_id: 'answer-new', delta: '半截新回答' });
      await new Promise<void>(() => {});
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('原问题', {
        conversationId: 'existing-conv',
        retryUserMessageId: 'retry-user',
        retryAssistantMessageId: 'retry-assistant',
      });
    });
    await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.stopStreaming();
    });

    const messages = store.getState().conversation.byId['existing-conv']?.messages ?? [];
    expect(messages.find((message: Message) => message.id === 'retry-user')).toEqual(originalUser);
    expect(messages.find((message: Message) => message.id === 'retry-assistant')).toEqual(originalAssistant);
    expect(stopStreamMock).toHaveBeenCalledWith(
      'existing-conv',
      'retry-assistant',
      expect.any(AbortSignal),
      undefined,
      'retry-task-1',
    );
    expect(store.getState().stream.currentRun).toBeNull();
  });

  it('重新生成在自动续传耗尽且权威水合失败时仍恢复原完整回答', async () => {
    const store = createStore();
    const originalUser: Message = {
      id: 'retry-user',
      role: 'user',
      content: [{ type: 'text', id: 'question-1', text: '原问题' }],
      timestamp: 1,
    };
    const originalAssistant: Message = {
      id: 'retry-assistant',
      role: 'assistant',
      content: [{ type: 'text', id: 'answer-old', text: '原完整回答' }],
      timestamp: 2,
    };
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [originalUser, originalAssistant],
      createdAt: 1,
      updatedAt: 2,
    }));
    sendMessageStreamMock.mockImplementationOnce(async (_payload: unknown, callbacks: StreamCallbacks) => {
      callbacks.onReady({
        messageId: 'retry-assistant',
        conversationId: 'existing-conv',
        taskId: 'retry-task-1',
      });
      callbacks.onAnswering({ block_id: 'answer-new', delta: '半截新回答' });
      throw streamError('网络连接中断', true);
    });
    reconnectStreamMock.mockRejectedValue(streamError('仍未恢复', true));
    getConversationMock.mockRejectedValue(new Error('详情接口仍不可用'));

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('原问题', {
        conversationId: 'existing-conv',
        retryUserMessageId: 'retry-user',
        retryAssistantMessageId: 'retry-assistant',
      });
    });

    expect(reconnectStreamMock).toHaveBeenCalledTimes(3);
    const messages = store.getState().conversation.byId['existing-conv']?.messages ?? [];
    expect(messages.find((message: Message) => message.id === 'retry-user')).toEqual({
      ...originalUser,
      status: null,
    });
    expect(messages.find((message: Message) => message.id === 'retry-assistant')).toEqual(originalAssistant);
  });

  it('停止重新生成与后台完成竞态时以服务端新回答为准', async () => {
    const store = createStore();
    const originalUser: Message = {
      id: 'retry-user',
      role: 'user',
      content: [{ type: 'text', id: 'question-1', text: '原问题' }],
      timestamp: 1,
    };
    const originalAssistant: Message = {
      id: 'retry-assistant',
      role: 'assistant',
      content: [{ type: 'text', id: 'answer-old', text: '原完整回答' }],
      timestamp: 2,
    };
    const completedAssistant: Message = {
      ...originalAssistant,
      content: [{ type: 'text', id: 'answer-new', text: '后台已完成的新回答' }],
      timestamp: 3,
    };
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [originalUser, originalAssistant],
      createdAt: 1,
      updatedAt: 2,
    }));
    stopStreamMock.mockResolvedValue(false);
    getConversationMock.mockResolvedValue({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [originalUser, completedAssistant],
      createdAt: 1,
      updatedAt: 3,
    });
    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'retry-assistant', conversationId: 'existing-conv' });
      callbacks.onAnswering({ block_id: 'answer-new', delta: '半截新回答' });
      await new Promise<void>(() => {});
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('原问题', {
        conversationId: 'existing-conv',
        retryUserMessageId: 'retry-user',
        retryAssistantMessageId: 'retry-assistant',
      });
    });
    await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.stopStreaming();
    });

    await waitFor(() => {
      const messages = store.getState().conversation.byId['existing-conv']?.messages ?? [];
      expect(messages.find((message: Message) => message.id === 'retry-assistant')).toEqual(
        expect.objectContaining({
          id: 'retry-assistant',
          content: completedAssistant.content,
        }),
      );
    });
    expect(getConversationMock).toHaveBeenCalledWith('existing-conv');
  });

  it('停止未回答消息的重新发送后不保留无法刷新的半截回答', async () => {
    const store = createStore();
    const originalUser: Message = {
      id: 'retry-user',
      role: 'user',
      content: [{ type: 'text', id: 'question-1', text: '原问题' }],
      timestamp: 1,
    };
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [originalUser],
      createdAt: 1,
      updatedAt: 2,
    }));
    stopStreamMock.mockResolvedValue(true);
    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-new', conversationId: 'existing-conv' });
      callbacks.onAnswering({ block_id: 'answer-new', delta: '半截新回答' });
      await new Promise<void>(() => {});
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('原问题', {
        conversationId: 'existing-conv',
        retryUserMessageId: 'retry-user',
      });
    });
    await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.stopStreaming();
    });

    expect(store.getState().conversation.byId['existing-conv']?.messages).toEqual([originalUser]);
    expect(getConversationMock).toHaveBeenCalledWith('existing-conv');
  });

  it('外部停止尚未完成时新发送会等待取消屏障', async () => {
    const store = createStore();
    let releaseStop: ((cancelled: boolean) => void) | undefined;
    stopStreamMock.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => {
        releaseStop = resolve;
      })
    );
    sendMessageStreamMock
      .mockImplementationOnce(async () => {
        await new Promise<void>(() => {});
      })
      .mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-2', conversationId: 'server-conv-2' });
        callbacks.onAnswering({ block_id: 'blk_second', delta: 'second answer' });
        callbacks.onDone({ messageId: 'assistant-2', conversationId: 'server-conv-2' });
      });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('first', { conversationId: null });
    });
    await waitFor(() => {
      expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);
    });

    let stopPromise: Promise<void> | undefined;
    let secondSendPromise: Promise<void> | undefined;
    await act(async () => {
      stopPromise = result.current.stopStreaming();
      secondSendPromise = result.current.sendMessage('second', { conversationId: null });
      await Promise.resolve();
    });

    expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);
    releaseStop?.(true);
    await act(async () => {
      await stopPromise;
      await secondSendPromise;
    });

    expect(sendMessageStreamMock).toHaveBeenCalledTimes(2);
  });

  it('远端停止超时后会释放取消屏障并允许新发送', async () => {
    const store = createStore();
    stopStreamMock.mockImplementationOnce(
      (_conversationId: string, _messageId?: string, signal?: AbortSignal) =>
        new Promise<boolean>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        })
    );
    sendMessageStreamMock
      .mockImplementationOnce(async () => {
        await new Promise<void>(() => {});
      })
      .mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-2', conversationId: 'server-conv-2' });
        callbacks.onAnswering({ block_id: 'blk_second', delta: 'second answer' });
        callbacks.onDone({ messageId: 'assistant-2', conversationId: 'server-conv-2' });
      });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('first', { conversationId: null });
    });
    await waitFor(() => {
      expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);
    });

    let stopPromise: Promise<void> | undefined;
    let secondSendPromise: Promise<void> | undefined;
    await act(async () => {
      stopPromise = result.current.stopStreaming();
      secondSendPromise = result.current.sendMessage('second', { conversationId: null });
      await Promise.resolve();
    });

    expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      await stopPromise;
      await secondSendPromise;
    });

    expect(stopStreamMock.mock.calls[0]?.[2]).toEqual(expect.any(AbortSignal));
    expect((stopStreamMock.mock.calls[0]?.[2] as AbortSignal).aborted).toBe(true);
    expect(sendMessageStreamMock).toHaveBeenCalledTimes(2);
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
    sessionStorage.setItem(
      CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['existing-conv']),
    );
    sessionStorage.setItem(
      CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['existing-conv']),
    );
    sessionStorage.setItem(
      CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['existing-conv']),
    );
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
        expect.objectContaining({ role: 'user', status: null })
      );
      expect(state.conversation.byId['existing-conv'].messages[1]).toEqual(
        expect.objectContaining({ role: 'assistant' })
      );
      expect(sessionStorage.getItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(CONTEXT_STATUS_INTERACTED_FIRST_TURN_STORAGE_KEY)).toBeNull();
    });
  });

  it('已有对话始终使用会话模型，不沿用刚访问过的全局模型', async () => {
    const store = createStore();
    const baseModel = store.getState().models.models[0];
    store.dispatch(updateModels([
      baseModel,
      {
        ...baseModel,
        id: 'model-2',
        name: 'Model Two',
      },
    ]));
    store.dispatch(setSelectedModel('model-2'));
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onAnswering({ block_id: 'blk_c', delta: '使用会话模型回答' });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('继续当前对话', { conversationId: 'existing-conv' });
      tickIntervals(4);
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ model_id: 'model-1' }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it('已有对话尚未水合时禁止回退到全局模型发送', async () => {
    const store = createStore();
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('继续尚未加载的对话', {
        conversationId: 'not-hydrated-conv',
      });
    });

    expect(sendMessageStreamMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.globalError).toBe('对话尚未加载完成，请稍后重试');
    expect(store.getState().conversation.byId['not-hydrated-conv']).toBeUndefined();
  });

  it('已有对话模型健康状态异常时禁止发送', async () => {
    const store = createStore();
    const baseModel = store.getState().models.models[0];
    store.dispatch(updateModels([
      {
        ...baseModel,
        health: {
          status: 'unhealthy',
          error: '服务商认证失败',
        },
      },
    ]));
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('继续当前对话', {
        conversationId: 'existing-conv',
      });
    });

    expect(sendMessageStreamMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.globalError).toBe(
      '该对话使用的模型当前不可用，请新建对话并选择其他模型',
    );
  });

  it('首轮重试可使用删除消息前已验证的会话模型', async () => {
    const store = createStore();
    const baseModel = store.getState().models.models[0];
    store.dispatch(updateModels([{
      ...baseModel,
      selectable: false,
      routable: true,
    }]));
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'existing-conv' });
    });
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('重试原问题', {
        conversationId: 'existing-conv',
        resolvedModelId: 'model-1',
      });
      tickIntervals(4);
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ model_id: 'model-1' }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it('新对话不会使用健康状态异常的全局模型并回退到可用模型', async () => {
    const store = createStore();
    const baseModel = store.getState().models.models[0];
    store.dispatch(updateModels([
      {
        ...baseModel,
        health: {
          status: 'unhealthy',
          error: '服务商认证失败',
        },
      },
      {
        ...baseModel,
        id: 'healthy-model',
        name: 'Healthy Model',
        health: {
          status: 'healthy',
        },
      },
    ]));
    store.dispatch(setSelectedModel('model-1'));
    sendMessageStreamMock.mockImplementationOnce(async (_payload: any, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
      callbacks.onAnswering({ block_id: 'blk_c', delta: '使用健康模型回答' });
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
    });
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('创建新对话', {
        conversationId: null,
      });
      tickIntervals(4);
    });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ model_id: 'healthy-model' }),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it('把后端 stream_interrupted 终态视为用户停止并权威水合，不标记发送失败', async () => {
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
    const interruptedConversation = {
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [
        {
          id: 'server-user',
          role: 'user',
          content: [{ type: 'text', id: 'question', text: 'hello' }],
        },
        {
          id: 'server-assistant',
          role: 'assistant',
          content: [{ type: 'text', id: 'partial', text: '已停止前的部分结果' }],
          agent_run: { status: 'interrupted' },
        },
      ],
    };
    getConversationMock.mockResolvedValue(interruptedConversation);
    sessionStorage.setItem(
      CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['existing-conv']),
    );
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({
          messageId: 'assistant-1',
          conversationId: 'existing-conv',
        });
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
          tools: ['web_search', 'url_read'],
          config: {
            max_steps: 8,
            max_tool_calls: 20,
            timeout_s: 300,
            plan_mode: 'on',
            task_mode: 'deep_research',
          },
        });
        callbacks.onReasoning({
          block_id: 'thinking',
          delta: '正在研究',
        });
        callbacks.onError('用户中止', { code: 'stream_interrupted' });
        throw Object.assign(new Error('用户中止'), {
          recoverable: false,
          code: 'stream_interrupted',
        });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', {
        conversationId: 'existing-conv',
      });
    });

    await waitFor(() => {
      expect(getConversationMock).toHaveBeenCalledWith('existing-conv');
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 350);
      });
    });
    expect(getConversationMock).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      const state = store.getState();
      expect(state.stream.isStreaming).toBe(false);
      expect(state.stream.currentRun?.status).toBe('interrupted');
      expect(state.conversation.globalError).toBeNull();
      expect(
        state.conversation.byId['existing-conv'].messages.some(
          (message: Message) => message.status === 'failed'
        )
      ).toBe(false);
      expect(
        state.conversation.byId['existing-conv'].messages.map(
          (message: Message) => message.id
        )
      ).toEqual(['server-user', 'server-assistant']);
    });
    expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBeNull();
  });

  it('兼容旧停止协议的 stream_error + 用户中止，不闪现错误态', async () => {
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
    getConversationMock.mockResolvedValueOnce({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'model-1',
      messages: [
        {
          id: 'server-user',
          role: 'user',
          content: [{ type: 'text', id: 'question', text: 'hello' }],
        },
        {
          id: 'server-assistant',
          role: 'assistant',
          content: [],
          agent_run: { status: 'interrupted' },
        },
      ],
    });
    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({
          messageId: 'assistant-1',
          conversationId: 'existing-conv',
        });
        callbacks.onError('用户中止', {
          code: 'stream_error',
          message: '用户中止',
        });
        throw Object.assign(new Error('用户中止'), {
          recoverable: false,
          code: 'stream_error',
        });
      }
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', {
        conversationId: 'existing-conv',
      });
    });

    await waitFor(() => {
      expect(getConversationMock).toHaveBeenCalledWith('existing-conv');
    });
    expect(store.getState().conversation.globalError).toBeNull();
    expect(
      store.getState().conversation.byId['existing-conv'].messages.some(
        (message: Message) => message.status === 'failed'
      )
    ).toBe(false);
  });

  it('网络中断后从最后确认的 entry cursor 续传，复用同一占位消息且只生成一次标题', async () => {
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'server-assistant', conversationId: 'server-conv' });
        callbacks.onAnswering({ block_id: 'answer', delta: '前半段' });
        callbacks.onEntryId?.('100-1');
        throw streamError('网络连接中断', true);
      },
    );
    reconnectStreamMock.mockImplementationOnce(
      async (_conversationId: string, _lastEntryId: string, callbacks: StreamCallbacks) => {
        callbacks.onAnswering({ block_id: 'answer', delta: '后半段' });
        callbacks.onEntryId?.('100-2');
        callbacks.onDone({ messageId: 'server-assistant', conversationId: 'server-conv' });
        return { entryId: '100-2' };
      },
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: null });
      tickIntervals(8);
    });

    await waitFor(() => {
      const state = store.getState();
      const assistant = state.conversation.byId['server-conv'].messages.find(
        (message: { role: string }) => message.role === 'assistant',
      );
      expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);
      expect(reconnectStreamMock).toHaveBeenCalledWith(
        'server-conv',
        '100-1',
        expect.any(Object),
        expect.any(AbortSignal),
      );
      expect(assistant?.id).toBe('assistant-1');
      expect(assistant?.content).toEqual([
        expect.objectContaining({ type: 'text', text: '前半段后半段' }),
      ]);
      expect(generateChatTitleMock).toHaveBeenCalledTimes(1);
      expect(state.stream.isStreaming).toBe(false);
      expect(
        dispatchSpy.mock.calls
          .map(([action]) => action)
          .filter((action) => action.type === 'stream/setLastEntryId'),
      ).toEqual([]);
      expect(
        dispatchSpy.mock.calls
          .map(([action]) => action)
          .filter((action) => action.type === 'stream/setStreamStatus'),
      ).toEqual([
        expect.objectContaining({ payload: 'reconnecting' }),
        expect.objectContaining({ payload: 'streaming' }),
      ]);
    });
  });

  it('redis_read_failed 自动续传期间不闪全局错误并保留 partial placeholder', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    let globalErrorDuringReconnect: string | null = null;
    let assistantCountDuringReconnect = 0;

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'server-assistant', conversationId: 'existing-conv' });
        callbacks.onAnswering({ block_id: 'answer', delta: '已有内容' });
        callbacks.onEntryId?.('410-1');
        throw Object.assign(new Error('Redis 暂时不可访问'), {
          code: 'redis_read_failed',
          recoverable: true,
        });
      },
    );
    reconnectStreamMock.mockImplementationOnce(
      async (_conversationId: string, lastEntryId: string, callbacks: StreamCallbacks) => {
        expect(lastEntryId).toBe('410-1');
        const state = store.getState();
        globalErrorDuringReconnect = state.conversation.globalError;
        assistantCountDuringReconnect = state.conversation.byId['existing-conv'].messages.filter(
          (message: { role: string }) => message.role === 'assistant',
        ).length;
        callbacks.onAnswering({ block_id: 'answer', delta: '恢复内容' });
        callbacks.onDone({ messageId: 'server-assistant', conversationId: 'existing-conv' });
        return { entryId: '410-2' };
      },
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
      tickIntervals(8);
    });

    expect(globalErrorDuringReconnect).toBeNull();
    expect(assistantCountDuringReconnect).toBe(1);
    expect(reconnectStreamMock).toHaveBeenCalledTimes(1);
    const assistant = store.getState().conversation.byId['existing-conv'].messages.find(
      (message: { role: string }) => message.role === 'assistant',
    );
    expect(assistant?.content).toEqual([
      expect.objectContaining({ type: 'text', text: '已有内容恢复内容' }),
    ]);
  });

  it('结构化终态错误和用户取消都不会触发自动重连', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onError('额度不足', { code: 'quota_exceeded' });
        throw streamError('额度不足', false);
      },
    );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });
    expect(reconnectStreamMock).not.toHaveBeenCalled();

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, _callbacks: StreamCallbacks, signal: AbortSignal) => {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        });
      },
    );

    await act(async () => {
      void result.current.sendMessage('second', { conversationId: 'existing-conv' });
    });
    await waitFor(() => expect(sendMessageStreamMock).toHaveBeenCalledTimes(2));
    sessionStorage.setItem(
      CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['existing-conv']),
    );
    sessionStorage.setItem(
      CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY,
      JSON.stringify(['existing-conv']),
    );
    await act(async () => {
      await result.current.stopStreaming();
    });

    expect(reconnectStreamMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CONTEXT_STATUS_PENDING_FIRST_TURN_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(CONTEXT_STATUS_SUPPRESSED_FIRST_TURN_STORAGE_KEY)).toBeNull();
  });

  it('发送端返回 STREAM_UNAVAILABLE 时不发起 GET 重连并保留服务端提示', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    sendMessageStreamMock.mockRejectedValueOnce(Object.assign(
      new Error('生成服务暂时不可用，请稍后重试'),
      {
        recoverable: false,
        statusCode: 503,
        code: 'STREAM_UNAVAILABLE',
      },
    ));

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    expect(reconnectStreamMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.globalError).toBe('生成服务暂时不可用，请稍后重试');
  });

  it('自动续传达到有限重试上限后保留已显示的 assistant 内容', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'server-assistant', conversationId: 'existing-conv' });
        callbacks.onAnswering({ block_id: 'answer', delta: '已显示内容' });
        callbacks.onEntryId?.('200-1');
        tickIntervals(8);
        throw streamError('网络连接中断', true);
      },
    );
    reconnectStreamMock.mockRejectedValue(streamError('仍未恢复', true));

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    const state = store.getState();
    const [userMessage, assistantMessage] = state.conversation.byId['existing-conv'].messages;
    expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);
    expect(reconnectStreamMock).toHaveBeenCalledTimes(3);
    expect(reconnectStreamMock.mock.calls.every((call) => call[1] === '200-1')).toBe(true);
    expect(userMessage).toEqual(expect.objectContaining({ role: 'user', status: null }));
    expect(assistantMessage).toEqual(expect.objectContaining({
      role: 'assistant',
      content: [expect.objectContaining({ type: 'text', text: '已显示内容' })],
    }));
    expect(state.stream.lastError?.message).toContain('仍未恢复');
  });

  it('续传再次中断时使用该次已确认的新 cursor 继续，而不是回退到旧位置', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'model-1',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: unknown, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'server-assistant', conversationId: 'existing-conv' });
        callbacks.onEntryId?.('300-1');
        throw streamError('首次断线', true);
      },
    );
    reconnectStreamMock
      .mockImplementationOnce(
        async (_conversationId: string, lastEntryId: string, callbacks: StreamCallbacks) => {
          expect(lastEntryId).toBe('300-1');
          callbacks.onEntryId?.('300-2');
          throw streamError('续传再次断线', true);
        },
      )
      .mockImplementationOnce(
        async (_conversationId: string, lastEntryId: string, callbacks: StreamCallbacks) => {
          expect(lastEntryId).toBe('300-2');
          callbacks.onDone({ messageId: 'server-assistant', conversationId: 'existing-conv' });
          return { entryId: '300-2' };
        },
      );

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    expect(sendMessageStreamMock).toHaveBeenCalledTimes(1);
    expect(reconnectStreamMock).toHaveBeenCalledTimes(2);
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
        expect.objectContaining({ role: 'user', status: null })
      );
      expect(state.conversation.byId['existing-conv'].messages[1]).toEqual(
        expect.objectContaining({ role: 'assistant' })
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
    expect(runSnapshot?.config).toEqual({
      maxSteps: 5,
      maxToolCalls: 10,
      timeoutS: 60,
      planMode: 'auto',
      taskMode: 'standard',
      networkProfile: 'standard',
      evidencePolicy: 'standard',
    });

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

  it('普通无工具问答：endStream 保留 currentRun，且只走统一权威详情刷新', async () => {
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

    // currentRun 仍保留；无论是否调用工具，完成后都只走同一条权威详情刷新。
    expect(store.getState().stream.currentRun).not.toBeNull();
    expect(store.getState().stream.currentRun?.totalToolCalls).toBe(0);
    expect(getConversationMock).toHaveBeenCalledTimes(1);
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
    expect(
      store.getState().conversation.suggestedQuestionsObservations['existing-conv'],
    ).toBeUndefined();
    expect(getConversationMock).toHaveBeenCalledTimes(1);
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

  it('agent run 含 tool_call：通过统一权威详情刷新补齐 DB 消息', async () => {
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
      title: 'Existing',
      model_id: 'model-1',
      messages: [
        {
          id: 'srv-asst-1',
          role: 'assistant',
          content: [{ type: 'text', id: 'answer', text: 'final from db' }],
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
          content: [{ type: 'text', id: 'answer', text: 'final from db' }],
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

  it('初次发送在轨迹 Tab 未挂载时仍归并到物化后的服务端会话', async () => {
    const store = createStore();
    sendMessageStreamMock.mockImplementationOnce(async (_payload: unknown, callbacks: StreamCallbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
      callbacks.onTrajectoryEvent?.(normalizedRunEvent('run_started', 0));
      callbacks.onTrajectoryEvent?.(normalizedRunEvent('run_completed', 1));
      callbacks.onDone({ messageId: 'assistant-1', conversationId: 'server-conv' });
    });
    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('记录实时轨迹', { conversationId: null });
    });

    const trajectory = store.getState().trajectory;
    expect(trajectory.byConversationId['temp-conv']).toBeUndefined();
    expect(
      trajectory.byConversationId['server-conv'].liveEventsByRunId['run-trajectory']
        .map((event: NormalizedTrajectoryEvent) => event.eventType),
    ).toEqual(['run_started', 'run_completed']);
    expect(
      trajectory.byConversationId['server-conv']
        .reconciliationByRunId['run-trajectory'].status,
    ).toBe('reconciling');
  });
});
