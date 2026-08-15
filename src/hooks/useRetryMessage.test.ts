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

function createStore(modelState: 'disabled' | 'unhealthy' | 'hidden' = 'disabled') {
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
      selectable: modelState !== 'hidden',
      routable: modelState === 'hidden' ? true : undefined,
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
    const TypedProvider = Provider as React.ComponentType<{
      store: ReturnType<typeof createStore>;
    }>;
    return React.createElement(TypedProvider, { store }, children);
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

  it('首轮重试在删除消息前固定已验证的会话模型', async () => {
    const store = createStore('hidden');
    const sendMessage = vi.fn().mockImplementation(async (_content, options) => {
      options.onAccepted?.();
    });
    const { result } = renderHook(() => useRetryMessage(sendMessage), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current('user-1', 'existing-conv');
    });

    expect(sendMessage).toHaveBeenCalledWith(
      '原始问题',
      {
        conversationId: 'existing-conv',
        resolvedModelId: 'disabled-model',
        onAccepted: expect.any(Function),
      },
      undefined,
    );
    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
    ).toEqual([]);
  });

  it('发送前预检拒绝重试时保留原问题及原回答', async () => {
    const store = createStore('hidden');
    const sendMessage = vi.fn().mockImplementation(async (_content, options) => {
      options.onRejectedBeforeSend?.();
    });
    const { result } = renderHook(() => useRetryMessage(sendMessage), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current('assistant-1', 'existing-conv');
    });

    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
    ).toEqual(['user-1', 'assistant-1']);
  });

  it.each(['user-1', 'assistant-1'])(
    '严格知识库会话重试带附件历史轮次 %s 时保留原消息',
    async (messageId) => {
      const store = createStore('hidden');
      store.dispatch(upsertConversation({
        id: 'existing-conv',
        title: 'Existing',
        model_id: 'disabled-model',
        knowledge_base_ids: ['kb-1'],
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: [
              { type: 'text', id: 'text-user', text: '读取旧附件' },
              {
                type: 'file',
                id: 'file-block',
                file_id: 'file-1',
                filename: '旧附件.pdf',
                mime_type: 'application/pdf',
              },
            ],
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
      const sendMessage = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useRetryMessage(sendMessage), {
        wrapper: createWrapper(store),
      });

      await act(async () => {
        await result.current(messageId, 'existing-conv');
      });

      expect(sendMessage).not.toHaveBeenCalled();
      expect(
        store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
      ).toEqual(['user-1', 'assistant-1']);
      expect(store.getState().conversation.globalError).toBe(
        '严格知识库模式不能重试带附件的历史消息，请先清空知识库选择',
      );
    },
  );
});
