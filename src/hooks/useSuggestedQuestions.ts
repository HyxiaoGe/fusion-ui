import { useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { fetchSuggestedQuestions as fetchApi } from '@/lib/api/chat';
import { updateMessage } from '@/redux/slices/conversationSlice';
import type { Conversation } from '@/types/conversation';

/**
 * 推荐问题 hook
 *
 * 推荐问题随 assistant 消息持久化，刷新后自动恢复，无需重新请求。
 * fetchQuestions(forceRefresh=true) 支持"换一批"，新结果覆盖写回消息。
 */
export const useSuggestedQuestions = (chatId: string | null) => {
  const dispatch = useAppDispatch();
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  const conversation = useAppSelector((state) =>
    chatId ? (state.conversation.byId[chatId] as Conversation | undefined) : undefined
  );

  // 从最后一条有内容的 assistant 消息派生推荐问题
  const lastAssistantMsg = conversation?.messages
    .filter((m) => m.role === 'assistant' && m.content?.length > 0)
    .at(-1);

  const suggestedQuestions = lastAssistantMsg?.suggestedQuestions ?? [];

  const fetchQuestions = useCallback(
    async (forceRefresh = false) => {
      if (!chatId || !lastAssistantMsg) return;
      if (!forceRefresh && suggestedQuestions.length > 0) return;

      // 锁住本次请求的 chatId，防止切换会话后写到错误会话
      const requestChatId = chatId;
      const requestMsgId = lastAssistantMsg.id;

      setIsLoadingQuestions(true);
      try {
        const { questions } = await fetchApi(requestChatId, {});
        if (questions.length > 0) {
          // dispatch 前检查 chatId 是否还一致，已切换则丢弃结果
          if (requestChatId !== chatId) return;
          dispatch(
            updateMessage({
              conversationId: requestChatId,
              messageId: requestMsgId,
              patch: { suggestedQuestions: questions },
            })
          );
        }
      } catch {
        // 生成失败静默处理
      } finally {
        if (requestChatId === chatId) {
          setIsLoadingQuestions(false);
        }
      }
    },
    [chatId, lastAssistantMsg, suggestedQuestions.length, dispatch]
  );

  const clearQuestions = useCallback(() => {}, []);

  return {
    suggestedQuestions,
    isLoadingQuestions,
    fetchQuestions,
    clearQuestions,
  };
};
