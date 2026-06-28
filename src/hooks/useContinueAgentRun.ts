import { useCallback, useRef } from 'react';
import { useStore } from 'react-redux';
import { useAppDispatch } from '@/redux/hooks';
import { continueAgentRunStream, getConversation, stopStream } from '@/lib/api/chat';
import type { StreamCallbacks } from '@/lib/api/chat';
import { getRunStatusFromFinishReason } from '@/lib/agent/finishReason';
import { buildChatFromServerConversation } from '@/lib/chat/conversationHydration';
import { updateMessage } from '@/redux/slices/conversationSlice';
import {
  advanceTypewriter,
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  finalizeRun,
  finalizeStep,
  finalizeToolCall,
  initRun,
  markLimitReached,
  mergeToolCallDelta,
  pushStep,
  pushToolCall,
  selectFullStreamContentBlocks,
  setStreamError,
  startStream,
} from '@/redux/slices/streamSlice';
import type { StreamState } from '@/redux/slices/streamSlice';
import type {
  FinalizeToolCallStatus,
  LimitReachedReason,
  ToolCallResultSummary,
} from '@/types/agentRun';
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
    onRunStarted: ev => {
      if (!isActive()) return;
      setServerMessageId(ev.message_id);
      dispatch(initRun({
        runId: ev.run_id,
        messageId: assistantMessageId,
        serverMessageId: ev.message_id,
        config: {
          maxSteps: (ev.config.max_steps as number) ?? 0,
          maxToolCalls: (ev.config.max_tool_calls as number) ?? 0,
          timeoutS: (ev.config.timeout_s as number) ?? 0,
        },
        sequence: ev.sequence,
      }));
    },
    onStepStarted: ev => {
      if (!isActive()) return;
      if (!ev.step_id) return;
      dispatch(pushStep({
        runId: ev.run_id,
        stepId: ev.step_id,
        stepNumber: ev.step_number,
        sequence: ev.sequence,
      }));
    },
    onToolCallStarted: ev => {
      if (!isActive()) return;
      if (!ev.step_id || !ev.tool_call_id) return;
      dispatch(pushToolCall({
        runId: ev.run_id,
        stepId: ev.step_id,
        toolCallId: ev.tool_call_id,
        toolName: ev.tool_name,
        arguments: ev.arguments,
        sequence: ev.sequence,
      }));
    },
    onToolCallDelta: ev => {
      if (!isActive()) return;
      if (!ev.tool_call_id) return;
      dispatch(mergeToolCallDelta({
        runId: ev.run_id,
        toolCallId: ev.tool_call_id,
        delta: ev.delta,
        sequence: ev.sequence,
      }));
    },
    onToolCallCompleted: ev => {
      if (!isActive()) return;
      if (!ev.tool_call_id) return;
      dispatch(finalizeToolCall({
        runId: ev.run_id,
        toolCallId: ev.tool_call_id,
        status: ev.status as FinalizeToolCallStatus,
        durationMs: ev.duration_ms,
        resultSummary: ev.result_summary as unknown as ToolCallResultSummary | undefined,
        error: ev.error ?? null,
        sequence: ev.sequence,
      }));
    },
    onStepCompleted: ev => {
      if (!isActive()) return;
      if (!ev.step_id) return;
      dispatch(finalizeStep({
        runId: ev.run_id,
        stepId: ev.step_id,
        sequence: ev.sequence,
      }));
    },
    onRunLimitReached: ev => {
      if (!isActive()) return;
      dispatch(markLimitReached({
        runId: ev.run_id,
        reason: ev.reason as LimitReachedReason,
        sequence: ev.sequence,
      }));
    },
    onRunInterrupted: ev => {
      if (!isActive()) return;
      dispatch(finalizeRun({
        runId: ev.run_id,
        status: 'interrupted',
        reason: ev.reason,
        sequence: ev.sequence,
      }));
    },
    onRunFailed: ev => {
      if (!isActive()) return;
      dispatch(finalizeRun({
        runId: ev.run_id,
        status: 'failed',
        failure: { code: ev.error_code, message: ev.message },
        sequence: ev.sequence,
      }));
    },
    onRunCompleted: ev => {
      if (!isActive()) return;
      dispatch(finalizeRun({
        runId: ev.run_id,
        status: getRunStatusFromFinishReason(ev.finish_reason),
        sequence: ev.sequence,
      }));
    },
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
