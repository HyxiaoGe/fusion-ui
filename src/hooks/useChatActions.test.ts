import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
} = vi.hoisted(() => {
  const action = (type: string) => vi.fn((payload?: unknown) => ({ type, payload }));

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

import { useChatActions } from './useChatActions';

describe('useChatActions.newChat', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    triggerRefreshMock.mockReset();
    createChatMock.mockClear();
    setActiveChatMock.mockClear();
    setErrorMock.mockClear();
    sendMessageStreamMock.mockReset();
    generateChatTitleMock.mockReset();
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
});
