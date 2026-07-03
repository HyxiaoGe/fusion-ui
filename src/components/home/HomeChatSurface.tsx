'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Files } from 'lucide-react';
import ChatInput, { type ChatUploadCompleteFile } from '@/components/chat/ChatInput';
import ConversationFilesPanel from '@/components/chat/ConversationFilesPanel';
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
import { buildChatConversationPath, buildChatNewPath, isChatNewPath } from '@/lib/routes/chatRoutes';
import type { FileAttachment } from '@/lib/utils/fileHelpers';

const EMPTY_CONVERSATION_ATTACHMENTS: ConversationComposerAttachment[] = [];
const NEW_CHAT_ATTACHMENT_SCOPE = 'new-chat';

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
  };
}

export default function HomeChatSurface() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const [inputKey, setInputKey] = useState(() => Date.now());
  const [filesPanelOpen, setFilesPanelOpen] = useState(false);
  const [filesConversationId, setFilesConversationId] = useState<string | null>(null);
  const [conversationAttachmentState, setConversationAttachmentState] = useState<ConversationAttachmentState>({
    chatId: NEW_CHAT_ATTACHMENT_SCOPE,
    attachments: [],
  });
  const [pendingAutoAttachState, setPendingAutoAttachState] = useState<PendingAutoAttachState>({
    chatId: NEW_CHAT_ATTACHMENT_SCOPE,
    fileIds: [],
  });
  const appliedModelHintRef = useRef<string | null>(null);
  const models = useAppSelector((state) => state.models.models);
  const { sendMessage } = useSendMessage();
  const {
    files: conversationFiles,
    isLoading: conversationFilesLoading,
    error: conversationFilesError,
    refresh: refreshConversationFiles,
    removeFile: removeConversationFile,
  } = useConversationFiles(filesConversationId);
  const modelHint = searchParams?.get('model') ?? null;
  const attachmentScopeId = filesConversationId ?? NEW_CHAT_ATTACHMENT_SCOPE;
  const conversationAttachments = conversationAttachmentState.chatId === attachmentScopeId
    ? conversationAttachmentState.attachments
    : EMPTY_CONVERSATION_ATTACHMENTS;

  useEffect(() => {
    if (!modelHint || appliedModelHintRef.current === modelHint) {
      return;
    }

    const preferredModelId = getPreferredModelId(models, modelHint);
    if (preferredModelId !== modelHint) {
      return;
    }

    appliedModelHintRef.current = modelHint;
    dispatch(setSelectedModel(modelHint));
  }, [dispatch, modelHint, models]);

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

  const handleRemoveConversationAttachment = useCallback((fileId: string) => {
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
        removeConversationFile(fileId);
        handleRemoveConversationAttachment(fileId);
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
        void refreshConversationFiles();
      });
  }, [attachmentScopeId, handleRemoveConversationAttachment, refreshConversationFiles, removeConversationFile]);

  const handleUploadComplete = useCallback((files: ChatUploadCompleteFile[] = [], uploadChatId?: string) => {
    const targetChatId = uploadChatId || filesConversationId || NEW_CHAT_ATTACHMENT_SCOPE;
    if (uploadChatId && uploadChatId !== filesConversationId) {
      setFilesConversationId(uploadChatId);
    }

    void refreshConversationFiles();
    setFilesPanelOpen(true);

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

      addConversationAttachment(attachmentScopeId, attachment);
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
    return sendMessage(
      content,
      {
        conversationId: pendingConversationId ?? null,
        isDraft: true,
        onDraftCreated: () => {},
        onMaterialized: (serverConversationId) => {
          router.replace(buildChatConversationPath(serverConversationId));
          setInputKey(Date.now());
          setFilesPanelOpen(false);
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
      setInputKey(Date.now());
      setFilesPanelOpen(false);
      setFilesConversationId(null);
      setConversationAttachmentState({ chatId: NEW_CHAT_ATTACHMENT_SCOPE, attachments: [] });
      setPendingAutoAttachState({ chatId: NEW_CHAT_ATTACHMENT_SCOPE, fileIds: [] });
      return;
    }

    const modelToUse = modelHint || getFirstEnabledModelId(models);
    setInputKey(Date.now());
    router.push(buildChatNewPath(modelToUse));
  }, [modelHint, models, pathname, router]);

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-1 overflow-y-auto">
        <HomePage onSendMessage={handleSendMessage} onNewChat={handleNewChat} />
      </div>
      <div className="flex-shrink-0 p-4">
        <div className="mb-2 flex items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            aria-label="打开会话资料"
            onClick={() => setFilesPanelOpen(true)}
          >
            <Files className="h-4 w-4" aria-hidden="true" />
            资料
          </Button>
        </div>
        <ChatInput
          key={inputKey}
          onSendMessage={handleSendMessage}
          activeChatId={null}
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
