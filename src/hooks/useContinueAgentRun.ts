import { useCallback, useRef } from 'react';
import { useStore } from 'react-redux';
import { useAppDispatch } from '@/redux/hooks';
import { continueAgentRunStream, getConversation, stopStream } from '@/lib/api/chat';
import type { StreamCallbacks } from '@/lib/api/chat';
import { createAgentStreamEventHandlers } from '@/lib/agent/streamEventHandlers';
import { buildChatFromServerConversation } from '@/lib/chat/conversationHydration';
import { updateMessage } from '@/redux/slices/conversationSlice';
import {
  advanceTypewriter,
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  selectFullStreamContentBlocks,
  setStreamError,
  startStream,
} from '@/redux/slices/streamSlice';
import type { StreamState } from '@/redux/slices/streamSlice';
import type { Conversation } from '@/types/conversation';

interface ContinueAgentRunInput {
  conversationId: string;
  assistantMessageId: string;
  previousRunId?: string;
}

interface HookDeps {
  dispatch?: ReturnType<typeof useAppDispatch>;
  store?: ReturnType<typeof useStore>;
}

interface RootStateForContinuation {
  conversation: {
    byId: Record<string, Conversation>;
  };
  stream: StreamState;
}

interface ContinuationCallbackDeps {
  conversationId: string;
  assistantMessageId: string;
  dispatch: ReturnType<typeof useAppDispatch>;
  store: ReturnType<typeof useStore>;
  isActive: () => boolean;
  setServerMessageId: (messageId: string) => void;
}

interface ActiveContinuation {
  token: symbol;
  controller: AbortController;
  conversationId: string;
  assistantMessageId: string;
  serverMessageId?: string;
}

function refreshContinuationMessage({
  conversationId,
  assistantMessageId,
  dispatch,
}: Pick<ContinuationCallbackDeps, 'conversationId' | 'assistantMessageId' | 'dispatch'>): void {
  void (async () => {
    try {
      const serverConversation = await getConversation(conversationId) as Parameters<
        typeof buildChatFromServerConversation
      >[0];
      const refreshed = buildChatFromServerConversation(serverConversation);
      const dbMessage = refreshed.messages.find(message => message.id === assistantMessageId);
      if (dbMessage) {
        dispatch(updateMessage({
          conversationId,
          messageId: assistantMessageId,
          patch: {
            content: dbMessage.content,
            model_id: dbMessage.model_id,
            usage: dbMessage.usage,
            agent_run: dbMessage.agent_run,
          },
        }));
      }
    } catch (error) {
      console.warn('[chat] 继续执行完成后刷新会话失败，保留本地流式结果', error);
    }
  })();
}

function buildContinuationStreamCallbacks({
  conversationId,
  assistantMessageId,
  dispatch,
  store,
  isActive,
  setServerMessageId,
}: ContinuationCallbackDeps): StreamCallbacks {
  return {
    onReady: () => {},
    onReasoning: payload => {
      if (!isActive()) return;
      dispatch(appendThinkingDelta({
        blockId: payload.block_id,
        delta: payload.delta,
        runId: payload.run_id,
        stepId: payload.step_id,
      }));
    },
    onAnswering: payload => {
      if (!isActive()) return;
      const streamState = (store.getState() as RootStateForContinuation).stream;
      if (streamState.isStreamingReasoning) {
        dispatch(completeThinkingPhase());
      }
      dispatch(appendTextDelta({
        blockId: payload.block_id,
        delta: payload.delta,
        runId: payload.run_id,
        stepId: payload.step_id,
      }));
      dispatch(advanceTypewriter(payload.delta.length));
    },
    ...createAgentStreamEventHandlers({
      dispatch,
      isActive,
      resolveMessageId: () => assistantMessageId,
      setServerMessageId,
    }),
    onDone: () => {
      if (!isActive()) return;
      const streamState = (store.getState() as RootStateForContinuation).stream;
      const finalBlocks = selectFullStreamContentBlocks(streamState);
      dispatch(updateMessage({
        conversationId,
        messageId: assistantMessageId,
        patch: { content: finalBlocks },
      }));
      dispatch(endStream());

      if ((streamState.currentRun?.totalToolCalls ?? 0) > 0) {
        refreshContinuationMessage({ conversationId, assistantMessageId, dispatch });
      }
    },
    onError: (message, payload) => {
      if (!isActive()) return;
      dispatch(setStreamError({ message, code: payload?.code, data: payload?.data }));
    },
  };
}

export function useContinueAgentRun(deps: HookDeps = {}) {
  const realDispatch = useAppDispatch();
  const realStore = useStore();
  const dispatch = deps.dispatch ?? realDispatch;
  const store = deps.store ?? realStore;
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeContinuationRef = useRef<ActiveContinuation | null>(null);

  const continueAgentRun = useCallback(async ({
    conversationId,
    assistantMessageId,
    previousRunId,
  }: ContinueAgentRunInput) => {
    abortControllerRef.current?.abort();

    const state = store.getState() as RootStateForContinuation;
    const conversation = state.conversation.byId[conversationId];
    const assistantMessage = conversation?.messages.find(message => message.id === assistantMessageId);
    const staticBlocks = assistantMessage?.content ?? [];

    const controller = new AbortController();
    const token = Symbol('agent-continuation');
    abortControllerRef.current = controller;
    activeContinuationRef.current = {
      token,
      controller,
      conversationId,
      assistantMessageId,
    };
    dispatch(startStream({
      conversationId,
      messageId: assistantMessageId,
      staticBlocks,
    }));

    try {
      await continueAgentRunStream(
        { conversationId, messageId: assistantMessageId, previousRunId },
        buildContinuationStreamCallbacks({
          conversationId,
          assistantMessageId,
          dispatch,
          store,
          isActive: () => activeContinuationRef.current?.token === token,
          setServerMessageId: messageId => {
            const active = activeContinuationRef.current;
            if (active?.token === token) {
              active.serverMessageId = messageId;
            }
          },
        }),
        controller.signal,
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        dispatch(setStreamError({
          message: error instanceof Error ? error.message : '继续执行失败',
        }));
        dispatch(endStream());
      }
    } finally {
      if (activeContinuationRef.current?.token === token) {
        activeContinuationRef.current = null;
        abortControllerRef.current = null;
      }
    }
  }, [dispatch, store]);

  const stopContinueAgentRun = useCallback(async (): Promise<boolean> => {
    const active = activeContinuationRef.current;
    if (!active) {
      return false;
    }

    activeContinuationRef.current = null;
    abortControllerRef.current = null;

    const streamState = (store.getState() as RootStateForContinuation).stream;
    const partialBlocks = selectFullStreamContentBlocks(streamState);
    if (partialBlocks.length > 0) {
      dispatch(updateMessage({
        conversationId: active.conversationId,
        messageId: active.assistantMessageId,
        patch: { content: partialBlocks },
      }));
    }

    active.controller.abort();
    await stopStream(
      active.conversationId,
      streamState.currentRun?.serverMessageId ?? active.serverMessageId ?? active.assistantMessageId,
    );
    dispatch(endStream());
    return true;
  }, [dispatch, store]);

  return { continueAgentRun, stopContinueAgentRun };
}
