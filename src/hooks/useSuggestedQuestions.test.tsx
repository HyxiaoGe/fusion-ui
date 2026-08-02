import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import conversationReducer, {
  applySuggestedQuestionsPending,
  requestSuggestedQuestionsObservation,
  updateMessage,
  upsertConversation,
} from '@/redux/slices/conversationSlice';
import type { Conversation, Message } from '@/types/conversation';

const {
  fetchSuggestedQuestionsMock,
  invalidateConversationDetailMock,
  loadConversationDetailMock,
} = vi.hoisted(() => ({
  fetchSuggestedQuestionsMock: vi.fn(),
  invalidateConversationDetailMock: vi.fn(),
  loadConversationDetailMock: vi.fn(),
}));

vi.mock('@/lib/api/chat', () => ({
  fetchSuggestedQuestions: fetchSuggestedQuestionsMock,
}));

vi.mock('@/lib/chat/conversationDetailResource', () => ({
  invalidateConversationDetail: invalidateConversationDetailMock,
  loadConversationDetail: loadConversationDetailMock,
}));

import {
  hasFormalTextContent,
  shouldApplySuggestedQuestionsSnapshot,
} from '@/lib/chat/suggestedQuestionState';
import { useSuggestedQuestions } from './useSuggestedQuestions';

function assistantMessage(
  id: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    role: 'assistant',
    content: [{ type: 'text', id: `${id}-text`, text: '回答' }],
    timestamp: 1,
    ...overrides,
  };
}

function conversation(id: string, messages: Message[]): Conversation {
  return {
    id,
    title: id,
    model_id: 'model-1',
    messages,
    createdAt: 1,
    updatedAt: 1,
  };
}

function createWrapper(initialConversations: Conversation[]) {
  const store = configureStore({
    reducer: { conversation: conversationReducer },
  });
  initialConversations.forEach((item) => store.dispatch(upsertConversation(item)));

  return {
    store,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  };
}

describe('useSuggestedQuestions', () => {
  beforeEach(() => {
    vi.useRealTimers();
    fetchSuggestedQuestionsMock.mockReset();
    invalidateConversationDetailMock.mockReset();
    loadConversationDetailMock.mockReset();
  });

  it('正式正文判定只接受非空 text，不把 thinking 或空白正文当成推荐任务', () => {
    expect(hasFormalTextContent([
      { type: 'thinking', id: 'thinking-1', thinking: '仅推理' },
      { type: 'text', id: 'text-empty', text: '   ' },
    ])).toBe(false);
    expect(hasFormalTextContent([
      { type: 'text', id: 'text-1', text: '正式回答' },
    ])).toBe(true);
  });

  it('版本比较拒绝旧 revision 及同 revision 的终态回退到 pending', () => {
    const current = assistantMessage('assistant-a', {
      suggestedQuestions: ['手动新问题'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 2,
    });

    expect(shouldApplySuggestedQuestionsSnapshot(current, assistantMessage('assistant-a', {
      suggestedQuestions: ['迟到自动问题'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 1,
    }))).toBe(false);
    expect(shouldApplySuggestedQuestionsSnapshot(current, assistantMessage('assistant-a', {
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 2,
    }))).toBe(false);
    expect(shouldApplySuggestedQuestionsSnapshot(current, assistantMessage('assistant-a', {
      suggestedQuestions: ['更新问题'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 3,
    }))).toBe(true);
  });

  it('长回答即使消息时间很早，只要状态 pending 仍轮询到 ready 并展示', async () => {
    vi.useFakeTimers();
    const pending = assistantMessage('assistant-long', {
      timestamp: Date.now() - 10 * 60_000,
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 1,
    });
    const ready = assistantMessage('assistant-long', {
      suggestedQuestions: ['推荐问题 A'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 1,
    });
    const { wrapper } = createWrapper([conversation('chat-a', [pending])]);
    loadConversationDetailMock.mockResolvedValue(conversation('chat-a', [ready]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });

    expect(result.current.isLoadingQuestions).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(loadConversationDetailMock).toHaveBeenCalledWith('chat-a');
    expect(invalidateConversationDetailMock).toHaveBeenCalledWith('chat-a');
    expect(result.current.suggestedQuestions).toEqual(['推荐问题 A']);
    expect(fetchSuggestedQuestionsMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('本轮终态状态未知时立即权威 GET 并进入观察，不 POST 生成接口', async () => {
    const unknown = assistantMessage('assistant-unknown');
    const ready = assistantMessage('assistant-unknown', {
      suggestedQuestions: ['即时推荐'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 1,
    });
    const { store, wrapper } = createWrapper([conversation('chat-a', [unknown])]);
    store.dispatch(requestSuggestedQuestionsObservation({
      conversationId: 'chat-a',
      messageIds: ['assistant-unknown'],
    }));
    loadConversationDetailMock.mockResolvedValue(conversation('chat-a', [ready]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadConversationDetailMock).toHaveBeenCalledWith('chat-a');
    expect(invalidateConversationDetailMock).toHaveBeenCalledWith('chat-a');
    expect(result.current.suggestedQuestions).toEqual(['即时推荐']);
    expect(fetchSuggestedQuestionsMock).not.toHaveBeenCalled();
    expect(store.getState().conversation.suggestedQuestionsObservations['chat-a']).toBeUndefined();
  });

  it('旧后端持续 unknown/idle 时只立即 GET 加一次短延迟复核', async () => {
    vi.useFakeTimers();
    const unknown = assistantMessage('assistant-delayed');
    const idle = assistantMessage('assistant-delayed', {
      suggestedQuestionsStatus: 'idle',
      suggestedQuestionsRevision: 0,
    });
    const { store, wrapper } = createWrapper([conversation('chat-a', [unknown])]);
    store.dispatch(requestSuggestedQuestionsObservation({
      conversationId: 'chat-a',
      messageIds: ['assistant-delayed'],
    }));
    loadConversationDetailMock
      .mockResolvedValueOnce(conversation('chat-a', [unknown]))
      .mockResolvedValue(conversation('chat-a', [idle]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
    expect(store.getState().conversation.suggestedQuestionsObservations['chat-a']).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(2);
    expect(store.getState().conversation.suggestedQuestionsObservations['chat-a']).toBeUndefined();
    expect(result.current.isLoadingQuestions).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(2);
    expect(result.current.suggestedQuestions).toEqual([]);
    expect(fetchSuggestedQuestionsMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('短窗口内看到 pending 后切回完整轮询直到 ready', async () => {
    vi.useFakeTimers();
    const unknown = assistantMessage('assistant-transition');
    const pending = assistantMessage('assistant-transition', {
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 1,
    });
    const ready = assistantMessage('assistant-transition', {
      suggestedQuestions: ['新后端推荐'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 1,
    });
    const { store, wrapper } = createWrapper([conversation('chat-a', [unknown])]);
    store.dispatch(requestSuggestedQuestionsObservation({
      conversationId: 'chat-a',
      messageIds: ['assistant-transition'],
    }));
    loadConversationDetailMock
      .mockResolvedValueOnce(conversation('chat-a', [unknown]))
      .mockResolvedValueOnce(conversation('chat-a', [pending]))
      .mockResolvedValueOnce(conversation('chat-a', [ready]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(2);
    expect(result.current.isLoadingQuestions).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(3);
    expect(result.current.suggestedQuestions).toEqual(['新后端推荐']);
    expect(result.current.isLoadingQuestions).toBe(false);
    expect(fetchSuggestedQuestionsMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('页面重新聚焦时立即补查 pending，不等待下一轮定时器', async () => {
    vi.useFakeTimers();
    const pending = assistantMessage('assistant-focus', {
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 1,
    });
    const ready = assistantMessage('assistant-focus', {
      suggestedQuestions: ['聚焦后推荐'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 1,
    });
    const { wrapper } = createWrapper([conversation('chat-a', [pending])]);
    loadConversationDetailMock.mockResolvedValue(conversation('chat-a', [ready]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });
    expect(loadConversationDetailMock).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
    expect(result.current.suggestedQuestions).toEqual(['聚焦后推荐']);
    vi.useRealTimers();
  });

  it('页面重新可见时立即补查 pending，不等待下一轮定时器', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const pending = assistantMessage('assistant-visible', {
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 1,
    });
    const ready = assistantMessage('assistant-visible', {
      suggestedQuestions: ['恢复可见后的推荐'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 1,
    });
    const { wrapper } = createWrapper([conversation('chat-a', [pending])]);
    loadConversationDetailMock.mockResolvedValue(conversation('chat-a', [ready]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
    expect(result.current.suggestedQuestions).toEqual(['恢复可见后的推荐']);
    vi.useRealTimers();
  });

  it('pending 后的 onDone 观察保留服务端 ID，并用 ready GET patch 本地 placeholder', async () => {
    vi.useFakeTimers();
    const localPending = assistantMessage('local-assistant');
    const serverReady = assistantMessage('server-assistant', {
      suggestedQuestions: ['映射后的推荐'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 2,
    });
    const { store, wrapper } = createWrapper([conversation('chat-a', [localPending])]);
    store.dispatch(applySuggestedQuestionsPending({
      conversationId: 'chat-a',
      messageId: 'server-assistant',
      localMessageId: 'local-assistant',
      revision: 2,
    }));
    // continuation onDone 只知道本地 assistant ID，不能覆盖 pending 事件保存的服务端 ID。
    store.dispatch(requestSuggestedQuestionsObservation({
      conversationId: 'chat-a',
      messageIds: ['local-assistant'],
    }));
    expect(store.getState().conversation.suggestedQuestionsObservations['chat-a']).toEqual({
      messageIds: ['local-assistant', 'server-assistant'],
    });
    loadConversationDetailMock.mockResolvedValue(conversation('chat-a', [serverReady]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current.suggestedQuestions).toEqual(['映射后的推荐']);
    expect(store.getState().conversation.byId['chat-a'].messages[0]).toMatchObject({
      id: 'local-assistant',
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 2,
    });
    vi.useRealTimers();
  });

  it('新一轮观察不误用排在前面的旧 assistant ready 结果', async () => {
    const oldPending = assistantMessage('assistant-old', {
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 1,
    });
    const newUnknown = assistantMessage('assistant-new');
    const oldReady = assistantMessage('assistant-old', {
      suggestedQuestions: ['旧轮推荐'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 1,
    });
    const newReady = assistantMessage('assistant-new', {
      suggestedQuestions: ['新轮推荐'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 1,
    });
    const { store, wrapper } = createWrapper([
      conversation('chat-a', [oldPending, newUnknown]),
    ]);
    store.dispatch(requestSuggestedQuestionsObservation({
      conversationId: 'chat-a',
      messageIds: ['assistant-old', 'server-old'],
    }));
    store.dispatch(requestSuggestedQuestionsObservation({
      conversationId: 'chat-a',
      messageIds: ['assistant-new'],
    }));
    loadConversationDetailMock.mockResolvedValue(
      conversation('chat-a', [oldReady, newReady]),
    );

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.suggestedQuestions).toEqual(['新轮推荐']);
    expect(store.getState().conversation.byId['chat-a'].messages[1]).toMatchObject({
      id: 'assistant-new',
      suggestedQuestions: ['新轮推荐'],
      suggestedQuestionsStatus: 'ready',
    });
  });

  it('手动换一批精确指定最后一条 assistant 消息且只在手动路径 force=true', async () => {
    const { wrapper } = createWrapper([
      conversation('chat-a', [
        assistantMessage('assistant-1', { suggestedQuestions: ['旧问题'] }),
        assistantMessage('assistant-2', { suggestedQuestions: ['当前问题'] }),
      ]),
    ]);
    fetchSuggestedQuestionsMock.mockResolvedValue({
      questions: ['新问题'],
      status: 'ready',
      revision: 4,
    });

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });

    await act(async () => {
      await result.current.fetchQuestions(true);
    });

    expect(fetchSuggestedQuestionsMock).toHaveBeenCalledWith('chat-a', {
      assistantMessageId: 'assistant-2',
      forceRefresh: true,
      options: {},
    });
    expect(result.current.suggestedQuestions).toEqual(['新问题']);
  });

  it('切换会话会清理 pending 轮询并忽略旧会话迟到结果', async () => {
    vi.useFakeTimers();
    let resolveOldPoll: ((value: Conversation) => void) | undefined;
    const oldPoll = new Promise<Conversation>((resolve) => {
      resolveOldPoll = resolve;
    });
    const { store, wrapper } = createWrapper([
      conversation('chat-a', [assistantMessage('assistant-a', {
        suggestedQuestionsStatus: 'pending',
      })]),
      conversation('chat-b', [assistantMessage('assistant-b')]),
    ]);
    loadConversationDetailMock.mockReturnValue(oldPoll);

    const { rerender } = renderHook(
      ({ chatId }) => useSuggestedQuestions(chatId),
      { initialProps: { chatId: 'chat-a' }, wrapper },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);

    rerender({ chatId: 'chat-b' });
    await act(async () => {
      resolveOldPoll?.(conversation('chat-a', [assistantMessage('assistant-a', {
        suggestedQuestions: ['迟到问题'],
        suggestedQuestionsStatus: 'ready',
      })]));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
    expect(store.getState().conversation.byId['chat-a'].messages[0].suggestedQuestions).toBeUndefined();
    vi.useRealTimers();
  });

  it('手动换一批已推进 revision 时拒绝迟到 GET 用旧 revision 覆盖', async () => {
    vi.useFakeTimers();
    let resolveOldPoll: ((value: Conversation) => void) | undefined;
    const oldPoll = new Promise<Conversation>((resolve) => {
      resolveOldPoll = resolve;
    });
    const { store, wrapper } = createWrapper([
      conversation('chat-a', [assistantMessage('assistant-a', {
        suggestedQuestions: ['旧问题'],
        suggestedQuestionsStatus: 'pending',
        suggestedQuestionsRevision: 1,
      })]),
    ]);
    loadConversationDetailMock.mockReturnValue(oldPoll);

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await act(async () => {
      store.dispatch(updateMessage({
        conversationId: 'chat-a',
        messageId: 'assistant-a',
        patch: {
          suggestedQuestions: ['手动新问题'],
          suggestedQuestionsStatus: 'ready',
          suggestedQuestionsRevision: 2,
        },
      }));
      resolveOldPoll?.(conversation('chat-a', [assistantMessage('assistant-a', {
        suggestedQuestions: ['迟到自动问题'],
        suggestedQuestionsStatus: 'ready',
        suggestedQuestionsRevision: 1,
      })]));
      await Promise.resolve();
    });

    expect(result.current.suggestedQuestions).toEqual(['手动新问题']);
    expect(store.getState().conversation.byId['chat-a'].messages[0]).toMatchObject({
      suggestedQuestions: ['手动新问题'],
      suggestedQuestionsStatus: 'ready',
      suggestedQuestionsRevision: 2,
    });
    vi.useRealTimers();
  });

  it('pending 持续不结束时到达次数上限后停止 loading 和后续轮询', async () => {
    vi.useFakeTimers();
    const pending = assistantMessage('assistant-pending', {
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 1,
    });
    const { wrapper } = createWrapper([conversation('chat-a', [pending])]);
    loadConversationDetailMock.mockResolvedValue(conversation('chat-a', [pending]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
    });

    expect(loadConversationDetailMock).toHaveBeenCalledTimes(10);
    expect(invalidateConversationDetailMock).toHaveBeenCalledTimes(10);
    expect(result.current.isLoadingQuestions).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(10);
    vi.useRealTimers();
  });

  it('轮询得到 failed 后停止并保留后端返回的上一批问题', async () => {
    vi.useFakeTimers();
    const pending = assistantMessage('assistant-failed', {
      suggestedQuestions: ['上一批问题'],
      suggestedQuestionsStatus: 'pending',
      suggestedQuestionsRevision: 2,
    });
    const failed = assistantMessage('assistant-failed', {
      suggestedQuestions: ['上一批问题'],
      suggestedQuestionsStatus: 'failed',
      suggestedQuestionsRevision: 2,
    });
    const { wrapper } = createWrapper([conversation('chat-a', [pending])]);
    loadConversationDetailMock.mockResolvedValue(conversation('chat-a', [failed]));

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(result.current.isLoadingQuestions).toBe(false);
    expect(result.current.suggestedQuestions).toEqual(['上一批问题']);
    expect(loadConversationDetailMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('历史消息缺少状态字段时直接恢复已有推荐，不启动轮询或生成', () => {
    const { wrapper } = createWrapper([
      conversation('chat-a', [assistantMessage('assistant-legacy', {
        suggestedQuestions: ['历史问题'],
      })]),
    ]);

    const { result } = renderHook(() => useSuggestedQuestions('chat-a'), { wrapper });

    expect(result.current.suggestedQuestions).toEqual(['历史问题']);
    expect(result.current.isLoadingQuestions).toBe(false);
    expect(loadConversationDetailMock).not.toHaveBeenCalled();
    expect(fetchSuggestedQuestionsMock).not.toHaveBeenCalled();
  });
});
