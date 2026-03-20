import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { upsertConversation, setHydrationStatus } from '@/redux/slices/conversationSlice';
import { getConversation } from '@/lib/api/chat';
import { buildChatFromServerConversation } from '@/lib/chat/conversationHydration';

export type ConversationHydrationView = 'loading' | 'error' | 'ready';

export function useConversation(conversationId: string | null | undefined) {
  const dispatch = useAppDispatch();

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

  const needsHydration =
    !!conversationId && (!conversation || conversation.messages.length === 0);

  useEffect(() => {
    if (!conversationId || !needsHydration || hydrationStatus !== 'idle') return;

    dispatch(setHydrationStatus({ id: conversationId, status: 'loading' }));

    void getConversation(conversationId)
      .then((data) => {
        dispatch(upsertConversation(buildChatFromServerConversation(data)));
        dispatch(setHydrationStatus({ id: conversationId, status: 'done' }));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : '加载对话失败';
        dispatch(setHydrationStatus({ id: conversationId, status: 'error', error: message }));
      });
  }, [conversationId, dispatch, hydrationStatus, needsHydration]);

  const retryHydration = useCallback(() => {
    if (!conversationId) return;
    dispatch(setHydrationStatus({ id: conversationId, status: 'idle' }));
  }, [conversationId, dispatch]);

  const hydrationView: ConversationHydrationView = (() => {
    if (!conversationId) return 'ready';
    if (!needsHydration) return 'ready';
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
