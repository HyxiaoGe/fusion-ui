import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  currentState,
  dispatchMock,
  useAppDispatchMock,
  useAppSelectorMock,
  triggerRefreshMock,
  createChatMock,
  setActiveChatMock,
  setErrorMock,
  clearMessagesMock,
  addMessageMock,
  startStreamingMock,
  updateStreamingContentMock,
  updateStreamingReasoningContentMock,
  endStreamingMock,
  setAnimatingTitleChatIdMock,
  updateChatTitleMock,
  updateServerChatTitleMock,
  updateChatModelMock,
  deleteMessageMock,
  startStreamingReasoningMock,
  updateMessageReasoningMock,
  endStreamingReasoningMock,
  editMessageActionMock,
  setMessageStatusMock,
  sendMessageStreamMock,
  updateMessageDurationMock,
  generateChatTitleMock,
  uuidMock,
} = vi.hoisted(() => {
  const action = (type: string) => vi.fn((payload?: unknown) => ({ type, payload }));
  let uuidCounter = 0;

  return {
    currentState: {
      models: {
        models: [],
        selectedModelId: null,
      },
      chat: {
        activeChatId: null,
        chats: [],
        reasoningEnabled: false,
      },
    } as any,
    dispatchMock: vi.fn(),
    useAppDispatchMock: vi.fn(),
    useAppSelectorMock: vi.fn(),
    triggerRefreshMock: vi.fn(),
    createChatMock: action('chat/createChat'),
    setActiveChatMock: action('chat/setActiveChat'),
    setErrorMock: action('chat/setError'),
    clearMessagesMock: action('chat/clearMessages'),
    addMessageMock: action('chat/addMessage'),
    startStreamingMock: action('chat/startStreaming'),
    updateStreamingContentMock: action('chat/updateStreamingContent'),
    updateStreamingReasoningContentMock: action('chat/updateStreamingReasoningContent'),
    endStreamingMock: action('chat/endStreaming'),
    setAnimatingTitleChatIdMock: action('chat/setAnimatingTitleChatId'),
    updateChatTitleMock: action('chat/updateChatTitle'),
    updateServerChatTitleMock: action('chat/updateServerChatTitle'),
    updateChatModelMock: action('chat/updateChatModel'),
    deleteMessageMock: action('chat/deleteMessage'),
    startStreamingReasoningMock: action('chat/startStreamingReasoning'),
    updateMessageReasoningMock: action('chat/updateMessageReasoning'),
    endStreamingReasoningMock: action('chat/endStreamingReasoning'),
    editMessageActionMock: action('chat/editMessage'),
    setMessageStatusMock: action('chat/setMessageStatus'),
    sendMessageStreamMock: vi.fn(),
    updateMessageDurationMock: vi.fn(),
    generateChatTitleMock: vi.fn(),
    uuidMock: vi.fn(() => `uuid-${++uuidCounter}`),
  };
});

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: useAppDispatchMock,
  useAppSelector: useAppSelectorMock,
}));

vi.mock('./useChatListRefresh', () => ({
  useChatListRefresh: () => ({
    triggerRefresh: triggerRefreshMock,
  }),
}));

vi.mock('@/redux/slices/chatSlice', () => ({
  createChat: createChatMock,
  clearMessages: clearMessagesMock,
  setError: setErrorMock,
  addMessage: addMessageMock,
  startStreaming: startStreamingMock,
  updateStreamingContent: updateStreamingContentMock,
  updateStreamingReasoningContent: updateStreamingReasoningContentMock,
  endStreaming: endStreamingMock,
  setActiveChat: setActiveChatMock,
  setAnimatingTitleChatId: setAnimatingTitleChatIdMock,
  updateChatTitle: updateChatTitleMock,
  updateServerChatTitle: updateServerChatTitleMock,
  updateChatModel: updateChatModelMock,
  deleteMessage: deleteMessageMock,
  startStreamingReasoning: startStreamingReasoningMock,
  updateMessageReasoning: updateMessageReasoningMock,
  endStreamingReasoning: endStreamingReasoningMock,
  editMessage: editMessageActionMock,
  setMessageStatus: setMessageStatusMock,
}));

vi.mock('@/lib/api/chat', () => ({
  sendMessageStream: sendMessageStreamMock,
  updateMessageDuration: updateMessageDurationMock,
}));

vi.mock('@/lib/api/title', () => ({
  generateChatTitle: generateChatTitleMock,
}));

vi.mock('@/redux/store', () => ({
  store: {
    dispatch: dispatchMock,
    getState: () => currentState,
  },
}));

vi.mock('uuid', () => ({
  v4: uuidMock,
}));

import { useChatActions } from './useChatActions';

describe('useChatActions.newChat', () => {
  beforeEach(() => {
    vi.useRealTimers();
    dispatchMock.mockReset();
    triggerRefreshMock.mockReset();
    createChatMock.mockClear();
    setActiveChatMock.mockClear();
    setErrorMock.mockClear();
    addMessageMock.mockClear();
    startStreamingMock.mockClear();
    updateStreamingContentMock.mockClear();
    updateStreamingReasoningContentMock.mockClear();
    endStreamingMock.mockClear();
    deleteMessageMock.mockClear();
    setMessageStatusMock.mockClear();
    sendMessageStreamMock.mockReset();
    generateChatTitleMock.mockReset();
    updateMessageDurationMock.mockReset();
    uuidMock.mockClear();
    currentState.models.models = [];
    currentState.models.selectedModelId = null;
    currentState.chat.activeChatId = null;
    currentState.chat.chats = [];
    currentState.chat.reasoningEnabled = false;
    useAppDispatchMock.mockReturnValue(dispatchMock);
    useAppSelectorMock.mockImplementation(selector => selector(currentState));
  });

  it('enters new-chat mode without reusing a historical empty chat', () => {
    currentState.models.models = [
      { id: 'model-1', provider: 'qwen' },
    ];
    currentState.models.selectedModelId = 'model-1';
    currentState.chat.chats = [
      { id: 'chat-empty', messages: [], title: '', updatedAt: 1 },
    ];

    const onNewChatCreated = vi.fn();
    const { result } = renderHook(() => useChatActions({ onNewChatCreated }));

    result.current.newChat();

    expect(createChatMock).not.toHaveBeenCalled();
    expect(setActiveChatMock).toHaveBeenCalledWith(null);
    expect(onNewChatCreated).toHaveBeenCalledTimes(1);
  });

  it('enters new-chat mode when there is no reusable empty chat', () => {
    currentState.models.models = [
      { id: 'model-1', provider: 'qwen' },
    ];
    currentState.models.selectedModelId = 'model-1';
    currentState.chat.chats = [
      { id: 'chat-used', messages: [{ id: 'msg-1' }], title: '已有内容', updatedAt: 2 },
    ];

    const { result } = renderHook(() => useChatActions({}));

    result.current.newChat();

    expect(createChatMock).not.toHaveBeenCalled();
    expect(setActiveChatMock).toHaveBeenCalledWith(null);
  });

  it('dispatches an error when no model is available', () => {
    const { result } = renderHook(() => useChatActions({}));

    result.current.newChat();

    expect(setErrorMock).toHaveBeenCalledWith('没有可用的模型，无法创建对话');
    expect(createChatMock).not.toHaveBeenCalled();
  });

  it('enters new-chat mode with the first enabled fallback model', () => {
    currentState.models.selectedModelId = 'disabled-model';
    currentState.models.models = [
      { id: 'disabled-model', provider: 'qwen', capabilities: {}, enabled: false },
      { id: 'enabled-model', provider: 'deepseek', capabilities: {}, enabled: true },
    ] as any;

    const { result } = renderHook(() =>
      useChatActions({
        onNewChatCreated: vi.fn(),
      }),
    );

    result.current.newChat();

    expect(createChatMock).not.toHaveBeenCalled();
    expect(setActiveChatMock).toHaveBeenCalledWith(null);
  });

  it('does not create a new chat when every model is unavailable', () => {
    currentState.models.selectedModelId = 'disabled-model';
    currentState.models.models = [
      { id: 'disabled-model', provider: 'qwen', capabilities: {}, enabled: false },
    ] as any;

    const { result } = renderHook(() => useChatActions({}));

    result.current.newChat();

    expect(createChatMock).not.toHaveBeenCalled();
    expect(setErrorMock).toHaveBeenCalledWith('没有可用的模型，无法创建对话');
  });

  it('blocks sending when the active chat model is unavailable', async () => {
    currentState.models.selectedModelId = 'enabled-model';
    currentState.models.models = [
      { id: 'enabled-model', provider: 'qwen', capabilities: {}, enabled: true },
      { id: 'legacy-model', provider: 'qwen', capabilities: {}, enabled: false },
    ] as any;
    currentState.chat.activeChatId = 'chat-1';
    currentState.chat.chats = [
      {
        id: 'chat-1',
        model: 'legacy-model',
        messages: [],
      },
    ] as any;

    const { result } = renderHook(() =>
      useChatActions({
        onSendMessageStart: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'chat/setError',
      payload: '当前会话绑定的模型已不可用，请新建会话后切换到可用模型',
    });
    expect(sendMessageStreamMock).not.toHaveBeenCalled();
  });
});

describe('useChatActions.sendMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createChatMock.mockClear();
    setActiveChatMock.mockClear();
    setErrorMock.mockClear();
    updateChatModelMock.mockClear();
    addMessageMock.mockClear();
    startStreamingMock.mockClear();
    updateStreamingContentMock.mockClear();
    updateStreamingReasoningContentMock.mockClear();
    endStreamingMock.mockClear();
    deleteMessageMock.mockClear();
    setMessageStatusMock.mockClear();
    dispatchMock.mockReset();
    sendMessageStreamMock.mockReset();
    generateChatTitleMock.mockReset();
    updateMessageDurationMock.mockReset();
    uuidMock.mockClear();
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          deepThinking: true,
        },
      },
    ];
    currentState.models.selectedModelId = 'model-1';
    currentState.chat.activeChatId = null;
    currentState.chat.chats = [];
    currentState.chat.reasoningEnabled = true;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('creates a chat and starts streaming with reasoning enabled', async () => {
    dispatchMock.mockImplementation(action => {
      if (action?.type === 'chat/createChat') {
        currentState.chat.activeChatId = action.payload.id;
        currentState.chat.chats = [
          ...currentState.chat.chats,
          {
            id: action.payload.id,
            title: action.payload.title,
            messages: [],
          },
        ];
      }

      if (action?.type === 'chat/addMessage') {
        currentState.chat.chats = currentState.chat.chats.map(chat =>
          chat.id === action.payload.chatId
            ? {
                ...chat,
                messages: [...chat.messages, action.payload.message],
              }
            : chat
        );
      }

      return action;
    });

    sendMessageStreamMock.mockImplementation(async (_payload, onChunk) => {
      onChunk('assistant answer', false, undefined, 'reasoning text');
    });

    const onSendMessageStart = vi.fn();
    const { result } = renderHook(() =>
      useChatActions({
        onSendMessageStart,
      })
    );

    const sendPromise = result.current.sendMessage('你好，介绍一下自己');
    await vi.advanceTimersByTimeAsync(50);
    await sendPromise;

    expect(onSendMessageStart).toHaveBeenCalledTimes(1);
    expect(createChatMock).toHaveBeenCalledWith({
      id: 'uuid-1',
      model: 'model-1',
      provider: 'qwen',
      title: '你好，介绍一下自己',
    });
    expect(addMessageMock).toHaveBeenCalledWith({
      chatId: 'uuid-1',
      message: expect.objectContaining({
        id: 'uuid-2',
        role: 'user',
        content: '你好，介绍一下自己',
        status: 'pending',
      }),
    });
    expect(startStreamingMock).toHaveBeenCalledWith('uuid-1');
    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      {
        provider: 'qwen',
        model: 'model-1',
        message: '你好，介绍一下自己',
        conversation_id: 'uuid-1',
        stream: true,
        options: {
          use_reasoning: true,
        },
      },
      expect.any(Function)
    );
    expect(updateStreamingContentMock).toHaveBeenCalledWith({
      chatId: 'uuid-1',
      content: 'assistant answer',
    });
    expect(updateStreamingReasoningContentMock).toHaveBeenCalledWith('reasoning text');
  });

  it('uses the first enabled model when the saved selection is unavailable', async () => {
    currentState.models.models = [
      {
        id: 'disabled-model',
        provider: 'qwen',
        enabled: false,
        capabilities: {
          deepThinking: false,
        },
      },
      {
        id: 'enabled-model',
        provider: 'deepseek',
        enabled: true,
        capabilities: {
          deepThinking: false,
        },
      },
    ];
    currentState.models.selectedModelId = 'disabled-model';

    dispatchMock.mockImplementation(action => {
      if (action?.type === 'chat/createChat') {
        currentState.chat.activeChatId = action.payload.id;
        currentState.chat.chats = [
          ...currentState.chat.chats,
          {
            id: action.payload.id,
            title: action.payload.title,
            model: action.payload.model,
            messages: [],
          },
        ];
      }

      if (action?.type === 'chat/addMessage') {
        currentState.chat.chats = currentState.chat.chats.map(chat =>
          chat.id === action.payload.chatId
            ? {
                ...chat,
                messages: [...chat.messages, action.payload.message],
              }
            : chat
        );
      }

      return action;
    });

    sendMessageStreamMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChatActions({}));

    const sendPromise = result.current.sendMessage('继续');
    await vi.advanceTimersByTimeAsync(50);
    await sendPromise;

    expect(createChatMock).toHaveBeenCalledWith({
      id: expect.any(String),
      model: 'enabled-model',
      provider: 'deepseek',
      title: '继续',
    });
    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'deepseek',
        model: 'enabled-model',
      }),
      expect.any(Function)
    );
  });

  it('does not send when no enabled model exists for a new chat', async () => {
    currentState.models.models = [
      {
        id: 'disabled-model',
        provider: 'qwen',
        enabled: false,
        capabilities: {
          deepThinking: false,
        },
      },
    ];
    currentState.models.selectedModelId = 'disabled-model';

    const { result } = renderHook(() => useChatActions({}));

    await result.current.sendMessage('继续');

    expect(createChatMock).not.toHaveBeenCalled();
    expect(sendMessageStreamMock).not.toHaveBeenCalled();
    expect(setErrorMock).toHaveBeenCalledWith('没有可用的模型，无法创建对话');
  });

  it('marks the latest user message as failed when streaming request errors', async () => {
    currentState.chat.activeChatId = 'chat-1';
    currentState.chat.streamingMessageId = null;
    currentState.chat.chats = [
      {
        id: 'chat-1',
        title: '',
        messages: [],
      },
    ];

    dispatchMock.mockImplementation(action => {
      if (action?.type === 'chat/addMessage') {
        currentState.chat.chats = currentState.chat.chats.map(chat =>
          chat.id === action.payload.chatId
            ? {
                ...chat,
                messages: [...chat.messages, action.payload.message],
              }
            : chat
        );
      }

      if (action?.type === 'chat/startStreaming') {
        currentState.chat.streamingMessageId = 'assistant-stream-1';
      }

      return action;
    });

    sendMessageStreamMock.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useChatActions({}));

    await result.current.sendMessage('继续');
    const failedMessageId = currentState.chat.chats[0]?.messages[0]?.id;

    expect(setErrorMock).toHaveBeenCalledWith('network down');
    expect(deleteMessageMock).toHaveBeenCalledWith({
      chatId: 'chat-1',
      messageId: 'assistant-stream-1',
    });
    expect(endStreamingMock).toHaveBeenCalledTimes(1);
    expect(setMessageStatusMock).toHaveBeenCalledWith({
      chatId: 'chat-1',
      messageId: failedMessageId || 'uuid-2',
      status: 'failed',
    });
  });

  it('triggers the stream completion callback after the first completed reply settles', async () => {
    currentState.chat.activeChatId = null;
    currentState.chat.streamingMessageId = null;
    currentState.chat.chats = [];

    dispatchMock.mockImplementation(action => {
      if (action?.type === 'chat/createChat') {
        currentState.chat.activeChatId = action.payload.id;
        currentState.chat.chats = [
          {
            id: action.payload.id,
            title: action.payload.title,
            messages: [],
          },
        ];
      }

      if (action?.type === 'chat/addMessage') {
        currentState.chat.chats = currentState.chat.chats.map(chat =>
          chat.id === action.payload.chatId
            ? {
                ...chat,
                messages: [...chat.messages, action.payload.message],
              }
            : chat
        );
      }

      if (action?.type === 'chat/startStreaming') {
        currentState.chat.streamingMessageId = 'assistant-stream-1';
        currentState.chat.chats = currentState.chat.chats.map(chat =>
          chat.id === action.payload
            ? {
                ...chat,
                messages: [
                  ...chat.messages,
                  {
                    id: 'assistant-stream-1',
                    role: 'assistant',
                    content: '',
                  },
                ],
              }
            : chat
        );
      }

      if (action?.type === 'chat/endStreaming') {
        currentState.chat.streamingMessageId = null;
      }

      return action;
    });

    sendMessageStreamMock.mockImplementation(async (_payload, onChunk) => {
      onChunk('完整回复', false, 'uuid-1', '推理内容');
      onChunk('完整回复', true, 'uuid-1', '推理内容');
    });
    const onStreamEnd = vi.fn();
    const { result } = renderHook(() =>
      useChatActions({
        onStreamEnd,
      })
    );

    const sendPromise = result.current.sendMessage('第一条消息');
    await vi.advanceTimersByTimeAsync(50);
    await sendPromise;
    await vi.runAllTimersAsync();

    expect(onStreamEnd).toHaveBeenCalledWith('uuid-1');
  });

  it('creates a fresh chat when sending from home instead of jumping to an older empty chat', async () => {
    currentState.chat.activeChatId = null;
    currentState.chat.chats = [
      {
        id: 'chat-empty',
        model: 'model-1',
        title: '',
        messages: [],
      },
    ] as any;

    dispatchMock.mockImplementation(action => {
      if (action?.type === 'chat/createChat') {
        currentState.chat.activeChatId = action.payload.id;
        currentState.chat.chats = [
          ...currentState.chat.chats,
          {
            id: action.payload.id,
            title: action.payload.title,
            model: action.payload.model,
            messages: [],
          },
        ];
      }

      if (action?.type === 'chat/addMessage') {
        currentState.chat.chats = currentState.chat.chats.map(chat =>
          chat.id === action.payload.chatId
            ? {
                ...chat,
                messages: [...chat.messages, action.payload.message],
              }
            : chat
        );
      }

      return action;
    });

    sendMessageStreamMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useChatActions({}));

    const sendPromise = result.current.sendMessage('新的问题');
    await vi.advanceTimersByTimeAsync(50);
    await sendPromise;

    expect(createChatMock).toHaveBeenCalledWith({
      id: expect.any(String),
      model: 'model-1',
      provider: 'qwen',
      title: '新的问题',
    });
    expect(createChatMock.mock.calls[0]?.[0]?.id).not.toBe('chat-empty');
    expect(setActiveChatMock).not.toHaveBeenCalled();
    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: expect.any(String),
      }),
      expect.any(Function)
    );
    expect(sendMessageStreamMock.mock.calls[0]?.[0]?.conversation_id).not.toBe('chat-empty');
  });

  it('ignores the existing active chat and only materializes a real chat after the server returns one in draft mode', async () => {
    currentState.chat.activeChatId = 'chat-existing';
    currentState.chat.chats = [
      {
        id: 'chat-existing',
        title: '旧会话',
        model: 'model-1',
        messages: [{ id: 'old-message', role: 'user', content: 'old' }],
      },
    ] as any;

    dispatchMock.mockImplementation(action => {
      if (action?.type === 'chat/createChat') {
        currentState.chat.activeChatId = action.payload.id;
        currentState.chat.chats = [
          ...currentState.chat.chats,
          {
            id: action.payload.id,
            title: action.payload.title,
            model: action.payload.model,
            messages: [],
          },
        ];
      }

      if (action?.type === 'chat/addMessage') {
        currentState.chat.chats = currentState.chat.chats.map(chat =>
          chat.id === action.payload.chatId
            ? {
                ...chat,
                messages: [...chat.messages, action.payload.message],
              }
            : chat
        );
      }

      return action;
    });

    sendMessageStreamMock.mockImplementation(async (_payload, onChunk) => {
      onChunk('新的回答', false, 'chat-created', undefined);
    });

    const { result } = renderHook(() =>
      useChatActions({
        draftMode: true,
      })
    );

    await result.current.sendMessage('新的草稿消息');

    expect(createChatMock).toHaveBeenCalledWith({
      id: 'chat-created',
      model: 'model-1',
      provider: 'qwen',
      title: '新的草稿消息',
    });
    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: undefined,
      }),
      expect.any(Function)
    );
    expect(sendMessageStreamMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'chat-existing',
      }),
      expect.any(Function)
    );
  });

  it('does not crash when a draft-mode send fails before a real chat is created', async () => {
    currentState.chat.activeChatId = 'chat-existing';
    currentState.chat.chats = [
      {
        id: 'chat-existing',
        title: '旧会话',
        model: 'model-1',
        messages: [{ id: 'old-message', role: 'user', content: 'old' }],
      },
    ] as any;

    sendMessageStreamMock.mockRejectedValue(new Error('draft send failed'));

    const { result } = renderHook(() =>
      useChatActions({
        draftMode: true,
      })
    );

    await result.current.sendMessage('新的草稿消息');

    expect(createChatMock).not.toHaveBeenCalled();
    expect(setMessageStatusMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: null,
      })
    );
    expect(deleteMessageMock).not.toHaveBeenCalled();
    expect(setErrorMock).toHaveBeenCalledWith('draft send failed');
    expect(endStreamingMock).toHaveBeenCalledTimes(1);
  });
});

describe('useChatActions.retryMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dispatchMock.mockReset();
    triggerRefreshMock.mockReset();
    createChatMock.mockClear();
    setActiveChatMock.mockClear();
    setErrorMock.mockClear();
    addMessageMock.mockClear();
    startStreamingMock.mockClear();
    updateStreamingContentMock.mockClear();
    updateStreamingReasoningContentMock.mockClear();
    endStreamingMock.mockClear();
    setMessageStatusMock.mockClear();
    sendMessageStreamMock.mockReset();
    generateChatTitleMock.mockReset();
    updateMessageDurationMock.mockReset();
    uuidMock.mockClear();
    currentState.models.models = [
      {
        id: 'model-1',
        provider: 'qwen',
        capabilities: {
          deepThinking: true,
        },
      },
    ];
    currentState.models.selectedModelId = 'model-1';
    currentState.chat.activeChatId = 'chat-1';
    currentState.chat.reasoningEnabled = true;
    currentState.chat.chats = [
      {
        id: 'chat-1',
        title: '测试会话',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: '重试这条消息',
            status: 'failed',
          },
        ],
      },
    ];
    useAppDispatchMock.mockReturnValue(dispatchMock);
    useAppSelectorMock.mockImplementation(selector => selector(currentState));
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('retries a failed user message and clears the failed state after success', async () => {
    sendMessageStreamMock.mockImplementation(async (_payload, onChunk) => {
      onChunk('重新生成的回复', false, undefined, '补充推理');
      onChunk('重新生成的回复', true, undefined, '补充推理');
    });

    const onStreamEnd = vi.fn();
    const { result } = renderHook(() =>
      useChatActions({
        onStreamEnd,
      })
    );

    const retryPromise = result.current.retryMessage('user-1');
    await retryPromise;
    await vi.advanceTimersByTimeAsync(2500);

    expect(setMessageStatusMock).toHaveBeenNthCalledWith(1, {
      chatId: 'chat-1',
      messageId: 'user-1',
      status: 'pending',
    });
    expect(sendMessageStreamMock).toHaveBeenCalledWith(
      {
        provider: 'qwen',
        model: 'model-1',
        message: '重试这条消息',
        conversation_id: 'chat-1',
        stream: true,
        options: {
          use_reasoning: true,
        },
      },
      expect.any(Function)
    );
    expect(setMessageStatusMock).toHaveBeenCalledWith({
      chatId: 'chat-1',
      messageId: 'user-1',
      status: null,
    });
    expect(onStreamEnd).toHaveBeenCalledWith('chat-1');
  });
});
