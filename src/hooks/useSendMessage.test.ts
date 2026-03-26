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
import { endStream } from '@/redux/slices/streamSlice';
import { useSendMessage } from './useSendMessage';
import type { StreamCallbacks } from '@/lib/api/chat';
import type { Usage } from '@/types/conversation';

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
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onThinkingDelta('think', 'blk_t', { messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onThinkingDelta('ing', 'blk_t', { messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onTextDelta('ans', 'blk_c', { messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onTextDelta('wer', 'blk_c', { messageId: 'assistant-1', conversationId: 'server-conv' });
        callbacks.onDone('assistant-1', 'server-conv', null);
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
        callbacks.onTextDelta('second answer', 'blk_c', { messageId: 'assistant-2', conversationId: 'server-conv-2' });
        callbacks.onDone('assistant-2', 'server-conv-2', null);
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
      callbacks.onThinkingDelta('thinking', 'blk_t', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onTextDelta('hello world!', 'blk_c', { messageId: 'assistant-1', conversationId: 'existing-conv' });
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

  it('materializes draft on first streamed chunk before completion', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();
    let releaseStream: (() => void) | undefined;

    sendMessageStreamMock.mockImplementationOnce(
      async (_payload: any, callbacks: StreamCallbacks) => {
        callbacks.onReady({ messageId: 'server-assistant-id', conversationId: 'server-conv' });
        callbacks.onTextDelta('part', 'blk_c', { messageId: 'server-assistant-id', conversationId: 'server-conv' });
        await new Promise<void>((resolve) => { releaseStream = resolve; });
        callbacks.onDone('server-assistant-id', 'server-conv', null);
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
      callbacks.onThinkingDelta('thinking', 'blk_t', { messageId: 'assistant-1', conversationId: 'existing-conv' });
      callbacks.onDone('assistant-1', 'existing-conv', null);
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
