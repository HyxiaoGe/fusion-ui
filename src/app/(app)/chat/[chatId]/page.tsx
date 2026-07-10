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
import { reconnectStream } from '@/lib/api/chat';
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
  const fetchQuestionsRef = useRef<((force?: boolean) => Promise<void>) | undefined>(undefined);
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
  } = useConversationFiles(chatId);
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

  // 页面 mount / hydration 完成后检查是否有未完成的流 → 断线重连
  // TODO(遗漏1): 网络抖动自动重连需要独立实现，不能复用 checkAndReconnect，
  // 因为 reconnectAttemptedRef 在首次 mount 后已为 true，会阻止二次重连。
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
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
    const checkAndReconnect = async () => {
      try {
        // 直接查后端流状态，由后端 meta 决定是否重连
        // 用户点停止 → 后端 cancel_stream 设 meta=cancelled → 这里不会返回 streaming
        // 用户切换对话再切回来 → 后台任务仍在跑 → meta=streaming → 自动重连
        const status = await fetchStreamStatus(chatId, controller.signal);
        if (cancelled || status.status !== 'streaming') return;

        const messageId = status.message_id || '';

        // 页面刷新后前端没有任何已有内容，从头（"0"）读取全部 Stream 内容
        // last_entry_id 仅用于「SSE 连接中途断开后自动重连」的场景（未来实现）
        const reconnectFromId = '0';

        // 有进行中的流 → 建立 SSE 重连，从头读取
        dispatch(setStreamStatus('reconnecting'));

        // 确保有 assistant 消息占位
        const conv = conversation;
        const hasAssistant = conv?.messages?.some((m) => m.role === 'assistant' && m.id === messageId);
        if (!hasAssistant && messageId) {
          dispatch(appendMessage({
            conversationId: chatId,
            message: { id: messageId, role: 'assistant', content: [], timestamp: Date.now() },
          }));
        }

        // 启动流式状态
        dispatch(startStream({ conversationId: chatId, messageId }));

        // TODO: 遗漏3 — 重连 SSE 请求没有挂 abort controller，
        // stopStreaming 无法立即取消。后续加 signal 支持让 stop 能中断重连读取
        // 从 Redis Stream 读取（从头读取已有内容 + 实时新增内容）
        await reconnectStream(chatId, reconnectFromId, {
          onReady: () => {},
          onAnswering: (payload) => {
            if (cancelled) return;
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
            // 重连不需要打字机效果，立即推进显示长度
            dispatch(advanceTypewriter(payload.delta.length));
          },
          onReasoning: (payload) => {
            if (cancelled) return;
            dispatch(appendThinkingDelta({
              blockId: payload.block_id,
              delta: payload.delta,
              runId: payload.run_id,
              stepId: payload.step_id,
            }));
          },
          ...createAgentStreamEventHandlers({
            dispatch,
            isActive: () => !cancelled,
            // reconnect 路径：messageId 来自 stream-status，已是后端真实 ID。
            resolveMessageId: () => messageId,
          }),
          onDone: () => {
            if (cancelled) return;
            // 把 streamSlice 的内容写入 conversation 消息，防止 endStream 清空后内容丢失
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
            // 消息已落库，刷新 hydration 获取完整数据（含 usage 等）
            retryHydration();
          },
          onError: () => {
            if (cancelled) return;
            dispatch(endStream());
            dispatch(setStreamStatus('error'));
          },
        }, controller.signal);
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError') return;
        if (!cancelled) {
          dispatch(endStream());
        }
      }
    };

    checkAndReconnect();
    return () => {
      cancelled = true;
      controller.abort();
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
          if (conversationId === latestChatIdRef.current) {
            // 用 ref 避免闭包过期（长时间 agent 流结束后 hook 可能已切到新会话）
            fetchQuestionsRef.current?.(true);
            void refreshConversationFiles();
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
    if (await stopContinueAgentRun()) {
      return;
    }
    await stopStreaming();
  }, [stopContinueAgentRun, stopStreaming]);

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
          removeConversationFile(fileId);
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
          void refreshConversationFiles();
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
        removeConversationFile(fileId);
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
        void refreshConversationFiles();
      });
  }, [chatId, refreshConversationFiles, removeConversationFile]);

  const handleUploadComplete = useCallback((files: ChatUploadCompleteFile[] = [], uploadChatId = chatId) => {
    void refreshConversationFiles();

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
