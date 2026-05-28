import { useCallback, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { upsertConversation, setHydrationStatus } from '@/redux/slices/conversationSlice';
import { getConversation } from '@/lib/api/chat';
import { buildChatFromServerConversation } from '@/lib/chat/conversationHydration';
import { store } from '@/redux/store';

export type ConversationHydrationView = 'loading' | 'error' | 'ready';

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}

export function useConversation(conversationId: string | null | undefined) {
  const dispatch = useAppDispatch();
  const hydrationRequestRef = useRef<{
    id: string;
    controller: AbortController;
    settled: boolean;
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

  const needsHydration =
    !!conversationId && (!conversation || conversation.messages.length === 0);

  useEffect(() => {
    if (!conversationId || !needsHydration || hydrationStatus !== 'idle') return;

    const controller = new AbortController();
    const request = { id: conversationId, controller, settled: false };
    hydrationRequestRef.current = request;
    dispatch(setHydrationStatus({ id: conversationId, status: 'loading' }));

    void getConversation(conversationId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const serverChat = buildChatFromServerConversation(data);
        // 合并：保留本地已有但服务端还没落库的消息（如刚 append 的用户消息）
        const existing = store.getState().conversation.byId[conversationId];
        if (existing && existing.messages.length > 0) {
          const serverIds = new Set(serverChat.messages.map(m => m.id));
          const localOnlyMessages = existing.messages.filter(m => !serverIds.has(m.id));
          if (localOnlyMessages.length > 0) {
            serverChat.messages = [...serverChat.messages, ...localOnlyMessages]
              .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          }
        }
        dispatch(upsertConversation(serverChat));
        dispatch(setHydrationStatus({ id: conversationId, status: 'done' }));
        request.settled = true;
        if (hydrationRequestRef.current === request) {
          hydrationRequestRef.current = null;
        }
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        const message = error instanceof Error ? error.message : '加载对话失败';
        dispatch(setHydrationStatus({ id: conversationId, status: 'error', error: message }));
        request.settled = true;
        if (hydrationRequestRef.current === request) {
          hydrationRequestRef.current = null;
        }
      });
  }, [conversationId, dispatch, hydrationStatus, needsHydration]);

  useEffect(() => {
    return () => {
      const request = hydrationRequestRef.current;
      if (!request || request.id !== conversationId || request.settled) return;
      request.controller.abort();
      hydrationRequestRef.current = null;
      dispatch(setHydrationStatus({ id: request.id, status: 'idle' }));
    };
  }, [conversationId, dispatch]);

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
