"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FileAttachment } from "@/lib/utils/fileHelpers";
import { uploadFiles, deleteFile } from "@/lib/api/files";
import { startPollingFileStatus, stopPollingFileStatus } from "@/lib/api/FileStatusPoller";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { selectChatModel, selectIsAuthenticated } from "@/redux/selectors";
import { setReasoningEnabled } from "@/redux/slices/conversationSlice";
import {
  addFileId,
  clearFiles,
  makeSelectChatFileIds,
  removeFileId,
  updateFileStatus,
  type FileProcessingStatus,
} from "@/redux/slices/fileUploadSlice";
import { ArrowUp, Lightbulb, PaperclipIcon, Square } from "lucide-react";
import ImageViewer from "./ImageViewer";
import ModelSelector from "@/components/models/ModelSelector";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../ui/toast";
import { v4 as uuidv4 } from "uuid";
import { useRenderProbe } from "@/lib/debug/perfProbe";
import ComposerAttachmentList from "./ComposerAttachmentList";
import {
  isComposerAttachmentError,
  isComposerAttachmentProcessing,
  toFileAttachment,
  type ConversationComposerAttachment,
  type UploadComposerAttachment,
} from "./composerAttachments";

interface ChatInputProps {
  onSendMessage: (
    content: string,
    attachments?: FileAttachment[],
    pendingConversationId?: string
  ) => void;
  onClearMessage?: () => void;
  onStopStreaming?: () => void;
  onModelChange?: (modelId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  activeChatId?: string | null;
  resetSignal?: string | number | null;
  autoFocus?: boolean;
  focusSignal?: string | number | null;
  conversationAttachments?: ConversationComposerAttachment[];
  onRemoveConversationAttachment?: (fileId: string) => void;
  onClearConversationAttachments?: () => void;
  onUploadComplete?: () => void;
}

interface LocalFileWithStatus {
  file: File;
  previewUrl: string;
  id: string;
  fileId?: string;
  status: FileProcessingStatus;
  errorMessage?: string;
  thumbnailUrl?: string; // 后端返回的 presigned 缩略图 URL
}

const EMPTY_CONVERSATION_ATTACHMENTS: ConversationComposerAttachment[] = [];

function getFileIdentity(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatFileErrorMessage(errorMessage?: string): string {
  if (!errorMessage) {
    return "文件处理失败，请重试";
  }

  if (errorMessage.includes("超时")) {
    return "文件处理超时，请重新上传";
  }

  if (errorMessage.includes("not found")) {
    return "文件不存在或已失效，请重新上传";
  }

  if (errorMessage.includes("Could not validate credentials")) {
    return "登录状态已失效，请重新登录后上传";
  }

  return errorMessage.replace(/^文件上传失败[:：]?\s*/u, "").trim() || "文件处理失败，请重试";
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onStopStreaming,
  onModelChange,
  disabled = false,
  placeholder,
  activeChatId,
  resetSignal,
  autoFocus = false,
  focusSignal = null,
  conversationAttachments = EMPTY_CONVERSATION_ATTACHMENTS,
  onRemoveConversationAttachment,
  onClearConversationAttachments,
  onUploadComplete,
}) => {
  useRenderProbe('ChatInput');
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [localFiles, setLocalFiles] = useState<LocalFileWithStatus[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousResetSignalRef = useRef(resetSignal);
  const previousChatIdRef = useRef<string | null>(null);
  const uploadGenerationRef = useRef(0);

  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const processingFiles = useAppSelector((state) => state.fileUpload.processingFiles);
  const reasoningEnabled = useAppSelector((state) => state.conversation.reasoningEnabled);
  const isStreaming = useAppSelector((state) => state.stream.isStreaming);

  // 首页无 activeChatId 时，生成一个稳定的临时 UUID 用于文件上传关联
  const pendingChatIdRef = useRef<string>(uuidv4());
  const effectiveChatId = activeChatId;
  const chatId = effectiveChatId || pendingChatIdRef.current;
  const currentChatIdRef = useRef<string>(chatId);
  const selectedModel = useAppSelector((state) => selectChatModel(state, effectiveChatId));
  const isCurrentModelUnavailable = Boolean(selectedModel?.enabled === false);
  const isComposerBlocked = disabled || isCurrentModelUnavailable;

  const supportsReasoning = selectedModel?.capabilities?.deepThinking || false;
  const supportsFileUpload = selectedModel?.capabilities?.vision || false;

  useLayoutEffect(() => {
    currentChatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    const previousSignal = previousResetSignalRef.current;
    const previousChatId = previousChatIdRef.current ?? chatId;
    previousResetSignalRef.current = resetSignal;
    previousChatIdRef.current = chatId;

    if (resetSignal == null || previousSignal === resetSignal) {
      return;
    }

    uploadGenerationRef.current += 1;
    setMessage("");
    setIsDragOver(false);
    setViewingImageUrl(null);
    setLocalFiles((prev) => {
      prev.forEach((file) => {
        if (file.fileId) {
          stopPollingFileStatus(file.fileId);
        }
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
      return [];
    });
    dispatch(clearFiles(previousChatId));

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [chatId, dispatch, resetSignal]);

  useEffect(() => {
    if (!autoFocus || !textareaRef.current || isComposerBlocked) {
      return;
    }

    textareaRef.current.focus({ preventScroll: true });
  }, [autoFocus, focusSignal, isComposerBlocked]);

  const selectChatFileIds = useMemo(makeSelectChatFileIds, []);
  const fileIds = useAppSelector((state) => selectChatFileIds(state, chatId));
  const uploadAttachments = useMemo<UploadComposerAttachment[]>(
    () =>
      localFiles.map((file) => ({
        source: "upload",
        localId: file.id,
        file: file.file,
        fileId: file.fileId,
        status: file.status,
        previewUrl: file.previewUrl,
        thumbnailUrl: file.thumbnailUrl,
        errorMessage: file.errorMessage,
      })),
    [localFiles],
  );
  const composerAttachments = useMemo(
    () => [...uploadAttachments, ...conversationAttachments],
    [conversationAttachments, uploadAttachments],
  );
  const hasImageAttachments = useMemo(
    () => composerAttachments.some(isImageComposerAttachment),
    [composerAttachments],
  );
  const hasImagesButNoVision = hasImageAttachments && !supportsFileUpload;

  const promptLogin = (messageText: string) => {
    toast({
      message: messageText,
      type: "warning",
      duration: 3000,
    });

    if ((globalThis as any).triggerLoginDialog) {
      (globalThis as any).triggerLoginDialog();
    }
  };

  const ensureAuthenticated = (messageText: string) => {
    if (isAuthenticated) {
      return true;
    }

    promptLogin(messageText);
    return false;
  };

  const ensureCanUploadFiles = () => {
    if (!ensureAuthenticated("请先登录后再上传文件")) {
      return false;
    }

    if (!selectedModel) {
      toast({
        message: "请先选择可用模型再上传文件",
        type: "error",
        duration: 3000,
      });
      return false;
    }

    if (!supportsFileUpload) {
      toast({
        message: "当前模型不支持图片理解，请切换到支持读图的模型",
        type: "warning",
        duration: 3000,
      });
      return false;
    }

    return true;
  };

  const addPendingFiles = (selectedFiles: File[]) => {
    const pendingFiles = selectedFiles.map((file) => ({
      file,
      previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : "",
      id: uuidv4(),
      status: "pending" as FileProcessingStatus,
    }));

    setLocalFiles((prev) => [...prev, ...pendingFiles]);
    return pendingFiles;
  };

  const splitDedupedFiles = (selectedFiles: File[]) => {
    const existingIdentities = new Set(localFiles.map((item) => getFileIdentity(item.file)));
    const seenInBatch = new Set<string>();
    const acceptedFiles: File[] = [];
    let skippedCount = 0;

    selectedFiles.forEach((file) => {
      const identity = getFileIdentity(file);
      if (existingIdentities.has(identity) || seenInBatch.has(identity)) {
        skippedCount += 1;
        return;
      }

      seenInBatch.add(identity);
      acceptedFiles.push(file);
    });

    return { acceptedFiles, skippedCount };
  };

  const handleUploadFiles = async (filesToUpload: LocalFileWithStatus[]) => {
    if (filesToUpload.length === 0 || !selectedModel) {
      return;
    }

    const uploadGeneration = uploadGenerationRef.current;
    const uploadChatId = chatId;

    try {
      setLocalFiles((prev) =>
        prev.map((file) =>
          filesToUpload.some((pendingFile) => pendingFile.id === file.id)
            ? { ...file, status: "uploading", errorMessage: undefined }
            : file
        )
      );

      const uploadedFiles = await uploadFiles(
        selectedModel.provider,
        selectedModel.id,
        uploadChatId,
        filesToUpload.map((item) => item.file)
      );

      if (
        uploadGeneration !== uploadGenerationRef.current ||
        uploadChatId !== currentChatIdRef.current
      ) {
        uploadedFiles.forEach((uploaded) => {
          deleteFile(uploaded.file_id).catch((err) =>
            console.warn("清理已失效上传文件失败:", err)
          );
        });
        return;
      }

      setLocalFiles((prev) =>
        prev.map((file) => {
          const fileIndex = filesToUpload.findIndex((pendingFile) => pendingFile.id === file.id);
          if (fileIndex === -1 || !uploadedFiles[fileIndex]) {
            return file;
          }

          const uploaded = uploadedFiles[fileIndex];
          // 图片文件：后端直接返回 processed 状态（无需轮询）
          const isImage = file.file.type.startsWith('image/');
          return {
            ...file,
            fileId: uploaded.file_id,
            status: isImage ? "processed" : "parsing",
            thumbnailUrl: uploaded.thumbnail_url,
          };
        })
      );

      uploadedFiles.forEach((uploaded, index) => {
        const fileId = uploaded.file_id;
        const isImage = filesToUpload[index]?.file.type.startsWith('image/');
        dispatch(addFileId({ chatId: uploadChatId, fileId, fileIndex: index }));

        if (isImage) {
          // 图片上传后已处理完毕，直接标记 processed
          dispatch(updateFileStatus({ fileId, chatId: uploadChatId, status: "processed" }));
          return;
        }

        dispatch(updateFileStatus({ fileId, chatId: uploadChatId, status: "parsing" }));

        startPollingFileStatus(fileId, uploadChatId, dispatch, ({ success, errorMessage }) => {
          if (
            uploadGeneration !== uploadGenerationRef.current ||
            uploadChatId !== currentChatIdRef.current
          ) {
            return;
          }

          const readableError = success ? undefined : formatFileErrorMessage(errorMessage);

          setLocalFiles((prev) =>
            prev.map((file) =>
              file.fileId === fileId
                ? {
                    ...file,
                    status: success ? "processed" : "error",
                    errorMessage: readableError,
                  }
                : file
            )
          );

          toast({
            message: success ? "文件处理完成，可以发送消息" : readableError || "文件处理失败，请重试",
            type: success ? "success" : "error",
            duration: 3000,
          });
          onUploadComplete?.();
        });
      });

      onUploadComplete?.();
    } catch (error) {
      const errorMessage = formatFileErrorMessage((error as Error).message || "文件上传失败，请重试");

      setLocalFiles((prev) =>
        prev.map((file) =>
          filesToUpload.some((pendingFile) => pendingFile.id === file.id)
            ? { ...file, status: "error", errorMessage }
            : file
        )
      );

      toast({
        message: `文件上传失败: ${errorMessage}`,
        type: "error",
        duration: 3000,
      });
    }
  };

  const queueFilesForUpload = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0 || !ensureCanUploadFiles()) {
      return;
    }

    const { acceptedFiles, skippedCount } = splitDedupedFiles(selectedFiles);

    if (skippedCount > 0) {
      toast({
        message: skippedCount === 1 ? "已跳过重复文件" : `已跳过 ${skippedCount} 个重复文件`,
        type: "warning",
        duration: 3000,
      });
    }

    if (acceptedFiles.length === 0) {
      return;
    }

    const pendingFiles = addPendingFiles(acceptedFiles);
    await handleUploadFiles(pendingFiles);
  };

  const handleFileSelect = () => {
    if (!ensureCanUploadFiles()) {
      return;
    }

    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files ? Array.from(event.target.files) : [];

    if (selectedFiles.length > 0) {
      void queueFilesForUpload(selectedFiles);
    }

    event.target.value = "";
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (pastedFiles.length === 0) {
      return;
    }

    if (!ensureCanUploadFiles()) {
      event.preventDefault();
      return;
    }

    void queueFilesForUpload(pastedFiles);

    if (event.clipboardData.items.length === pastedFiles.length) {
      event.preventDefault();
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(event.dataTransfer.files);
    if (droppedFiles.length > 0) {
      void queueFilesForUpload(droppedFiles);
    }
  };

  const handleRemoveFile = (id: string) => {
    setLocalFiles((prev) => {
      const targetFile = prev.find((file) => file.id === id);
      if (targetFile?.fileId) {
        stopPollingFileStatus(targetFile.fileId);
        dispatch(removeFileId({ chatId, fileId: targetFile.fileId }));
        // 同步删除后端文件记录，释放对话文件数量配额
        deleteFile(targetFile.fileId).catch((err) =>
          console.warn("删除后端文件记录失败:", err)
        );
      }
      // 释放本地预览 URL，防止内存泄漏
      if (targetFile?.previewUrl) {
        URL.revokeObjectURL(targetFile.previewUrl);
      }

      return prev.filter((file) => file.id !== id);
    });
  };

  const handleRetryFile = async (id: string) => {
    const targetFile = localFiles.find((file) => file.id === id);
    if (!targetFile || !ensureCanUploadFiles()) {
      return;
    }

    if (targetFile.fileId) {
      stopPollingFileStatus(targetFile.fileId);
      dispatch(removeFileId({ chatId, fileId: targetFile.fileId }));
    }

    const retryFile: LocalFileWithStatus = {
      ...targetFile,
      fileId: undefined,
      status: "pending",
      errorMessage: undefined,
    };

    setLocalFiles((prev) =>
      prev.map((file) => (file.id === id ? retryFile : file))
    );

    await handleUploadFiles([retryFile]);
  };

  const handleSendMessage = () => {
    if ((!message.trim() && composerAttachments.length === 0) || isComposerBlocked) {
      return;
    }

    if (!ensureAuthenticated("请先登录后再发送消息")) {
      return;
    }

    if (hasProcessingFiles) {
      return;
    }

    if (hasImagesButNoVision) {
      toast({
        message: "当前模型不支持图片理解，请切换到支持读图的模型或移除图片资料",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    if (composerAttachments.some(isComposerAttachmentError)) {
      toast({
        message: "请先重试或移除失败文件",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    const attachments: FileAttachment[] = composerAttachments
      .map(toFileAttachment)
      .filter((attachment): attachment is FileAttachment => attachment !== null);

    if (attachments.length > 0) {
      // 首页新对话时，传递文件上传使用的 pendingChatId，确保后端对话 ID 一致
      const pendingId = !activeChatId ? pendingChatIdRef.current : undefined;
      onSendMessage(message, attachments, pendingId);

      localFiles.forEach((file) => {
        if (file.fileId) {
          stopPollingFileStatus(file.fileId);
        }
      });

      dispatch(clearFiles(chatId));
    } else {
      onSendMessage(message);
    }

    setMessage("");
    setLocalFiles([]);
    onClearConversationAttachments?.();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    const input = textareaRef.current;
    setTimeout(() => {
      input.disabled = isComposerBlocked;
      input.readOnly = false;
    }, 100);
  }, [isComposerBlocked, chatId]);

  useEffect(() => {
    if (!textareaRef.current) {
      return;
    }

    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  }, [message]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const hasProcessingFiles = useMemo(() => {
    if (
      uploadAttachments.some(
        (attachment) =>
          (attachment.status !== "error" && !attachment.fileId) ||
          isComposerAttachmentProcessing(attachment)
      )
    ) {
      return true;
    }

    return fileIds.some((fileId) => {
      const status = processingFiles[fileId];
      return status === "pending" || status === "uploading" || status === "parsing";
    });
  }, [fileIds, processingFiles, uploadAttachments]);

  const renderProcessingMessage = () => {
    const hasPendingFiles = uploadAttachments.some(
      (attachment) => attachment.status === "pending" || (attachment.status !== "error" && !attachment.fileId)
    );
    const hasUploadingFiles =
      uploadAttachments.some((attachment) => attachment.status === "uploading") ||
      fileIds.some((fileId) => processingFiles[fileId] === "uploading");
    const hasParsingFiles =
      uploadAttachments.some((attachment) => attachment.status === "parsing") ||
      fileIds.some((fileId) => processingFiles[fileId] === "parsing");

    if (hasPendingFiles) {
      return (
        <div className="flex items-center text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
          <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-500 rounded-full animate-spin mr-2"></div>
          文件等待上传，请稍候...
        </div>
      );
    }

    if (hasUploadingFiles) {
      return (
        <div className="flex items-center text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
          <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-500 rounded-full animate-spin mr-2"></div>
          文件正在上传，请稍候...
        </div>
      );
    }

    if (hasParsingFiles) {
      return (
        <div className="flex items-center text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md">
          <div className="w-3 h-3 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin mr-2"></div>
          AI正在处理文件，请等待处理完成后发送...
        </div>
      );
    }

    if (uploadAttachments.some(isComposerAttachmentError)) {
      return (
        <div className="flex items-center text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
          请先重试或移除失败文件后再发送消息
        </div>
      );
    }

    return null;
  };

  const canSend = (message.trim() || composerAttachments.length > 0) && !isComposerBlocked && !hasProcessingFiles && !hasImagesButNoVision;

  return (
    <div className="flex flex-col space-y-2">
      {/* 外层卡片容器（支持拖拽上传） */}
      <div
        role="group"
        aria-label="消息输入区"
        className={`relative rounded-xl border bg-background shadow-fdv2-xs focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0 transition-colors duration-fast ${
          isDragOver
            ? "border-primary border-dashed bg-primary/5"
            : "border-border"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <ComposerAttachmentList
          attachments={composerAttachments}
          onRemoveUploadAttachment={handleRemoveFile}
          onRemoveConversationAttachment={(fileId) => onRemoveConversationAttachment?.(fileId)}
          onRetryUploadAttachment={(localId) => void handleRetryFile(localId)}
          onViewImage={(url) => setViewingImageUrl(url)}
        />

        {/* 模型不支持 vision 但有图片时的内嵌提示 */}
        {hasImagesButNoVision && (
          <div className="mx-3 mt-1 text-xs text-amber-600 dark:text-amber-400">
            当前模型不支持图片理解，请切换到支持读图的模型或移除图片资料
          </div>
        )}

        {/* Textarea 区域 */}
        <Textarea
          id="chat-message-input"
          name="chatMessage"
          ref={textareaRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isCurrentModelUnavailable ? "当前会话模型不可用，请新建会话后继续" : (placeholder || "发消息给 Fusion AI（Enter 发送）")}
          disabled={isComposerBlocked}
          className="min-h-[44px] max-h-[168px] resize-none border-0 shadow-none focus-visible:ring-0 px-4 pt-3 pb-2 text-sm"
          rows={1}
        />

        <input
          id="chat-file-input"
          name="chatFiles"
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
        />

        {/* 工具栏 */}
        <div
          role="toolbar"
          aria-label="消息工具栏"
          className="flex items-center gap-1 border-t border-border/40 px-2 py-1.5"
        >
          {/* 左侧工具按钮组 */}
          <div className="flex items-center gap-1 flex-1">
            {/* 文件上传按钮 */}
            <Button
              onClick={handleFileSelect}
              disabled={isComposerBlocked || !supportsFileUpload}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              aria-label="上传文件"
              title="上传文件"
            >
              <PaperclipIcon className="h-4 w-4" />
            </Button>

            {/* 思考按钮 */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-8 px-2 gap-1.5 text-muted-foreground hover:text-foreground ${!supportsReasoning ? "opacity-50 cursor-not-allowed" : ""}`}
              onClick={() => {
                if (!supportsReasoning || isComposerBlocked) return;
                dispatch(setReasoningEnabled(!reasoningEnabled));
              }}
              disabled={!supportsReasoning || isComposerBlocked}
              aria-label="思考模式"
              aria-pressed={reasoningEnabled && supportsReasoning}
              title={supportsReasoning ? (reasoningEnabled ? "AI思考过程已开启" : "AI思考过程已关闭") : "当前模型不支持思考过程"}
            >
              <Lightbulb className={`h-4 w-4 ${reasoningEnabled && supportsReasoning ? "text-info" : ""}`} />
              <span className="text-xs">{reasoningEnabled && supportsReasoning ? "思考已开" : "思考"}</span>
            </Button>

          </div>

          {/* 右侧：模型选择器 + 发送按钮 */}
          <div className="flex items-center gap-1.5">
            <ModelSelector onChange={onModelChange || (() => {})} />
            <Button
              onClick={isStreaming && onStopStreaming ? onStopStreaming : handleSendMessage}
              disabled={!canSend && !(isStreaming && onStopStreaming)}
              variant={isStreaming && onStopStreaming ? "secondary" : "default"}
              size="sm"
              className="h-8 w-8 p-0 rounded-lg"
              aria-label={isStreaming && onStopStreaming ? "停止生成" : "发送消息"}
            >
              {isStreaming && onStopStreaming ? (
                <Square className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* 状态提示（卡片外部） */}
      {isCurrentModelUnavailable ? (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          当前会话绑定的模型已不可用。请新建会话后切换到可用模型再继续聊天。
        </div>
      ) : null}

      {hasProcessingFiles && renderProcessingMessage()}

      {/* 图片预览 Lightbox */}
      <ImageViewer
        imageUrl={viewingImageUrl}
        onClose={() => setViewingImageUrl(null)}
      />
    </div>
  );
};

function isImageComposerAttachment(attachment: UploadComposerAttachment | ConversationComposerAttachment): boolean {
  const mimeType = attachment.source === "conversation" ? attachment.mimetype : attachment.file.type;
  return mimeType.startsWith("image/");
}

export default ChatInput;
