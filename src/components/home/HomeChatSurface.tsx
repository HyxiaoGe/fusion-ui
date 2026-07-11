'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Files } from 'lucide-react';
import ChatInput, { type ChatUploadCompleteFile } from '@/components/chat/ChatInput';
import ConversationFilesPanel from '@/components/chat/ConversationFilesPanel';
import { ChatMessageListLazy } from '@/components/lazy/LazyComponents';
import {
  tryConversationFileToComposerAttachment,
  type ConversationComposerAttachment,
} from '@/components/chat/composerAttachments';
import { Button } from '@/components/ui/button';
import HomePage from '@/components/home/HomePage';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setSelectedModel } from '@/redux/slices/modelsSlice';
import { deleteFile, type FileInfo } from '@/lib/api/files';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useConversationFiles } from '@/hooks/useConversationFiles';
import { getFirstEnabledModelId, getPreferredModelId } from '@/lib/models/modelPreference';
import { CHAT_NEW_PATH, buildChatConversationPath, buildChatNewPath, isChatNewPath } from '@/lib/routes/chatRoutes';
import type { FileAttachment } from '@/lib/utils/fileHelpers';
import { markConversationFilesPanelOpen } from '@/lib/chat/filesPanelHandoff';
import { subscribeNewChatDraftReset } from '@/lib/chat/newChatDraftReset';
import { extractTextFromBlocks, type Message } from '@/types/conversation';

const EMPTY_CONVERSATION_ATTACHMENTS: ConversationComposerAttachment[] = [];
const NEW_CHAT_ATTACHMENT_SCOPE = 'new-chat';

function PendingConversationFallback({ messages }: { messages: Message[] }) {
  const userMessages = messages.filter((message) => message.role === 'user');

  return (
    <div
      role="status"
      aria-label="正在准备完整对话视图"
      className="flex min-h-full flex-col px-4 pb-[120px]"
    >
      <div className="flex-1" />
      {userMessages.map((message) => {
        const text = extractTextFromBlocks(message.content);
        const fileNames = message.content
          .filter((block) => block.type === 'file')
          .map((block) => block.filename);
        const preview = text || (fileNames.length > 0 ? `已附加：${fileNames.join('、')}` : '消息已发送');

        return (
          <div key={message.id} className="flex w-full justify-end gap-3 px-4 py-2">
            <div className="flex w-full flex-col items-end space-y-1">
              <div
                aria-label="用户消息内容"
                className="rounded-xl border border-border/60 bg-primary/10 px-4 py-2.5 text-foreground shadow-sm shadow-black/5 dark:border-border/50 dark:bg-primary/15 dark:shadow-black/20"
              >
                {preview}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
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

export default function HomeChatSurface() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const [inputKey, setInputKey] = useState(0);
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [filesConversationId, setFilesConversationId] = useState<string | null>(null);
  const [handoffConversationId, setHandoffConversationId] = useState<string | null>(null);
  const [conversationAttachmentState, setConversationAttachmentState] = useState<ConversationAttachmentState>({
    chatId: NEW_CHAT_ATTACHMENT_SCOPE,
    attachments: [],
  });
  const [pendingAutoAttachState, setPendingAutoAttachState] = useState<PendingAutoAttachState>({
    chatId: NEW_CHAT_ATTACHMENT_SCOPE,
    fileIds: [],
  });
  const appliedModelHintRef = useRef<string | null>(null);
  const ownsNewChatNavigationRef = useRef(true);
  const navigationGenerationRef = useRef(0);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const authSessionKey = useAppSelector(
    (state) => state.auth.user?.id ?? state.auth.token ?? null,
  );
  const models = useAppSelector((state) => state.models.models);
  const pendingConversationId = useAppSelector((state) => state.conversation.pendingConversationId);
  const displayConversationId = pendingConversationId ?? handoffConversationId;
  const displayConversation = useAppSelector((state) =>
    displayConversationId ? state.conversation.byId[displayConversationId] : undefined
  );
  const isDisplayConversationStreaming = useAppSelector((state) =>
    Boolean(
      displayConversationId &&
      state.stream.isStreaming &&
      state.stream.conversationId === displayConversationId
    )
  );
  const { sendMessage, stopStreaming } = useSendMessage();
  const {
    files: conversationFiles,
    isLoading: conversationFilesLoading,
    error: conversationFilesError,
    refresh: refreshConversationFiles,
    removeFile: removeConversationFile,
  } = useConversationFiles(filesConversationId, {
    enabled: isAuthenticated,
    sessionKey: authSessionKey,
  });
  const modelHint = searchParams?.get('model') ?? null;
  const attachmentScopeId = filesConversationId ?? NEW_CHAT_ATTACHMENT_SCOPE;
  const conversationAttachments = conversationAttachmentState.chatId === attachmentScopeId
    ? conversationAttachmentState.attachments
    : EMPTY_CONVERSATION_ATTACHMENTS;
  const shouldShowFilesPanelButton =
    filesPanelOpen ||
    conversationFiles.length > 0 ||
    conversationAttachments.length > 0 ||
    conversationFilesLoading ||
    Boolean(conversationFilesError);
  const shouldShowPendingConversation = Boolean(
    displayConversationId && displayConversation && displayConversation.messages.length > 0
  );

  useEffect(() => {
    ownsNewChatNavigationRef.current = true;
    return () => {
      ownsNewChatNavigationRef.current = false;
    };
  }, []);

  const resetNewChatDraft = useCallback(() => {
    navigationGenerationRef.current += 1;
    if (displayConversationId && isDisplayConversationStreaming) {
      void stopStreaming();
    }
    setInputKey((current) => current + 1);
    setHandoffConversationId(null);
    setFilesPanelOpen(false);
    setFilesConversationId(null);
    setConversationAttachmentState({ chatId: NEW_CHAT_ATTACHMENT_SCOPE, attachments: [] });
    setPendingAutoAttachState({ chatId: NEW_CHAT_ATTACHMENT_SCOPE, fileIds: [] });
  }, [displayConversationId, isDisplayConversationStreaming, stopStreaming]);

  useEffect(() => subscribeNewChatDraftReset(resetNewChatDraft), [resetNewChatDraft]);

  const handleStopPendingConversation = useCallback(() => {
    navigationGenerationRef.current += 1;
    setHandoffConversationId(null);
    return stopStreaming();
  }, [stopStreaming]);

  useEffect(() => {
    if (!modelHint || appliedModelHintRef.current === modelHint) {
      return;
    }

    if (models.length === 0) {
      return;
    }

    const preferredModelId = getPreferredModelId(models, modelHint);
    if (preferredModelId === modelHint) {
      dispatch(setSelectedModel(modelHint));
    }

    appliedModelHintRef.current = modelHint;
    router.replace(CHAT_NEW_PATH);
  }, [dispatch, modelHint, models, router]);

  const addConversationAttachment = useCallback((targetChatId: string, attachment: ConversationComposerAttachment) => {
    setConversationAttachmentState((currentState) => {
      const currentAttachments = currentState.chatId === targetChatId ? currentState.attachments : [];
      if (currentAttachments.some((item) => item.fileId === attachment.fileId)) {
        return currentState.chatId === targetChatId ? currentState : { chatId: targetChatId, attachments: currentAttachments };
      }
      return { chatId: targetChatId, attachments: [...currentAttachments, attachment] };
    });
  }, []);

  const handleAddConversationFile = useCallback((file: FileInfo) => {
    const attachment = tryConversationFileToComposerAttachment(file);
    if (!attachment) {
      return;
    }

    addConversationAttachment(attachmentScopeId, attachment);
  }, [addConversationAttachment, attachmentScopeId]);

  const detachConversationAttachment = useCallback((fileId: string) => {
    setConversationAttachmentState((currentState) => {
      if (currentState.chatId !== attachmentScopeId) {
        return currentState;
      }
      const nextAttachments = currentState.attachments.filter((item) => item.fileId !== fileId);
      return nextAttachments.length === currentState.attachments.length
        ? currentState
        : { chatId: attachmentScopeId, attachments: nextAttachments };
    });
  }, [attachmentScopeId]);

  const handleRemoveConversationAttachment = useCallback((fileId: string) => {
    const targetAttachment = conversationAttachments.find((item) => item.fileId === fileId);
    detachConversationAttachment(fileId);

    if (targetAttachment?.removeBehavior === 'delete') {
      void deleteFile(fileId)
        .then(() => {
          removeConversationFile(fileId, attachmentScopeId);
          setPendingAutoAttachState((currentState) => {
            if (currentState.chatId !== attachmentScopeId || !currentState.fileIds.includes(fileId)) {
              return currentState;
            }
            return {
              chatId: attachmentScopeId,
              fileIds: currentState.fileIds.filter((item) => item !== fileId),
            };
          });
        })
        .catch((error) => {
          console.error('删除会话资料失败:', error);
          void refreshConversationFiles(attachmentScopeId);
        });
    }
  }, [
    attachmentScopeId,
    conversationAttachments,
    detachConversationAttachment,
    refreshConversationFiles,
    removeConversationFile,
  ]);

  const handleClearConversationAttachments = useCallback(() => {
    setConversationAttachmentState((currentState) => {
      if (currentState.chatId === attachmentScopeId && currentState.attachments.length === 0) {
        return currentState;
      }
      return { chatId: attachmentScopeId, attachments: [] };
    });
  }, [attachmentScopeId]);

  const handleDeleteConversationFile = useCallback((fileId: string) => {
    void deleteFile(fileId)
      .then(() => {
        removeConversationFile(fileId, attachmentScopeId);
        detachConversationAttachment(fileId);
        setPendingAutoAttachState((currentState) => {
          if (currentState.chatId !== attachmentScopeId || !currentState.fileIds.includes(fileId)) {
            return currentState;
          }
          return {
            chatId: attachmentScopeId,
            fileIds: currentState.fileIds.filter((item) => item !== fileId),
          };
        });
      })
      .catch((error) => {
        console.error('删除会话资料失败:', error);
        void refreshConversationFiles(attachmentScopeId);
      });
  }, [attachmentScopeId, detachConversationAttachment, refreshConversationFiles, removeConversationFile]);

  const handleUploadComplete = useCallback((files: ChatUploadCompleteFile[] = [], uploadChatId?: string) => {
    const targetChatId = uploadChatId || filesConversationId || NEW_CHAT_ATTACHMENT_SCOPE;
    if (uploadChatId && uploadChatId !== filesConversationId) {
      setFilesConversationId(uploadChatId);
    }

    if (targetChatId !== NEW_CHAT_ATTACHMENT_SCOPE) {
      void refreshConversationFiles(targetChatId);
    }

    const uploadedFiles = Array.isArray(files) ? files : [];
    const pendingFileIds: string[] = [];
    const completedFileIds: string[] = [];
    uploadedFiles.forEach((file) => {
      const attachment = uploadResultToConversationAttachment(file);
      if (attachment) {
        addConversationAttachment(targetChatId, attachment);
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
      const currentFileIds = current.chatId === targetChatId
        ? current.fileIds.filter((fileId) => !completedSet.has(fileId))
        : [];
      const nextFileIds = [...currentFileIds];
      pendingFileIds.forEach((fileId) => {
        if (!nextFileIds.includes(fileId)) {
          nextFileIds.push(fileId);
        }
      });
      return { chatId: targetChatId, fileIds: nextFileIds };
    });
  }, [addConversationAttachment, filesConversationId, refreshConversationFiles]);

  const pendingAutoAttachFileIds = pendingAutoAttachState.chatId === attachmentScopeId
    ? pendingAutoAttachState.fileIds
    : [];

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

      addConversationAttachment(attachmentScopeId, { ...attachment, removeBehavior: 'delete' });
      remainingFileIds.delete(file.id);
    });

    if (remainingFileIds.size === pendingAutoAttachFileIds.length) {
      return;
    }

    setPendingAutoAttachState({
      chatId: attachmentScopeId,
      fileIds: Array.from(remainingFileIds),
    });
  }, [addConversationAttachment, attachmentScopeId, conversationFiles, pendingAutoAttachFileIds]);

  const handleSendMessage = useCallback((
    content: string,
    attachments?: FileAttachment[],
    pendingConversationId?: string
  ) => {
    const navigationGeneration = navigationGenerationRef.current + 1;
    navigationGenerationRef.current = navigationGeneration;
    const shouldOpenFilesPanel = Boolean(attachments && attachments.length > 0);
    if (shouldOpenFilesPanel) {
      setFilesPanelOpen(true);
    }

    return sendMessage(
      content,
      {
        conversationId: pendingConversationId ?? null,
        isDraft: true,
        onDraftCreated: () => {
          if (navigationGenerationRef.current === navigationGeneration) {
            setHandoffConversationId(null);
          }
        },
        onMaterialized: (serverConversationId) => {
          if (
            !ownsNewChatNavigationRef.current ||
            navigationGenerationRef.current !== navigationGeneration
          ) {
            return;
          }
          setHandoffConversationId(serverConversationId);
          if (shouldOpenFilesPanel) {
            markConversationFilesPanelOpen(serverConversationId);
          }
          router.replace(buildChatConversationPath(serverConversationId));
          setInputKey((current) => current + 1);
          if (!shouldOpenFilesPanel) {
            setFilesPanelOpen(false);
          }
          setFilesConversationId(null);
          setConversationAttachmentState({ chatId: NEW_CHAT_ATTACHMENT_SCOPE, attachments: [] });
          setPendingAutoAttachState({ chatId: NEW_CHAT_ATTACHMENT_SCOPE, fileIds: [] });
        },
      },
      attachments
    );
  }, [router, sendMessage]);

  const handleNewChat = useCallback(() => {
    if (isChatNewPath(pathname)) {
      resetNewChatDraft();
      return;
    }

    const modelToUse = modelHint || getFirstEnabledModelId(models);
    setInputKey((current) => current + 1);
    router.push(buildChatNewPath(modelToUse));
  }, [modelHint, models, pathname, resetNewChatDraft, router]);

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-1 overflow-y-auto" data-chat-scroll-container="true">
        {shouldShowPendingConversation && displayConversationId && displayConversation ? (
          <div className="h-full px-4 pt-4" data-testid="pending-conversation-surface">
            <ChatMessageListLazy
              fallback={<PendingConversationFallback messages={displayConversation.messages} />}
              messages={displayConversation.messages}
              conversationId={displayConversationId}
              isStreaming={isDisplayConversationStreaming}
            />
          </div>
        ) : (
          <HomePage onSendMessage={handleSendMessage} onNewChat={handleNewChat} />
        )}
      </div>
      <div className="flex-shrink-0 p-4">
        {shouldShowFilesPanelButton ? (
          <div className="mb-2 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              aria-label={filesPanelOpen ? '关闭会话资料' : '打开会话资料'}
              aria-expanded={filesPanelOpen}
              onClick={() => setFilesPanelOpen((open) => !open)}
            >
              <Files className="h-4 w-4" aria-hidden="true" />
              资料
            </Button>
          </div>
        ) : null}
        <ChatInput
          key={inputKey}
          onSendMessage={handleSendMessage}
          onStopStreaming={shouldShowPendingConversation ? handleStopPendingConversation : undefined}
          activeChatId={shouldShowPendingConversation ? displayConversationId : null}
          autoFocus
          focusSignal={inputKey}
          conversationAttachments={conversationAttachments}
          onRemoveConversationAttachment={handleRemoveConversationAttachment}
          onClearConversationAttachments={handleClearConversationAttachments}
          onUploadComplete={handleUploadComplete}
        />
      </div>
      {filesPanelOpen ? (
        <div className="absolute inset-y-0 right-0 z-20 w-full max-w-sm bg-background shadow-lg md:w-80">
          <ConversationFilesPanel
            open={filesPanelOpen}
            files={conversationFiles}
            isLoading={conversationFilesLoading}
            error={conversationFilesError}
            selectedFileIds={new Set(conversationAttachments.map((file) => file.fileId))}
            onClose={() => setFilesPanelOpen(false)}
            onRefresh={refreshConversationFiles}
            onAddFile={handleAddConversationFile}
            onDeleteFile={handleDeleteConversationFile}
          />
        </div>
      ) : null}
    </div>
  );
}
