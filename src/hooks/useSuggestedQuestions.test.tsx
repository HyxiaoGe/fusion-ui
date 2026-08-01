import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import conversationReducer, {
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

import { shouldApplySuggestedQuestionsSnapshot } from '@/lib/chat/suggestedQuestionState';
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
