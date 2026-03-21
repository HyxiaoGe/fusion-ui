import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import authReducer from '@/redux/slices/authSlice';
import conversationReducer from '@/redux/slices/conversationSlice';
import modelsReducer from '@/redux/slices/modelsSlice';
import streamReducer from '@/redux/slices/streamSlice';
import { upsertConversation } from '@/redux/slices/conversationSlice';
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
    let nextRafId = 0;
    const rafCallbacks = new Map<number, FrameRequestCallback>();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextRafId;
        rafCallbacks.set(id, callback);
        queueMicrotask(() => {
          const pendingCallback = rafCallbacks.get(id);
          if (!pendingCallback) {
            return;
          }
          rafCallbacks.delete(id);
          pendingCallback(16);
        });
        return id;
      })
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        rafCallbacks.delete(id);
      })
    );
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
      callbacks.onReasoning('thin', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onReasoning('king', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent('par', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent('tial', { messageId: 'assistant-1', conversationId: 'existing-conv' });
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

    await waitFor(() => {
      expect(store.getState().stream.isStreaming).toBe(false);
    });
  });

  it('keeps assistant content in stream state during streaming and only commits it on done', async () => {
    const store = createStore();
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
      callbacks.onReasoning('think', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent('hello', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onContent(' world', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      await new Promise<void>((resolve) => {
        releaseStream = resolve;
      });
      callbacks.onDone('assistant-1', 'existing-conv', 'hello world', 'think');
    });

    const { result } = renderHook(() => useSendMessage(), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      void result.current.sendMessage('hello', { conversationId: 'existing-conv' });
    });

    await waitFor(() => {
      const state = store.getState();
      expect(state.stream.content).toBe('hello world');
      expect(state.stream.reasoning).toBe('think');
      expect(state.conversation.byId['existing-conv'].messages.find((message) => message.role === 'assistant')).toEqual(
        expect.objectContaining({
          content: '',
          reasoning: null,
        })
      );
    });

    await act(async () => {
      releaseStream?.();
    });

    await waitFor(() => {
      const state = store.getState();
      expect(state.stream.isStreaming).toBe(false);
      expect(state.conversation.byId['existing-conv'].messages.find((message) => message.role === 'assistant')).toEqual(
        expect.objectContaining({
          content: 'hello world',
          reasoning: 'think',
        })
      );
    });
  });
});
