import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  mergeHydratedConversation,
  setHydrationStatus,
} from '@/redux/slices/conversationSlice';
import {
  getConversationDetailRequestMetadata,
  isStaleConversationDetailRequestError,
  loadConversationDetail,
} from '@/lib/chat/conversationDetailResource';
import {
  getConversationHydrationMetadata,
  getProtectedHydrationMessageIds,
} from '@/lib/chat/conversationHydrationMerge';
import type { RootState } from '@/redux/store';

export type ConversationHydrationView = 'loading' | 'error' | 'ready';

export function useConversation(conversationId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const attachedRequestRef = useRef<{
    conversationId: string;
    promise: ReturnType<typeof loadConversationDetail>;
  } | null>(null);
  const conversation = useAppSelector((state) =>
    conversationId ? state.conversation.byId[conversationId] : undefined
  );
  const hydrationStatus = useAppSelector((state) =>
    conversationId
      ? (state.conversation.hydrationStatus[conversationId] ?? 'idle')
      : 'idle'
  );
  const hydrationError = useAppSelector((state) =>
    conversationId ? state.conversation.hydrationError[conversationId] : undefined
  );

  const hydrateConversation = useCallback(() => {
    if (!conversationId) {
      return;
    }
    if (attachedRequestRef.current?.conversationId === conversationId) {
      return;
    }

    const request = loadConversationDetail(conversationId, {
      requestMetadata: getConversationHydrationMetadata(reduxStore.getState(), conversationId),
    });
    const requestMetadata = getConversationDetailRequestMetadata(request);
    attachedRequestRef.current = { conversationId, promise: request };
    dispatch(setHydrationStatus({ id: conversationId, status: 'loading' }));
    void request
      .then((serverConversation) => {
        const state = reduxStore.getState();
        dispatch(mergeHydratedConversation({
          conversation: serverConversation,
          preserveMessageIds: getProtectedHydrationMessageIds(state, conversationId),
          requestMetadata,
        }));
      })
      .catch((error) => {
        if (isStaleConversationDetailRequestError(error)) {
          return;
        }
        const message = error instanceof Error ? error.message : '加载对话失败';
        dispatch(setHydrationStatus({ id: conversationId, status: 'error', error: message }));
      })
      .finally(() => {
        if (attachedRequestRef.current?.promise === request) {
          attachedRequestRef.current = null;
        }
      });
  }, [conversationId, dispatch, reduxStore]);

  useEffect(() => {
    if (!conversationId || (hydrationStatus !== 'idle' && hydrationStatus !== 'loading')) {
      return;
    }
    hydrateConversation();
  }, [conversationId, hydrateConversation, hydrationStatus]);

  const retryHydration = useCallback(() => {
    hydrateConversation();
  }, [hydrateConversation]);

  const hydrationView: ConversationHydrationView = (() => {
    if (!conversationId || hydrationStatus === 'done') return 'ready';
    if (conversation && conversation.messages.length > 0) return 'ready';
    if (hydrationStatus === 'error') return 'error';
    return 'loading';
  })();

  return {
    conversation: conversation ?? null,
    hydrationView,
    hydrationError: hydrationError ?? null,
    retryHydration,
  };
}
