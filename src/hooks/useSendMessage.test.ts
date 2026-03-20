import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import authReducer from '@/redux/slices/authSlice';
import conversationReducer from '@/redux/slices/conversationSlice';
import modelsReducer from '@/redux/slices/modelsSlice';
import streamReducer from '@/redux/slices/streamSlice';
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
  });

  it('materializes a draft conversation and migrates the active stream', async () => {
    const store = createStore();
    const onMaterialized = vi.fn();

    sendMessageStreamMock.mockImplementation(
      async (_payload, onChunk: (chunk: string, done: boolean, incomingConvId?: string, reasoning?: string) => void) => {
        onChunk('answer', false, 'server-conv', 'thinking');
        onChunk('answer', true, 'server-conv', 'thinking');
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
        async (_payload, _onChunk, signal?: AbortSignal) => {
          firstSignal = signal;
          await new Promise<void>((resolve) => {
            releaseFirstStream = resolve;
          });
        }
      )
      .mockImplementationOnce(async (_payload, onChunk) => {
        onChunk('second answer', false, 'server-conv-2', '');
        onChunk('second answer', true, 'server-conv-2', '');
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
});
