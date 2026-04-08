"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileWithPreview, createFileWithPreview } from "@/lib/utils/fileHelpers";
import { uploadFiles } from "@/lib/api/files";
import { startPollingFileStatus, stopPollingFileStatus } from "@/lib/api/FileStatusPoller";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { setReasoningEnabled } from "@/redux/slices/conversationSlice";
import {
  addFileId,
  clearFiles,
  makeSelectChatFileIds,
  removeFileId,
  updateFileStatus,
  type FileProcessingStatus,
} from "@/redux/slices/fileUploadSlice";
import { ArrowUp, Lightbulb, PaperclipIcon, Square, X } from "lucide-react";
import ModelSelector from "@/components/models/ModelSelector";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../ui/toast";
import { v4 as uuidv4 } from "uuid";

interface ChatInputProps {
  onSendMessage: (
    content: string,
    files?: FileWithPreview[],
    fileIds?: string[]
  ) => void;
  onClearMessage?: () => void;
  onStopStreaming?: () => void;
  onModelChange?: (modelId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  activeChatId?: string | null;
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
  onClearMessage,
  onStopStreaming,
  onModelChange,
  disabled = false,
  placeholder,
  activeChatId,
}) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [localFiles, setLocalFiles] = useState<LocalFileWithStatus[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { models, selectedModelId } = useAppSelector((state) => state.models);
  const chats = useAppSelector((state) => state.conversation.byId);
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const processingFiles = useAppSelector((state) => state.fileUpload.processingFiles);
  const reasoningEnabled = useAppSelector((state) => state.conversation.reasoningEnabled);
  const isStreaming = useAppSelector((state) => state.stream.isStreaming);

  const effectiveChatId = activeChatId;
  const chatId = effectiveChatId || "default-chat";
  const activeChatModelId = effectiveChatId
    ? chats[effectiveChatId]?.model_id
    : undefined;
  const selectedModel = useMemo(
    () => models.find((model) => model.id === (activeChatModelId || selectedModelId)),
    [activeChatModelId, models, selectedModelId]
  );
  const isCurrentModelUnavailable = Boolean(selectedModel?.enabled === false);
  const isComposerBlocked = disabled || isCurrentModelUnavailable;

  const supportsReasoning = selectedModel?.capabilities?.deepThinking || false;
  const supportsFileUpload = selectedModel?.capabilities?.fileSupport || false;

  const selectChatFileIds = useMemo(makeSelectChatFileIds, []);
  const fileIds = useAppSelector((state) => selectChatFileIds(state, chatId));

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
        message: "当前选择的模型不支持文件上传功能",
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
        chatId,
        filesToUpload.map((item) => item.file)
      );

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
        dispatch(addFileId({ chatId, fileId, fileIndex: index }));

        if (isImage) {
          // 图片上传后已处理完毕，直接标记 processed
          dispatch(updateFileStatus({ fileId, chatId, status: "processed" }));
          return;
        }

        dispatch(updateFileStatus({ fileId, chatId, status: "parsing" }));

        startPollingFileStatus(fileId, chatId, dispatch, ({ success, errorMessage }) => {
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
        });
      });
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
    if ((!message.trim() && localFiles.length === 0) || isComposerBlocked) {
      return;
    }

    if (!ensureAuthenticated("请先登录后再发送消息")) {
      return;
    }

    if (localFiles.some((file) => file.status === "error")) {
      toast({
        message: "请先重试或移除失败文件",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    if (localFiles.length > 0) {
      const filesToSend: FileWithPreview[] = localFiles.map((item) => {
        const fileWithPreview = createFileWithPreview(item.file);
        fileWithPreview.preview = "";

        if (item.fileId) {
          (fileWithPreview as any).fileId = item.fileId;
        }

        return fileWithPreview;
      });

      const actualFileIds = localFiles
        .map((file) => file.fileId)
        .filter((fileId): fileId is string => Boolean(fileId));

      onSendMessage(message, filesToSend, actualFileIds);

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
      localFiles.some(
        (file) => !file.fileId || file.status === "pending" || file.status === "uploading" || file.status === "parsing"
      )
    ) {
      return true;
    }

    return fileIds.some((fileId) => {
      const status = processingFiles[fileId];
      return status === "pending" || status === "uploading" || status === "parsing";
    });
  }, [fileIds, localFiles, processingFiles]);

  const renderFileStatus = (file: LocalFileWithStatus) => {
    switch (file.status) {
      case "pending":
        return (
          <div className="flex items-center text-gray-500">
            <span className="mr-2 text-xs font-medium">等待上传</span>
            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        );
      case "uploading":
        return (
          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-blue-500">上传中</span>
              <span className="text-xs text-blue-500">...</span>
            </div>
            <div className="w-full bg-blue-100 dark:bg-blue-900/30 h-1 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full animate-pulse" style={{ width: "100%" }}></div>
            </div>
          </div>
        );
      case "parsing":
        return (
          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-amber-500">AI解析中</span>
              <span className="text-xs text-amber-500">...</span>
            </div>
            <div className="w-full bg-amber-100 dark:bg-amber-900/30 h-1 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full animate-pulse"
                style={{
                  width: "60%",
                }}
              ></div>
            </div>
          </div>
        );
      case "processed":
        return (
          <div className="space-y-1">
            <div className="flex items-center text-green-600 dark:text-green-500">
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs font-medium">文件已就绪</span>
            </div>
            <p className="text-xs text-muted-foreground">发送消息时会自动附带这个文件</p>
          </div>
        );
      case "error":
        return (
          <div className="space-y-2">
            <div className="flex items-center text-red-600 dark:text-red-500">
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs font-medium">{formatFileErrorMessage(file.errorMessage)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={() => void handleRetryFile(file.id)}
              >
                重试上传
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => handleRemoveFile(file.id)}
              >
                移除文件
              </Button>
            </div>
          </div>
        );
      default:
        return <span className="text-xs text-gray-500">未知状态</span>;
    }
  };

  const renderProcessingMessage = () => {
    const hasPendingFiles = localFiles.some((file) => file.status === "pending" || !file.fileId);
    const hasUploadingFiles =
      localFiles.some((file) => file.status === "uploading") ||
      fileIds.some((fileId) => processingFiles[fileId] === "uploading");
    const hasParsingFiles =
      localFiles.some((file) => file.status === "parsing") ||
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

    if (localFiles.some((file) => file.status === "error")) {
      return (
        <div className="flex items-center text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-md">
          请先重试或移除失败文件后再发送消息
        </div>
      );
    }

    return null;
  };

  const canSend = (message.trim() || localFiles.length > 0) && !isComposerBlocked && !hasProcessingFiles;

  return (
    <div className="flex flex-col space-y-2">
      {/* 外层卡片容器（支持拖拽上传） */}
      <div
        className={`relative rounded-2xl border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring transition-all ${
          isDragOver
            ? "border-primary border-dashed bg-primary/5"
            : "border-border"
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {/* 文件预览区（卡片内部顶部） */}
        {localFiles.length > 0 && (
          <div className="p-3 border-b border-border/50">
            <div className="flex flex-wrap gap-2">
              {localFiles.map((file) => {
                const isImage = file.file.type.startsWith('image/');
                return isImage ? (
                  /* 图片文件：大缩略图卡片 */
                  <div key={file.id} className="relative group">
                    <div className="w-24 h-24 rounded-lg overflow-hidden border border-border/50 bg-muted">
                      <img
                        src={file.previewUrl || file.thumbnailUrl}
                        alt={file.file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(file.id)}
                      aria-label={`移除文件 ${file.file.name}`}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground/80 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate w-24">{file.file.name}</p>
                  </div>
                ) : (
                  /* 非图片文件：原有行布局 */
                  <div key={file.id} className="flex flex-col gap-1.5 w-full">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded flex items-center justify-center mr-2">
                          <PaperclipIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{file.file.name}</p>
                          <p className="text-xs text-muted-foreground">{(file.file.size / 1024).toFixed(1)} KB</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(file.id)}
                        aria-label={`移除文件 ${file.file.name}`}
                        className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="pl-10 pr-1">{renderFileStatus(file)}</div>
                  </div>
                );
              })}
            </div>
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
        <div className="flex items-center gap-1 px-2 py-1.5">
          {/* 左侧工具按钮组 */}
          <div className="flex items-center gap-1 flex-1">
            {/* 文件上传按钮 */}
            <Button
              onClick={handleFileSelect}
              disabled={isComposerBlocked}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
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
              title={supportsReasoning ? (reasoningEnabled ? "AI思考过程已开启" : "AI思考过程已关闭") : "当前模型不支持思考过程"}
            >
              <Lightbulb className={`h-4 w-4 ${reasoningEnabled && supportsReasoning ? "text-amber-400" : ""}`} />
              <span className="text-xs">{reasoningEnabled && supportsReasoning ? "思考已开" : "思考"}</span>
            </Button>

          </div>

          {/* 右侧：模型选择器 + 发送按钮 */}
          <div className="flex items-center gap-1.5">
            <ModelSelector onChange={onModelChange || (() => {})} />
            <Button
            onClick={isStreaming && onStopStreaming ? onStopStreaming : handleSendMessage}
            disabled={!canSend && !(isStreaming && onStopStreaming)}
            size="sm"
            className="h-8 w-8 p-0 rounded-lg"
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
    </div>
  );
};

export default ChatInput;
