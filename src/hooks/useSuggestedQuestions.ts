import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { fetchSuggestedQuestions as fetchApi } from '@/lib/api/chat';
import {
  invalidateConversationDetail,
  loadConversationDetail,
} from '@/lib/chat/conversationDetailResource';
import {
  resolveSuggestedQuestionsStatus,
  shouldApplySuggestedQuestionsSnapshot,
} from '@/lib/chat/suggestedQuestionState';
import {
  clearSuggestedQuestionsObservation,
  updateMessage,
} from '@/redux/slices/conversationSlice';
import type { Conversation, Message } from '@/types/conversation';

// 后端终态生成通常很快完成；轮询最多约 30 秒，避免异常 pending 留下永久定时器。
const PENDING_POLL_DELAYS_MS = [350, 750, 1_000, 1_500, 2_500, 4_000, 5_000, 5_000, 5_000, 5_000];
const MAX_UNKNOWN_OBSERVATION_CHECKS = 2;

function getLastAssistantMessage(conversation: Conversation | undefined): Message | undefined {
  return conversation?.messages
    .filter((message) => message.role === 'assistant' && message.content?.length > 0)
    .at(-1);
}

/**
 * 推荐问题 hook
 *
 * 首批推荐由后端在回答终态异步生成。前端只观察 pending 状态并有限轮询；
 * 只有用户点击“换一批”时才调用生成接口并传 force_refresh=true。
 */
export const useSuggestedQuestions = (chatId: string | null) => {
  const dispatch = useAppDispatch();
  const reduxStore = useStore();
  const [isManualRequestLoading, setIsManualRequestLoading] = useState(false);
  const [isPendingPollLoading, setIsPendingPollLoading] = useState(false);
  const activeChatIdRef = useRef(chatId);
  const manualRequestGenerationRef = useRef(0);
  activeChatIdRef.current = chatId;

  const conversation = useAppSelector((state) =>
    chatId ? (state.conversation.byId[chatId] as Conversation | undefined) : undefined
  );
  const observation = useAppSelector((state) =>
    chatId ? state.conversation.suggestedQuestionsObservations[chatId] : undefined
  );
  const lastAssistantMsg = getLastAssistantMessage(conversation);
  const lastAssistantMessageId = lastAssistantMsg?.id;
  const observationMessageIds = observation?.messageIds;
  const suggestedQuestions = lastAssistantMsg?.suggestedQuestions ?? [];
  const persistedStatus = lastAssistantMsg
    ? resolveSuggestedQuestionsStatus(lastAssistantMsg)
    : undefined;
  const isExplicitObservation = Boolean(
    lastAssistantMessageId && observationMessageIds?.includes(lastAssistantMessageId)
  );

  useEffect(() => {
    activeChatIdRef.current = chatId;
    manualRequestGenerationRef.current += 1;
    setIsManualRequestLoading(false);
    setIsPendingPollLoading(false);
    return () => {
      if (activeChatIdRef.current === chatId) {
        activeChatIdRef.current = null;
      }
      manualRequestGenerationRef.current += 1;
    };
  }, [chatId]);

  useEffect(() => {
    if (
      !chatId
      || !lastAssistantMessageId
      || (persistedStatus !== 'pending' && !isExplicitObservation)
    ) {
      setIsPendingPollLoading(false);
      return;
    }

    const requestChatId = chatId;
    const requestMessageId = lastAssistantMessageId;
    const requestMessageIds = Array.from(new Set([
      requestMessageId,
      ...(observationMessageIds ?? []),
    ]));
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let pollInFlight = false;
    let unknownObservationChecks = 0;
    let hasSeenPending = persistedStatus === 'pending';

    const finishPolling = () => {
      if (!cancelled && activeChatIdRef.current === requestChatId) {
        setIsPendingPollLoading(false);
      }
    };

    const scheduleNextPoll = () => {
      if (cancelled || activeChatIdRef.current !== requestChatId) {
        return;
      }
      const delay = PENDING_POLL_DELAYS_MS[attempt];
      if (delay === undefined) {
        finishPolling();
        return;
      }
      attempt += 1;
      timer = setTimeout(() => {
        void pollPersistedQuestions();
      }, delay);
    };

    const pollPersistedQuestions = async () => {
      if (cancelled || pollInFlight || activeChatIdRef.current !== requestChatId) {
        return;
      }
      pollInFlight = true;

      try {
        // 必须绕过详情资源的同会话缓存，否则 pending 快照可能被反复复用。
        invalidateConversationDetail(requestChatId);
        const freshConversation = await loadConversationDetail(requestChatId);
        if (cancelled || activeChatIdRef.current !== requestChatId) {
          return;
        }

        const freshMessage = freshConversation.messages.find(
          (message) => requestMessageIds.includes(message.id),
        );
        if (!freshMessage) {
          scheduleNextPoll();
          return;
        }

        const freshStatus = resolveSuggestedQuestionsStatus(freshMessage);
        if (freshStatus === 'pending') {
          hasSeenPending = true;
        }
        const currentMessage = (
          reduxStore.getState() as {
            conversation: { byId: Record<string, Conversation | undefined> };
          }
        ).conversation.byId[requestChatId]?.messages.find(
          (message) => message.id === requestMessageId,
        );
        const currentStatus = currentMessage
          ? resolveSuggestedQuestionsStatus(currentMessage)
          : undefined;
        if (
          isExplicitObservation
          && !hasSeenPending
          && (freshStatus === undefined || freshStatus === 'idle')
        ) {
          // 滚动发布兼容：旧后端永远不会 claim。仅立即查一次并短延迟复核一次，
          // 若仍未知/idle 就结束；任何一次见到 pending 后切回完整轮询。
          unknownObservationChecks += 1;
          if (unknownObservationChecks < MAX_UNKNOWN_OBSERVATION_CHECKS) {
            scheduleNextPoll();
          } else {
            dispatch(clearSuggestedQuestionsObservation({
              conversationId: requestChatId,
              messageId: requestMessageId,
            }));
            finishPolling();
          }
          return;
        }
        if (!shouldApplySuggestedQuestionsSnapshot(currentMessage, freshMessage)) {
          if (
            currentStatus === 'pending'
            || (
              isExplicitObservation
              && (currentStatus === undefined || currentStatus === 'idle')
            )
          ) {
            scheduleNextPoll();
          } else {
            dispatch(clearSuggestedQuestionsObservation({
              conversationId: requestChatId,
              messageId: requestMessageId,
            }));
            finishPolling();
          }
          return;
        }

        dispatch(updateMessage({
          conversationId: requestChatId,
          messageId: requestMessageId,
          patch: {
            suggestedQuestions: freshMessage.suggestedQuestions ?? [],
            suggestedQuestionsStatus: freshStatus,
            suggestedQuestionsRevision: freshMessage.suggestedQuestionsRevision,
          },
        }));
        if (freshStatus === 'ready' || freshStatus === 'failed') {
          dispatch(clearSuggestedQuestionsObservation({
            conversationId: requestChatId,
            messageId: requestMessageId,
          }));
        }

        if (freshStatus === 'pending') {
          scheduleNextPoll();
          return;
        }
        // ready、failed 以及无状态的历史消息均为终态，不继续轮询。
        finishPolling();
      } catch {
        scheduleNextPoll();
      } finally {
        pollInFlight = false;
      }
    };

    const pollImmediately = () => {
      if (cancelled || activeChatIdRef.current !== requestChatId) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void pollPersistedQuestions();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pollImmediately();
      }
    };

    setIsPendingPollLoading(true);
    window.addEventListener('focus', pollImmediately);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (isExplicitObservation && persistedStatus !== 'pending') {
      pollImmediately();
    } else {
      scheduleNextPoll();
    }

    return () => {
      cancelled = true;
      window.removeEventListener('focus', pollImmediately);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    chatId,
    dispatch,
    isExplicitObservation,
    lastAssistantMessageId,
    observationMessageIds,
    persistedStatus,
    reduxStore,
  ]);

  const fetchQuestions = useCallback(
    async (forceRefresh = false) => {
      // 首批推荐由后端终态任务负责，前端禁止用非手动路径重复触发生成。
      if (!forceRefresh || !chatId || !lastAssistantMsg) return;

      const requestChatId = chatId;
      const requestMessageId = lastAssistantMsg.id;
      const requestGeneration = manualRequestGenerationRef.current + 1;
      manualRequestGenerationRef.current = requestGeneration;

      setIsManualRequestLoading(true);
      try {
        const response = await fetchApi(requestChatId, {
          assistantMessageId: requestMessageId,
          forceRefresh: true,
          options: {},
        });
        if (
          activeChatIdRef.current !== requestChatId ||
          manualRequestGenerationRef.current !== requestGeneration
        ) {
          return;
        }

        const responseStatus = response.status
          ?? (response.questions.length > 0 ? 'ready' : undefined);
        dispatch(updateMessage({
          conversationId: requestChatId,
          messageId: requestMessageId,
          patch: {
            ...(response.questions.length > 0
              ? { suggestedQuestions: response.questions }
              : {}),
            suggestedQuestionsStatus: responseStatus,
            suggestedQuestionsRevision: response.revision,
          },
        }));
      } catch {
        // 换一批失败时保留上一批问题，不清空页面。
      } finally {
        if (
          activeChatIdRef.current === requestChatId &&
          manualRequestGenerationRef.current === requestGeneration
        ) {
          setIsManualRequestLoading(false);
        }
      }
    },
    [chatId, dispatch, lastAssistantMsg]
  );

  // 推荐问题已随消息持久化；发送下一轮时由新的最后一条 assistant 自然切换。
  const clearQuestions = useCallback(() => {}, []);

  return {
    suggestedQuestions,
    isLoadingQuestions: isManualRequestLoading || isPendingPollLoading,
    fetchQuestions,
    clearQuestions,
  };
};
