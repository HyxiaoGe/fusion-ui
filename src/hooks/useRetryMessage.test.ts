import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import conversationReducer, {
  upsertConversation,
} from '@/redux/slices/conversationSlice';
import modelsReducer, { updateModels } from '@/redux/slices/modelsSlice';
import { useRetryMessage } from './useRetryMessage';

function createStore(modelState: 'disabled' | 'unhealthy' = 'disabled') {
  const store = configureStore({
    reducer: {
      conversation: conversationReducer,
      models: modelsReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
      }),
  });

  store.dispatch(updateModels([
    {
      id: 'disabled-model',
      name: 'Disabled Model',
      provider: 'test',
      enabled: modelState !== 'disabled',
      temperature: 0.7,
      capabilities: {},
      health: modelState === 'unhealthy'
        ? {
            status: 'unhealthy' as const,
            error: '服务商认证失败',
          }
        : undefined,
    },
  ]));
  store.dispatch(upsertConversation({
    id: 'existing-conv',
    title: 'Existing',
    model_id: 'disabled-model',
    messages: [
      {
        id: 'user-1',
        role: 'user',
        content: [{ type: 'text', id: 'text-user', text: '原始问题' }],
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: [{ type: 'text', id: 'text-assistant', text: '原始回答' }],
      },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  return store;
}

function createWrapper(store: ReturnType<typeof createStore>) {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store, children });
  };
}

describe('useRetryMessage', () => {
  it('会话模型禁用时重新发送不会删除用户消息及其回答', async () => {
    const store = createStore();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRetryMessage(sendMessage), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current('user-1', 'existing-conv');
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
    ).toEqual(['user-1', 'assistant-1']);
    expect(store.getState().conversation.globalError).toBe(
      '该对话使用的模型当前不可用，请新建对话并选择其他模型',
    );
  });

  it('会话模型禁用时重新生成不会删除原问题及原回答', async () => {
    const store = createStore();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRetryMessage(sendMessage), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current('assistant-1', 'existing-conv');
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
    ).toEqual(['user-1', 'assistant-1']);
    expect(store.getState().conversation.globalError).toBe(
      '该对话使用的模型当前不可用，请新建对话并选择其他模型',
    );
  });

  it('会话模型健康状态异常时重新发送不会删除用户消息及其回答', async () => {
    const store = createStore('unhealthy');
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRetryMessage(sendMessage), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current('user-1', 'existing-conv');
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
    ).toEqual(['user-1', 'assistant-1']);
  });

  it('会话模型健康状态异常时重新生成不会删除原问题及原回答', async () => {
    const store = createStore('unhealthy');
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRetryMessage(sendMessage), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current('assistant-1', 'existing-conv');
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
    ).toEqual(['user-1', 'assistant-1']);
  });
});
