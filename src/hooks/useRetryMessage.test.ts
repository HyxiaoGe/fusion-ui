import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import conversationReducer, {
  upsertConversation,
} from '@/redux/slices/conversationSlice';
import modelsReducer, { updateModels } from '@/redux/slices/modelsSlice';
import { useRetryMessage } from './useRetryMessage';

const { getChatCapabilitiesMock } = vi.hoisted(() => ({
  getChatCapabilitiesMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  getChatCapabilities: getChatCapabilitiesMock,
}));

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
  beforeEach(() => {
    getChatCapabilitiesMock.mockReset();
    getChatCapabilitiesMock.mockResolvedValue({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
      message_retry_v1: true,
    });
  });

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

  it('首轮重试复用原轮次 ID 且不从本地删除用户问题', async () => {
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
        retryUserMessageId: 'user-1',
        retryAssistantMessageId: 'assistant-1',
      },
      undefined,
    );
    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
    ).toEqual(['user-1', 'assistant-1']);
  });

  it('失败用户消息没有持久化回答时只复用 user ID', async () => {
    const store = createStore('hidden');
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'disabled-model',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', id: 'text-user', text: '原始问题' }],
          status: 'failed',
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
      await result.current('user-1', 'existing-conv');
    });

    expect(sendMessage).toHaveBeenCalledWith(
      '原始问题',
      {
        conversationId: 'existing-conv',
        resolvedModelId: 'disabled-model',
        retryUserMessageId: 'user-1',
      },
      undefined,
    );
  });

  it('服务端未声明重试能力时保留原消息并拒绝发送', async () => {
    const store = createStore('hidden');
    getChatCapabilitiesMock.mockResolvedValueOnce({
      knowledge_grounding_v1: true,
      knowledge_grounding_max_bases: 5,
      message_retry_v1: false,
    });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRetryMessage(sendMessage), {
      wrapper: createWrapper(store),
    });

    await act(async () => {
      await result.current('user-1', 'existing-conv');
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(store.getState().conversation.globalError).toBe(
      '当前服务版本暂不支持安全重试，请刷新页面后再试',
    );
    expect(
      store.getState().conversation.byId['existing-conv'].messages.map((message) => message.id),
    ).toEqual(['user-1', 'assistant-1']);
  });

  it('历史轮次在客户端直接拒绝且不进入能力预检', async () => {
    const store = createStore('hidden');
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'disabled-model',
      messages: [
        {
          id: 'old-user',
          role: 'user',
          content: [{ type: 'text', id: 'old-user-text', text: '旧问题' }],
        },
        {
          id: 'old-assistant',
          role: 'assistant',
          content: [{ type: 'text', id: 'old-answer', text: '旧回答' }],
        },
        {
          id: 'latest-user',
          role: 'user',
          content: [{ type: 'text', id: 'latest-user-text', text: '新问题' }],
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
      await result.current('old-assistant', 'existing-conv');
    });

    expect(getChatCapabilitiesMock).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(store.getState().conversation.globalError).toBe(
      '只能重新发送或生成会话中的最后一轮消息',
    );
  });

  it('能力预检期间追加新一轮后拒绝过期重试', async () => {
    const store = createStore('hidden');
    let resolveCapabilities: ((value: {
      knowledge_grounding_v1: boolean;
      knowledge_grounding_max_bases: number;
      message_retry_v1: boolean;
    }) => void) | undefined;
    getChatCapabilitiesMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveCapabilities = resolve;
    }));
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRetryMessage(sendMessage), {
      wrapper: createWrapper(store),
    });

    let retryPromise: Promise<void> | undefined;
    act(() => {
      retryPromise = result.current('assistant-1', 'existing-conv');
    });
    expect(getChatCapabilitiesMock).toHaveBeenCalledTimes(1);

    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'disabled-model',
      messages: [
        ...store.getState().conversation.byId['existing-conv'].messages,
        {
          id: 'user-2',
          role: 'user',
          content: [{ type: 'text', id: 'text-user-2', text: '新一轮问题' }],
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    await act(async () => {
      resolveCapabilities?.({
        knowledge_grounding_v1: true,
        knowledge_grounding_max_bases: 5,
        message_retry_v1: true,
      });
      await retryPromise;
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(store.getState().conversation.globalError).toBe(
      '只能重新发送或生成会话中的最后一轮消息',
    );
  });

  it('能力预检期间切换会话后不继续旧会话重试', async () => {
    const store = createStore('hidden');
    let resolveCapabilities: ((value: {
      knowledge_grounding_v1: boolean;
      knowledge_grounding_max_bases: number;
      message_retry_v1: boolean;
    }) => void) | undefined;
    getChatCapabilitiesMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveCapabilities = resolve;
    }));
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ activeConversationId }) => useRetryMessage(sendMessage, activeConversationId),
      {
        initialProps: { activeConversationId: 'existing-conv' },
        wrapper: createWrapper(store),
      },
    );

    let retryPromise: Promise<void> | undefined;
    act(() => {
      retryPromise = result.current('assistant-1', 'existing-conv');
    });
    expect(getChatCapabilitiesMock).toHaveBeenCalledTimes(1);

    rerender({ activeConversationId: 'other-conv' });
    await act(async () => {
      resolveCapabilities?.({
        knowledge_grounding_v1: true,
        knowledge_grounding_max_bases: 5,
        message_retry_v1: true,
      });
      await retryPromise;
    });

    expect(sendMessage).not.toHaveBeenCalled();
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

  it('重试显式提交输入框当前改选的知识库范围', async () => {
    const store = createStore('hidden');
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'disabled-model',
      knowledge_base_ids: ['kb-old'],
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: [{ type: 'text', id: 'text-user', text: '按当前范围重试' }],
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
      await result.current('user-1', 'existing-conv', ['kb-new']);
    });

    expect(sendMessage).toHaveBeenCalledWith(
      '按当前范围重试',
      expect.objectContaining({
        conversationId: 'existing-conv',
        knowledgeBaseIds: ['kb-new'],
      }),
      undefined,
    );
  });

  it('输入框已清空知识库时允许重试带附件历史轮次并显式清空范围', async () => {
    const store = createStore('hidden');
    store.dispatch(upsertConversation({
      id: 'existing-conv',
      title: 'Existing',
      model_id: 'disabled-model',
      knowledge_base_ids: ['kb-old'],
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
      await result.current('assistant-1', 'existing-conv', []);
    });

    expect(sendMessage).toHaveBeenCalledWith(
      '读取旧附件',
      expect.objectContaining({
        conversationId: 'existing-conv',
        knowledgeBaseIds: [],
      }),
      [expect.objectContaining({ fileId: 'file-1' })],
    );
  });
});
