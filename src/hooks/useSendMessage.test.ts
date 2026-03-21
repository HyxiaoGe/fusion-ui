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
import {
  endStream,
  startStreamingReasoning,
  updateStreamContent,
} from '@/redux/slices/streamSlice';
import { useSendMessage } from './useSendMessage';

const {
  sendMessageStreamMock,
  generateChatTitleMock,
  uuidMock,
} = vi.hoisted(() => ({
  sendMessageStreamMock: vi.fn(),
  generateChatTitleMock: vi.fn(),
  uuidMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  sendMessageStream: sendMessageStreamMock,
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
  return ({ children }: { children: React.ReactNode }) => (
    React.createElement(Provider, { store, children })
  );
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
      async (_payload, callbacks: {
        onReady: (meta: { messageId: string; conversationId: string }) => void;
        onContent: (delta: string, meta: { messageId: string; conversationId: string }) => void;
        onReasoning: (delta: string, meta: { messageId: string; conversationId: string }) => void;
        onDone: (messageId: string, conversationId: string, content: string, reasoning: string) => void;
      }) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onReasoning('think', { messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onReasoning('ing', { messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onContent('ans', { messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onContent('wer', { messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onDone('assistant-1', 'server-conv', 'answer', 'thinking');
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
      expect(state.conversation.byId['server-conv'].messages[1]).toEqual(
        expect.objectContaining({ id: 'assistant-1', content: 'answer', reasoning: 'thinking' })
      );
      expect(state.stream.conversationId).toBeNull();
      expect(state.stream.isStreaming).toBe(false);
    });
  });

  it('stops the previous stream before sending a new message', async () => {
    const store = createStore();
    let firstSignal: AbortSignal | undefined;
    let releaseFirstStream: (() => void) | undefined;

    sendMessageStreamMock
      .mockImplementationOnce(
        async (_payload, _callbacks, signal?: AbortSignal) => {
          firstSignal = signal;
          await new Promise<void>((resolve) => {
            releaseFirstStream = resolve;
          });
        }
      )
      .mockImplementationOnce(async (_payload, callbacks) => {
        callbacks.onReady({ messageId: 'assistant-2', conversationId: 'server-conv-2' });
        callbacks.onContent('second ', { messageId: 'assistant-2', conversationId: 'server-conv-2' });
        callbacks.onContent('answer', { messageId: 'assistant-2', conversationId: 'server-conv-2' });
        callbacks.onDone('assistant-2', 'server-conv-2', 'second answer', '');
      });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('first', { conversationId: null });
    });

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(true);
      expect(store.getState().conversation.byId['temp-conv']).toBeDefined();
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
      expect(state.conversation.byId['temp-conv'].messages).toEqual([
        expect.objectContaining({ id: 'user-1', status: null }),
      ]);
      expect(state.conversation.byId['server-conv-2']).toBeDefined();
      expect(state.conversation.byId['server-conv-2'].messages[1]).toEqual(
        expect.objectContaining({ id: 'assistant-2', content: 'second answer' })
      );
    });
  });

  it('keeps accumulated content visible while catch handles stream errors', async () => {
    const store = createStore();
    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model: 'model-1',
        provider: 'openai',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload, callbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onReasoning('thinking', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent('hello ', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent('world!', { messageId: 'assistant-1', conversationId: 'existing-conv' });
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
      expect(state.stream.content).toBe('');
      expect(state.stream.reasoning).toBe('');
      expect(state.conversation.globalError).toBe('模型调用超时');
      expect(state.conversation.byId['existing-conv'].messages[0]).toEqual(
        expect.objectContaining({ role: 'user', status: 'failed', content: 'hello' })
      );
      expect(state.conversation.byId['existing-conv'].messages).not.toContainEqual(
        expect.objectContaining({ role: 'assistant' })
      );
    });
  });

  it('uses the local assistant placeholder id when the server returns a different message id', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload, callbacks: {
        onReady: (meta: { messageId: string; conversationId: string }) => void;
        onContent: (delta: string, meta: { messageId: string; conversationId: string }) => void;
        onDone: (messageId: string, conversationId: string, content: string, reasoning: string) => void;
      }) => {
        callbacks.onReady({
          messageId: 'server-assistant-id',
          conversationId: 'server-conv',
        });
        callbacks.onContent('answer', {
          messageId: 'server-assistant-id',
          conversationId: 'server-conv',
        });
        callbacks.onDone('server-assistant-id', 'server-conv', 'answer', 'thinking');
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
      expect(state.conversation.byId['server-conv'].messages[1]).toEqual(
        expect.objectContaining({
          id: 'assistant-1',
          content: 'answer',
          reasoning: 'thinking',
        })
      );
    });
  });

  it('materializes the draft conversation on the first streamed chunk before completion', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();
    let releaseStream: (() => void) | undefined;

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload, callbacks: {
        onReady: (meta: { messageId: string; conversationId: string }) => void;
        onContent: (delta: string, meta: { messageId: string; conversationId: string }) => void;
        onDone: (messageId: string, conversationId: string, content: string, reasoning: string) => void;
      }) => {
        callbacks.onReady({
          messageId: 'server-assistant-id',
          conversationId: 'server-conv',
        });
        callbacks.onContent('part', {
          messageId: 'server-assistant-id',
          conversationId: 'server-conv',
        });
        await new Promise<void>((resolve) => {
          releaseStream = resolve;
        });
        callbacks.onDone('server-assistant-id', 'server-conv', 'partial answer', '');
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
      expect(state.conversation.pendingConversationId).toBeNull();
      expect(state.stream.conversationId).toBe('server-conv');
    });

    await act(async () => {
      releaseStream?.();
    });

    await act(async () => {
      tickIntervals(4);
    });

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(false);
    });
  });

  it('consumes burst content at a fixed typewriter pace', async () => {
    const store = createStore();

    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model: 'model-1',
        provider: 'openai',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload, callbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent('abcdefghijklmnopqrst', {
        messageId: 'assistant-1',
        conversationId: 'existing-conv',
      });
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await act(async () => {
      tickIntervals(1);
    });

    expect(store.getState().stream.content).toBe('abcd');

    await act(async () => {
      tickIntervals(1);
    });

    expect(store.getState().stream.content).toBe('abcdefgh');

    await act(async () => {
      tickIntervals(3);
    });

    expect(store.getState().stream.content).toBe('abcdefghijklmnopqrst');
  });

  it('dispatches startStreamingReasoning only once for multiple reasoning deltas', async () => {
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    let releaseStream: (() => void) | undefined;

    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model: 'model-1',
        provider: 'openai',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload, callbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onReasoning('thi', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onReasoning('nki', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onReasoning('ng', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      await new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      callbacks.onDone('assistant-1', 'existing-conv', '', 'thinking');
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    const reasoningStartActions = dispatchSpy.mock.calls.filter(
      ([action]) => action.type === startStreamingReasoning.type
    );

    expect(reasoningStartActions).toHaveLength(1);
    expect(store.getState().stream.reasoning).toBe('thinking');

    await act(async () => {
      releaseStream?.();
    });

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(false);
    });
  });

  it('delays completion until buffered content is fully rendered', async () => {
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model: 'model-1',
        provider: 'openai',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload, callbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent('hello', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent(' world', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onDone('assistant-1', 'existing-conv', 'hello world', '');
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    expect(dispatchSpy.mock.calls.some(([action]) => action.type === endStream.type)).toBe(false);

    await act(async () => {
      tickIntervals(2);
    });

    expect(dispatchSpy.mock.calls.some(([action]) => action.type === endStream.type)).toBe(false);

    await act(async () => {
      tickIntervals(1);
    });

    const actionTypes = dispatchSpy.mock.calls.map(([action]) => action.type);
    const flushedContentIndex = dispatchSpy.mock.calls.findIndex(
      ([action]) =>
        action.type === updateStreamContent.type && action.payload === 'hello world'
    );
    const endStreamIndex = dispatchSpy.mock.calls.findIndex(
      ([action]) => action.type === endStream.type
    );

    expect(actionTypes).toContain(updateStreamContent.type);
    expect(flushedContentIndex).toBeGreaterThan(-1);
    expect(endStreamIndex).toBeGreaterThan(-1);
    expect(flushedContentIndex).toBeLessThan(endStreamIndex);
    expect(
      store.getState().conversation.byId['existing-conv'].messages.find((message) => message.role === 'assistant')
    ).toEqual(
      expect.objectContaining({
        content: 'hello world',
      })
    );
  });

  it('completes immediately when onDone arrives without any content', async () => {
    const store = createStore();

    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model: 'model-1',
        provider: 'openai',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload, callbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onReasoning('thinking', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onDone('assistant-1', 'existing-conv', '', 'thinking');
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
      expect(
        state.conversation.byId['existing-conv'].messages.find((message) => message.role === 'assistant')
      ).toEqual(
        expect.objectContaining({
          content: '',
          reasoning: 'thinking',
        })
      );
    });
  });

  it('writes back already displayed content before error cleanup runs', async () => {
    const store = createStore();
    const dispatchSpy = vi.spyOn(store, 'dispatch');

    store.dispatch(
      upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model: 'model-1',
        provider: 'openai',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );

    sendMessageStreamMock.mockImplementationOnce(async (_payload, callbacks) => {
      callbacks.onReady({ messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent('abcdefghijkl', {
        messageId: 'assistant-1',
        conversationId: 'existing-conv',
      });
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

    const writeBackCall = dispatchSpy.mock.calls.find(
      ([action]) =>
        action.type === 'conversation/updateMessage' &&
        action.payload?.patch?.content === 'abcdefgh'
    );

    expect(writeBackCall).toBeDefined();
    expect(store.getState().stream.content).toBe('');
  });
});
