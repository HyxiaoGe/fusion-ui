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

  it('reuses an existing empty chat instead of creating a new one', () => {
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

    expect(setActiveChatMock).toHaveBeenCalledWith('chat-empty');
    expect(createChatMock).not.toHaveBeenCalled();
    expect(onNewChatCreated).toHaveBeenCalledTimes(1);
  });

  it('creates a new chat when there is no reusable empty chat', () => {
    currentState.models.models = [
      { id: 'model-1', provider: 'qwen' },
    ];
    currentState.models.selectedModelId = 'model-1';
    currentState.chat.chats = [
      { id: 'chat-used', messages: [{ id: 'msg-1' }], title: '已有内容', updatedAt: 2 },
    ];

    const { result } = renderHook(() => useChatActions({}));

    result.current.newChat();

    expect(createChatMock).toHaveBeenCalledWith({
      model: 'model-1',
      provider: 'qwen',
      title: '',
    });
    expect(setActiveChatMock).not.toHaveBeenCalled();
  });

  it('dispatches an error when no model is available', () => {
    const { result } = renderHook(() => useChatActions({}));

    result.current.newChat();

    expect(setErrorMock).toHaveBeenCalledWith('没有可用的模型，无法创建对话');
    expect(createChatMock).not.toHaveBeenCalled();
  });

  it('creates a new chat with the first enabled fallback model', () => {
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

    expect(createChatMock).toHaveBeenCalledWith({
      model: 'enabled-model',
      provider: 'deepseek',
      title: '',
    });
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
