'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Files } from 'lucide-react';
import { ChatMessageListLazy } from '@/components/lazy/LazyComponents';
import ChatInput, { type ChatUploadCompleteFile } from '@/components/chat/ChatInput';
import ConversationFilesPanel from '@/components/chat/ConversationFilesPanel';
import {
  tryConversationFileToComposerAttachment,
  type ConversationComposerAttachment,
} from '@/components/chat/composerAttachments';
import { Button } from '@/components/ui/button';
import type { FileAttachment } from '@/lib/utils/fileHelpers';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { selectIsAuthenticated } from '@/redux/selectors';
import { useStore } from 'react-redux';
import {
  appendMessage,
  clearConversationMessages,
  removeMessage,
  setLastReadyConversationSnapshot,
  updateMessage,
} from '@/redux/slices/conversationSlice';
import {
  advanceTypewriter,
  appendTextDelta,
  appendThinkingDelta,
  completeThinkingPhase,
  endStream,
  selectFullStreamContentBlocks,
  setStreamStatus,
  startStream,
} from '@/redux/slices/streamSlice';
import type { StreamState } from '@/redux/slices/streamSlice';
import { fetchStreamStatus } from '@/lib/api/streamStatus';
import { reconnectStream, stopStream, type StreamCallbacks } from '@/lib/api/chat';
import { runResumableStream } from '@/lib/api/resumableStream';
import { useConversation } from '@/hooks/useConversation';
import { useContinueAgentRun } from '@/hooks/useContinueAgentRun';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useSuggestedQuestions } from '@/hooks/useSuggestedQuestions';
import { useSuggestedQuestionContinuation } from '@/hooks/useSuggestedQuestionContinuation';
import { useTransientCompletionState } from '@/hooks/useTransientCompletionState';
import { useConversationFiles } from '@/hooks/useConversationFiles';
import { createAgentStreamEventHandlers } from '@/lib/agent/streamEventHandlers';
import { consumeConversationFilesPanelOpen } from '@/lib/chat/filesPanelHandoff';
import {
  recoverReasoningOnlyFinalBlocks,
  shouldRecoverReasoningOnlyFinalBlocks,
} from '@/lib/chat/contentBlocks';
import { shouldAutoFetchSuggestedQuestions } from '@/lib/chat/suggestedQuestionTiming';
import { CHAT_NEW_PATH } from '@/lib/routes/chatRoutes';
import { deleteFile, type FileInfo } from '@/lib/api/files';

const CHAT_EMPTY_STATE = {
  title: '这个会话还没有消息',
  description: '发送第一条消息，继续这段会话。',
};

const EMPTY_CONVERSATION_ATTACHMENTS: ConversationComposerAttachment[] = [];
const STREAM_STATUS_MAX_ATTEMPTS = 3;
const STREAM_STATUS_RETRY_BASE_DELAY_MS = 50;

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}

function isRecoverableStreamStatusError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { recoverable?: boolean; code?: string; statusCode?: number };
  return candidate.recoverable === true ||
    candidate.code === 'redis_read_failed' ||
    (typeof candidate.statusCode === 'number' && candidate.statusCode >= 500);
}

function waitForStreamStatusRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

interface ConversationAttachmentState {
  chatId: string;
  attachments: ConversationComposerAttachment[];
}

interface PendingAutoAttachState {
  chatId: string;
  fileIds: string[];
}

function uploadResultToConversationAttachment(file: ChatUploadCompleteFile): ConversationComposerAttachment | null {
  if (file.status !== 'processed') {
    return null;
  }

  return {
    source: 'conversation',
    fileId: file.fileId,
    filename: file.filename,
    mimetype: file.mimetype || 'application/octet-stream',
    status: 'processed',
    thumbnailUrl: file.thumbnailUrl ?? null,
    removeBehavior: 'delete',
  };
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const store = useStore();
  const chatId = params?.chatId as string;
  const latestChatIdRef = useRef(chatId);
  latestChatIdRef.current = chatId;
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [filesPanelConversationId, setFilesPanelConversationId] = useState<string | null>(null);
  const filesPanelOpen = filesPanelConversationId === chatId;
  const [conversationAttachmentState, setConversationAttachmentState] = useState<ConversationAttachmentState>({
    chatId,
    attachments: [],
  });
  const [pendingAutoAttachState, setPendingAutoAttachState] = useState<PendingAutoAttachState>({
    chatId,
    fileIds: [],
  });
  const chatInputRef = useRef<HTMLDivElement>(null);
  const reconnectControllerRef = useRef<AbortController | null>(null);
  const recoveryStopPendingRef = useRef<{
    controller: AbortController;
    bufferedActions: Array<() => void>;
    streamTerminated: boolean;
  } | null>(null);
  const fetchQuestionsRef = useRef<((force?: boolean) => Promise<void>) | undefined>(undefined);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const authSessionKey = useAppSelector(
    (state) => state.auth.user?.id ?? state.auth.token ?? null,
  );
  const { conversation, hydrationView, hydrationError, retryHydration } = useConversation(chatId);
  const { sendMessage, stopStreaming, retryMessage } = useSendMessage();
  const { continueAgentRun, stopContinueAgentRun } = useContinueAgentRun();
  const {
    suggestedQuestions,
    isLoadingQuestions,
    fetchQuestions,
    clearQuestions,
  } = useSuggestedQuestions(chatId);
  const {
    files: conversationFiles,
    isLoading: conversationFilesLoading,
    error: conversationFilesError,
    refresh: refreshConversationFiles,
    removeFile: removeConversationFile,
  } = useConversationFiles(chatId, {
    enabled: isAuthenticated,
    sessionKey: authSessionKey,
  });
  fetchQuestionsRef.current = fetchQuestions;
  const conversationError = useAppSelector((state) => state.conversation.globalError);
  const isStreaming = useAppSelector((state) => state.stream.isStreaming);
  const lastReadyConversationSnapshot = useAppSelector(
    (state) => state.conversation.lastReadyConversationSnapshot
  );
  const streamConversationId = useAppSelector((state) => state.stream.conversationId);
  const conversationMessages = conversation?.messages;

  useEffect(() => {
    clearQuestions();
  }, [chatId, clearQuestions]);

  useEffect(() => {
    setFilesPanelConversationId(consumeConversationFilesPanelOpen(chatId) ? chatId : null);
    setConversationAttachmentState((current) => {
      if (current.chatId === chatId && current.attachments.length === 0) {
        return current;
      }
      return { chatId, attachments: [] };
    });
    setPendingAutoAttachState((current) => {
      if (current.chatId === chatId && current.fileIds.length === 0) {
        return current;
      }
      return { chatId, fileIds: [] };
    });
  }, [chatId]);

  useEffect(() => {
    if (hydrationView !== 'ready' || !conversationMessages) {
      return;
    }

    dispatch(setLastReadyConversationSnapshot({
      chatId,
      messages: [...conversationMessages],
    }));
  }, [chatId, conversationMessages, dispatch, hydrationView]);

  // 页面 mount / hydration 完成后检查是否有未完成的流，并在可恢复中断时有限重连。
  const hydrationDone = hydrationView === 'ready';
  const reconnectAttemptedRef = useRef(false);
  // chatId 变化时重置
  useEffect(() => { reconnectAttemptedRef.current = false; }, [chatId]);
  useEffect(() => {
    if (!chatId || !isAuthenticated || !hydrationDone || isStreaming) return;
    // 每个 chatId 只尝试一次重连，防止 stop 后重复触发
    if (reconnectAttemptedRef.current) return;
    reconnectAttemptedRef.current = true;

    let cancelled = false;
    const controller = new AbortController();
    reconnectControllerRef.current?.abort();
    reconnectControllerRef.current = controller;
    const checkAndReconnect = async () => {
      try {
        // 直接查后端流状态，由后端 meta 决定是否重连
        // 用户点停止 → 后端 cancel_stream 设 meta=cancelled → 这里不会返回 streaming
        // 用户切换对话再切回来 → 后台任务仍在跑 → meta=streaming → 自动重连
        let status: Awaited<ReturnType<typeof fetchStreamStatus>> | null = null;
        for (let attempt = 1; attempt <= STREAM_STATUS_MAX_ATTEMPTS; attempt += 1) {
          try {
            status = await fetchStreamStatus(chatId, controller.signal);
            break;
          } catch (error) {
            if (isAbortError(error) || controller.signal.aborted || cancelled) return;
            if (!isRecoverableStreamStatusError(error) || attempt === STREAM_STATUS_MAX_ATTEMPTS) {
              throw error;
            }
            await waitForStreamStatusRetry(STREAM_STATUS_RETRY_BASE_DELAY_MS * attempt, controller.signal);
          }
        }
        if (cancelled || !status || status.status !== 'streaming') return;

        const messageId = status.message_id || '';

        // 有进行中的流 → 建立 SSE 重连，从头读取
        dispatch(setStreamStatus('reconnecting'));

        // 确保有 assistant 消息占位
        const conv = conversation;
        const existingAssistant = conv?.messages?.find((m) => m.role === 'assistant' && m.id === messageId);
        const continuationStaticBlocks = status.stream_mode === 'continuation'
          ? existingAssistant?.content
          : undefined;
        const insertedPlaceholder = !existingAssistant && Boolean(messageId);
        if (insertedPlaceholder) {
          dispatch(appendMessage({
            conversationId: chatId,
            message: { id: messageId, role: 'assistant', content: [], timestamp: Date.now() },
          }));
        }

        // 启动流式状态
        dispatch(startStream({
          conversationId: chatId,
          messageId,
          ...(continuationStaticBlocks ? { staticBlocks: continuationStaticBlocks } : {}),
        }));

        let reachedTerminalState = false;
        let failureFinalized = false;
        const dispatchOrBufferRecoveryAction = (action: () => void) => {
          const pendingStop = recoveryStopPendingRef.current;
          if (pendingStop?.controller === controller) {
            pendingStop.bufferedActions.push(action);
            return;
          }
          action();
        };
        const flushBufferedRecoveryActions = () => {
          const pendingStop = recoveryStopPendingRef.current;
          if (pendingStop?.controller !== controller) return;
          recoveryStopPendingRef.current = null;
          pendingStop.bufferedActions.forEach((action) => action());
        };
        const finalizeRecoveryFailure = () => {
          if (cancelled || failureFinalized) return;
          const pendingStop = recoveryStopPendingRef.current;
          if (pendingStop?.controller === controller) {
            pendingStop.streamTerminated = true;
            reachedTerminalState = true;
            return;
          }
          flushBufferedRecoveryActions();
          failureFinalized = true;
          const streamState = (store.getState() as { stream: StreamState }).stream;
          const partialBlocks = selectFullStreamContentBlocks(streamState);
          if (messageId && partialBlocks.length > 0) {
            dispatch(updateMessage({
              conversationId: chatId,
              messageId,
              patch: { content: partialBlocks },
            }));
          } else if (insertedPlaceholder && messageId) {
            dispatch(removeMessage({ conversationId: chatId, messageId }));
          }
          dispatch(endStream());
          dispatch(setStreamStatus('error'));
        };
        const callbacks: StreamCallbacks = {
          onReady: () => {},
          onAnswering: (payload) => {
            if (cancelled) return;
            dispatchOrBufferRecoveryAction(() => {
              const streamState = (store.getState() as { stream: StreamState }).stream;
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
            });
          },
          onReasoning: (payload) => {
            if (cancelled) return;
            dispatchOrBufferRecoveryAction(() => {
              dispatch(appendThinkingDelta({
                blockId: payload.block_id,
                delta: payload.delta,
                runId: payload.run_id,
                stepId: payload.step_id,
              }));
            });
          },
          ...createAgentStreamEventHandlers({
            dispatch,
            isActive: () => !cancelled,
            resolveMessageId: () => messageId,
            resolveConversationId: () => chatId,
          }),
          onDone: () => {
            if (cancelled) return;
            flushBufferedRecoveryActions();
            reachedTerminalState = true;
            const streamState = (store.getState() as { stream: StreamState }).stream;
            const rawBlocks = selectFullStreamContentBlocks(streamState);
            const blocks = shouldRecoverReasoningOnlyFinalBlocks({
              runStatus: streamState.currentRun?.status,
              messageMatches: true,
            })
              ? recoverReasoningOnlyFinalBlocks(rawBlocks)
              : rawBlocks;
            if (messageId && blocks.length > 0) {
              dispatch(updateMessage({
                conversationId: chatId,
                messageId,
                patch: { content: blocks },
              }));
            }
            dispatch(endStream());
            dispatch(setStreamStatus('completed'));
            retryHydration();
          },
          onError: () => {
            if (cancelled) return;
            const pendingStop = recoveryStopPendingRef.current;
            if (pendingStop?.controller === controller) {
              pendingStop.streamTerminated = true;
              reachedTerminalState = true;
              return;
            }
            flushBufferedRecoveryActions();
            reachedTerminalState = true;
            finalizeRecoveryFailure();
          },
        };

        try {
          await runResumableStream({
            callbacks,
            signal: controller.signal,
            retryDelaysMs: [250, 750],
            openInitial: async (wrappedCallbacks, signal) => {
              await reconnectStream(chatId, '0', wrappedCallbacks, signal);
            },
            openReconnect: (lastEntryId, wrappedCallbacks, signal) => (
              reconnectStream(chatId, lastEntryId, wrappedCallbacks, signal)
            ),
            onPhaseChange: (phase) => dispatch(setStreamStatus(phase)),
          });
        } catch (error) {
          if (isAbortError(error) || controller.signal.aborted || cancelled) return;
          finalizeRecoveryFailure();
          return;
        }

        if (!reachedTerminalState && !cancelled) {
          finalizeRecoveryFailure();
        }
      } catch (error) {
        if (isAbortError(error)) return;
        if (!cancelled) {
          dispatch(endStream());
          dispatch(setStreamStatus('error'));
        }
      } finally {
        if (reconnectControllerRef.current === controller) {
          reconnectControllerRef.current = null;
        }
      }
    };

    checkAndReconnect();
    return () => {
      cancelled = true;
      if (recoveryStopPendingRef.current?.controller === controller) {
        recoveryStopPendingRef.current = null;
      }
      controller.abort();
      if (reconnectControllerRef.current === controller) {
        reconnectControllerRef.current = null;
      }
      // 切换对话时清理流状态，否则 isStreaming 残留为 true 阻止重连
      dispatch(endStream());
    };
  }, [chatId, isAuthenticated, hydrationDone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chatId || !conversation || isStreaming || isLoadingQuestions || suggestedQuestions.length > 0) {
      return;
    }

    if (!shouldAutoFetchSuggestedQuestions(conversation.messages)) {
      return;
    }

    void fetchQuestions();
  }, [chatId, conversation, fetchQuestions, isLoadingQuestions, isStreaming, suggestedQuestions.length]);

  const showCompletionState = useTransientCompletionState({
    isStreaming,
    isLoadingQuestions,
    messages: conversation?.messages || lastReadyConversationSnapshot?.messages || [],
  });

  const handleSendMessage = useCallback((content: string, attachments?: FileAttachment[]) => {
    clearQuestions();
    if (attachments && attachments.length > 0) {
      setFilesPanelConversationId(chatId);
    }
    return sendMessage(
      content,
      {
        conversationId: chatId,
        onStreamEnd: (conversationId) => {
          if (attachments && attachments.length > 0) {
            void refreshConversationFiles(conversationId);
          }
          if (conversationId === latestChatIdRef.current) {
            // 用 ref 避免闭包过期（长时间 agent 流结束后 hook 可能已切到新会话）
            fetchQuestionsRef.current?.(true);
            if (!attachments || attachments.length === 0) {
              void refreshConversationFiles(conversationId);
            }
          }
        },
      },
      attachments
    );
  }, [chatId, clearQuestions, refreshConversationFiles, sendMessage]);

  const handleSelectQuestion = useSuggestedQuestionContinuation({
    canContinue: Boolean(chatId),
    clearQuestions,
    sendMessage: handleSendMessage,
    scrollTargetRef: chatInputRef,
  });

  const handleRefreshQuestions = useCallback(() => {
    if (!chatId) return;
    fetchQuestions(true);
  }, [chatId, fetchQuestions]);

  const handleRetry = useCallback(
    (messageId: string) => {
      if (!chatId) return;
      void retryMessage(messageId, chatId);
    },
    [chatId, retryMessage]
  );

  const handleContinueAgentRun = useCallback((messageId: string, previousRunId?: string) => {
    if (!chatId || isStreaming) return;
    void continueAgentRun({
      conversationId: chatId,
      assistantMessageId: messageId,
      previousRunId,
    });
  }, [chatId, continueAgentRun, isStreaming]);

  const handleStopStreaming = useCallback(async () => {
    const recoveryController = reconnectControllerRef.current;
    if (recoveryController) {
      if (recoveryStopPendingRef.current?.controller === recoveryController) {
        return;
      }
      const stopBoundary = {
        controller: recoveryController,
        bufferedActions: [] as Array<() => void>,
        streamTerminated: false,
      };
      recoveryStopPendingRef.current = stopBoundary;
      const handleRecoveryStopNotApplied = () => {
        if (recoveryStopPendingRef.current !== stopBoundary) return;
        recoveryStopPendingRef.current = null;
        if (
          reconnectControllerRef.current === recoveryController &&
          !recoveryController.signal.aborted &&
          !stopBoundary.streamTerminated
        ) {
          stopBoundary.bufferedActions.forEach((action) => action());
          return;
        }
        dispatch(endStream());
        dispatch(setStreamStatus('error'));
      };
      const streamState = (store.getState() as { stream: StreamState }).stream;
      const partialBlocks = selectFullStreamContentBlocks(streamState);
      if (streamState.messageId && partialBlocks.length > 0) {
        dispatch(updateMessage({
          conversationId: chatId,
          messageId: streamState.messageId,
          patch: { content: partialBlocks },
        }));
      }
      try {
        const cancelled = await stopStream(
          chatId,
          streamState.messageId ?? undefined,
          undefined,
          partialBlocks,
        );
        if (!cancelled) {
          handleRecoveryStopNotApplied();
          return;
        }
        if (recoveryStopPendingRef.current !== stopBoundary) {
          return;
        }
        recoveryStopPendingRef.current = null;
        recoveryController.abort();
        if (reconnectControllerRef.current === recoveryController) {
          reconnectControllerRef.current = null;
        }
        dispatch(endStream());
        retryHydration();
      } catch (error) {
        console.warn('[chat] 停止恢复流并持久化部分内容失败', error);
        handleRecoveryStopNotApplied();
      }
      return;
    }
    if (await stopContinueAgentRun()) {
      return;
    }
    await stopStreaming();
  }, [chatId, dispatch, retryHydration, stopContinueAgentRun, stopStreaming, store]);

  const handleClearChat = () => {
    if (!chatId) return;
    setConfirmDialogOpen(true);
  };

  const confirmClearChat = useCallback(() => {
    dispatch(clearConversationMessages(chatId));
  }, [chatId, dispatch]);

  const conversationAttachments = conversationAttachmentState.chatId === chatId
    ? conversationAttachmentState.attachments
    : EMPTY_CONVERSATION_ATTACHMENTS;
  const shouldShowFilesPanelButton =
    filesPanelOpen ||
    conversationFiles.length > 0 ||
    conversationAttachments.length > 0 ||
    Boolean(conversationFilesError);

  const addConversationAttachment = useCallback((attachment: ConversationComposerAttachment) => {
    setConversationAttachmentState((currentState) => {
      const currentAttachments = currentState.chatId === chatId ? currentState.attachments : [];
      if (currentAttachments.some((item) => item.fileId === attachment.fileId)) {
        return currentState.chatId === chatId ? currentState : { chatId, attachments: currentAttachments };
      }
      return { chatId, attachments: [...currentAttachments, attachment] };
    });
  }, [chatId]);

  const handleAddConversationFile = useCallback((file: FileInfo) => {
    const attachment = tryConversationFileToComposerAttachment(file);
    if (!attachment) {
      return;
    }

    addConversationAttachment(attachment);
  }, [addConversationAttachment]);

  const handleRemoveConversationAttachment = useCallback((fileId: string) => {
    const targetAttachment = conversationAttachments.find((item) => item.fileId === fileId);
    setConversationAttachmentState((currentState) => {
      if (currentState.chatId !== chatId) {
        return currentState;
      }
      const nextAttachments = currentState.attachments.filter((item) => item.fileId !== fileId);
      return nextAttachments.length === currentState.attachments.length
        ? currentState
        : { chatId, attachments: nextAttachments };
    });

    if (targetAttachment?.removeBehavior === 'delete') {
      void deleteFile(fileId)
        .then(() => {
          removeConversationFile(fileId, chatId);
          setPendingAutoAttachState((currentState) => {
            if (currentState.chatId !== chatId || !currentState.fileIds.includes(fileId)) {
              return currentState;
            }
            return {
              chatId,
              fileIds: currentState.fileIds.filter((item) => item !== fileId),
            };
          });
        })
        .catch((error) => {
          console.error('删除会话资料失败:', error);
          void refreshConversationFiles(chatId);
        });
    }
  }, [chatId, conversationAttachments, refreshConversationFiles, removeConversationFile]);

  const handleClearConversationAttachments = useCallback(() => {
    setConversationAttachmentState((currentState) => {
      if (currentState.chatId === chatId && currentState.attachments.length === 0) {
        return currentState;
      }
      return { chatId, attachments: [] };
    });
  }, [chatId]);

  const handleDeleteConversationFile = useCallback((fileId: string) => {
    void deleteFile(fileId)
      .then(() => {
        removeConversationFile(fileId, chatId);
        setConversationAttachmentState((currentState) => {
          if (currentState.chatId !== chatId) {
            return currentState;
          }
          return {
            chatId,
            attachments: currentState.attachments.filter((item) => item.fileId !== fileId),
          };
        });
        setPendingAutoAttachState((currentState) => {
          if (currentState.chatId !== chatId || !currentState.fileIds.includes(fileId)) {
            return currentState;
          }
          return {
            chatId,
            fileIds: currentState.fileIds.filter((item) => item !== fileId),
          };
        });
      })
      .catch((error) => {
        console.error('删除会话资料失败:', error);
        void refreshConversationFiles(chatId);
      });
  }, [chatId, refreshConversationFiles, removeConversationFile]);

  const handleUploadComplete = useCallback((files: ChatUploadCompleteFile[] = [], uploadChatId = chatId) => {
    void refreshConversationFiles(uploadChatId);

    if (uploadChatId !== chatId) {
      return;
    }

    const uploadedFiles = Array.isArray(files) ? files : [];
    const pendingFileIds: string[] = [];
    const completedFileIds: string[] = [];
    uploadedFiles.forEach((file) => {
      const attachment = uploadResultToConversationAttachment(file);
      if (attachment) {
        addConversationAttachment(attachment);
        completedFileIds.push(file.fileId);
        return;
      }

      if (file.status === 'parsing' || file.status === 'uploading' || file.status === 'pending') {
        pendingFileIds.push(file.fileId);
        return;
      }

      completedFileIds.push(file.fileId);
    });

    if (pendingFileIds.length === 0 && completedFileIds.length === 0) {
      return;
    }

    setPendingAutoAttachState((current) => {
      const completedSet = new Set(completedFileIds);
      const currentFileIds = current.chatId === chatId
        ? current.fileIds.filter((fileId) => !completedSet.has(fileId))
        : [];
      const nextFileIds = [...currentFileIds];
      pendingFileIds.forEach((fileId) => {
        if (!nextFileIds.includes(fileId)) {
          nextFileIds.push(fileId);
        }
      });
      return { chatId, fileIds: nextFileIds };
    });
  }, [addConversationAttachment, chatId, refreshConversationFiles]);

  const pendingAutoAttachFileIds = useMemo(
    () => pendingAutoAttachState.chatId === chatId ? pendingAutoAttachState.fileIds : [],
    [chatId, pendingAutoAttachState]
  );

  useEffect(() => {
    if (pendingAutoAttachFileIds.length === 0) {
      return;
    }

    const remainingFileIds = new Set(pendingAutoAttachFileIds);
    conversationFiles.forEach((file) => {
      if (!remainingFileIds.has(file.id)) {
        return;
      }

      const attachment = tryConversationFileToComposerAttachment(file);
      if (!attachment) {
        if (file.status === 'error') {
          remainingFileIds.delete(file.id);
        }
        return;
      }

      addConversationAttachment({ ...attachment, removeBehavior: 'delete' });
      remainingFileIds.delete(file.id);
    });

    if (remainingFileIds.size === pendingAutoAttachFileIds.length) {
      return;
    }

    setPendingAutoAttachState({
      chatId,
      fileIds: Array.from(remainingFileIds),
    });
  }, [addConversationAttachment, chatId, conversationFiles, pendingAutoAttachFileIds]);

  const selectedConversationFileIds = useMemo(
    () => new Set(conversationAttachments.map((file) => file.fileId)),
    [conversationAttachments]
  );


  const lastReadyConversation = lastReadyConversationSnapshot;
  const shouldKeepPreviousContent =
    hydrationView === 'loading' &&
    lastReadyConversation?.chatId === chatId &&
    Boolean(lastReadyConversation && lastReadyConversation.messages.length > 0);
  const displayMessages = shouldKeepPreviousContent
    ? lastReadyConversation?.messages || []
    : conversation?.messages || [];
  const displayConversationId = shouldKeepPreviousContent
    ? lastReadyConversation?.chatId || null
    : chatId;
  const isHydratingWithoutContent = hydrationView === 'loading' && !shouldKeepPreviousContent;
  const isDisplayConversationStreaming =
    !isHydratingWithoutContent && isStreaming && streamConversationId === displayConversationId;

  if ((!conversation && !shouldKeepPreviousContent && !isHydratingWithoutContent) || hydrationView === 'error') {
    return (
      <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-red-500 text-2xl">⚠️</div>
            <p className="text-muted-foreground">{hydrationError || conversationError || '对话不存在或已被删除'}</p>
            <div className="flex items-center justify-center gap-3">
              {hydrationView === 'error' ? (
                <button
                  onClick={retryHydration}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  重试加载
                </button>
              ) : null}
              <button
                onClick={() => router.push(CHAT_NEW_PATH)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                返回首页
              </button>
            </div>
          </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative flex h-full min-h-0">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 pt-4" data-chat-scroll-container="true">
            <ChatMessageListLazy
              messages={isHydratingWithoutContent ? [] : displayMessages}
              conversationId={displayConversationId}
              isStreaming={isDisplayConversationStreaming}
              loadingState={isHydratingWithoutContent ? 'history-hydration' : undefined}
              onRetry={shouldKeepPreviousContent || isHydratingWithoutContent ? undefined : handleRetry}
              onContinueAgentRun={
                shouldKeepPreviousContent || isHydratingWithoutContent || isDisplayConversationStreaming
                  ? undefined
                  : handleContinueAgentRun
              }
              suggestedQuestions={shouldKeepPreviousContent || isHydratingWithoutContent ? [] : suggestedQuestions}
              isLoadingQuestions={shouldKeepPreviousContent || isHydratingWithoutContent ? false : isLoadingQuestions}
              onSelectQuestion={shouldKeepPreviousContent || isHydratingWithoutContent ? undefined : handleSelectQuestion}
              onRefreshQuestions={shouldKeepPreviousContent || isHydratingWithoutContent ? undefined : handleRefreshQuestions}
              completionStateVisible={shouldKeepPreviousContent || isHydratingWithoutContent ? false : showCompletionState}
              emptyState={CHAT_EMPTY_STATE}
            />
          </div>

          <div ref={chatInputRef} tabIndex={-1} className="flex-shrink-0 px-4 pb-4 pt-2">
            {shouldShowFilesPanelButton ? (
              <div className="mb-2 flex items-center justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5"
                  aria-label={filesPanelOpen ? '关闭会话资料' : '打开会话资料'}
                  aria-expanded={filesPanelOpen}
                  onClick={() => setFilesPanelConversationId((current) => current === chatId ? null : chatId)}
                >
                  <Files className="h-4 w-4" aria-hidden="true" />
                  资料
                </Button>
              </div>
            ) : null}
            <ChatInput
              onSendMessage={handleSendMessage}
              onClearMessage={handleClearChat}
              onStopStreaming={handleStopStreaming}
              onModelChange={clearQuestions}
              activeChatId={chatId}
              resetSignal={chatId}
              conversationAttachments={conversationAttachments}
              onRemoveConversationAttachment={handleRemoveConversationAttachment}
              onClearConversationAttachments={handleClearConversationAttachments}
              onUploadComplete={handleUploadComplete}
            />
          </div>
        </div>

        {filesPanelOpen ? (
          <div className="absolute inset-y-0 right-0 z-20 w-full max-w-sm bg-background shadow-lg md:relative md:z-auto md:w-80 md:shrink-0 md:shadow-none">
            <ConversationFilesPanel
              open={filesPanelOpen}
              files={conversationFiles}
              isLoading={conversationFilesLoading}
              error={conversationFilesError}
              selectedFileIds={selectedConversationFileIds}
              onClose={() => setFilesPanelConversationId(null)}
              onRefresh={refreshConversationFiles}
              onAddFile={handleAddConversationFile}
              onDeleteFile={handleDeleteConversationFile}
            />
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        isOpen={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        onConfirm={confirmClearChat}
        title="确认清空聊天"
        description="您确定要清空当前聊天内容吗？此操作不可恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        variant="destructive"
      />
    </>
  );
}
