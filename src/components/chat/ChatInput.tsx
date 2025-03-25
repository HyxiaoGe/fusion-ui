"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { showToast } from "@/components/ui/toast";
import { FileWithPreview } from "@/lib/utils/fileHelpers";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { clearFiles } from "@/redux/slices/fileUploadSlice";
import { Lightbulb, EraserIcon, PaperclipIcon, SendIcon, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import FileUpload from "./FileUpload";
import { Switch } from "@radix-ui/react-switch";
import { Label } from "@radix-ui/react-label";
import { toggleReasoning } from "@/redux/slices/chatSlice";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@radix-ui/react-tooltip";

interface ChatInputProps {
  onSendMessage: (
    content: string,
    files?: FileWithPreview[],
    fileIds?: string[]
  ) => void;
  onClearMessage?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onClearMessage,
  disabled = false,
  placeholder = "输入您的问题...",
}) => {
  const dispatch = useAppDispatch();
  const [message, setMessage] = useState("");
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 获取当前活跃聊天ID
  const activeChatId =
    useAppSelector((state) => state.chat.activeChatId) || "default-chat";

  // 从Redux获取文件状态
  const reduxFiles = useAppSelector(
    (state) => state.fileUpload.files[activeChatId] || []
  );
  const fileIds = useAppSelector(
    (state) => state.fileUpload.fileIds[activeChatId] || []
  );
  const isUploading = useAppSelector((state) => state.fileUpload.isUploading);
  const uploadProgress = useAppSelector(
    (state) => state.fileUpload.uploadProgress
  );
  const fileUploadRef = useRef<any>(null);

  // 初始化或同步Redux中的文件
  useEffect(() => {
    if (reduxFiles.length > 0 && files.length === 0) {
      setFiles(reduxFiles);
    }
  }, [reduxFiles, files.length]);

  // 组件挂载或activeChatId变化时重置状态
  useEffect(() => {

    // 清空文件状态，避免聊天切换时文件状态混乱
    setFiles([]);

    // 检查文本框是否可交互
    if (textareaRef.current) {

      // 尝试强制确保文本框可编辑
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.disabled = disabled;
          textareaRef.current.readOnly = false;
        }
      }, 100);
    }

    return () => {
    };
  }, [disabled, activeChatId]);

  // 调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSendMessage = () => {
    console.log("尝试发送消息", { message, disabled, files, fileIds });
    if ((!message.trim() && files.length === 0) || disabled || isUploading)
      return;

    // 收集实际的文件ID
    const actualFileIds = files
      .map((file) => (file as any).fileId)
      .filter((id) => id !== undefined);

    // 发送消息和文件ID
    onSendMessage(message, files, actualFileIds);
    setMessage("");

    // 清除文件和关闭上传区域
    setFiles([]);
    dispatch(clearFiles(activeChatId));
    setShowFileUpload(false);

    // 重置文本框高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 处理文件变化
  const handleFilesChange = (newFiles: FileWithPreview[]) => {
    // 如果有多个文件，只保留第一个
    if (newFiles.length > 0) {
      setFiles([newFiles[0]]);
    } else {
      setFiles([]);
    }
  };

  // 处理文件上传完成
  const handleUploadComplete = (fileIds: string[]) => {
    console.log("文件上传完成，获取到文件ID:", fileIds);
  };

  // 切换文件上传区域显示
  const toggleFileUpload = () => {
    setShowFileUpload(!showFileUpload);
  };

  // 清除所有文件
  const handleClearFiles = () => {
    // 清除React状态
    setFiles([]);
    // 清除Redux状态
    dispatch(clearFiles(activeChatId));

    // 直接清除FilePond实例中的文件
    if (fileUploadRef.current) {
      fileUploadRef.current.resetFiles();
    }
  };

  // 从Redux获取当前选中的模型信息
  const selectedModelId = useAppSelector(
    (state) => state.models.selectedModelId
  );
  const selectedModel = useAppSelector((state) =>
    state.models.models.find((m) => m.id === selectedModelId)
  );

  const reasoningEnabled = useAppSelector((state) => state.chat.reasoningEnabled);

  // 检查当前模型是否支持推理
  const supportsReasoning = selectedModel?.capabilities?.deepThinking || false;

  // 检查当前模型是否支持文件上传
  const supportsFileUpload = selectedModel?.capabilities?.fileSupport || false;

  // 如果尝试显示文件上传区域但模型不支持，则自动关闭
  useEffect(() => {
    if (showFileUpload && !supportsFileUpload) {
      setShowFileUpload(false);
    }
  }, [supportsFileUpload, showFileUpload]);

  // 处理文件上传按钮点击
  const handleFileUploadClick = () => {
    console.log("handleFileUploadClick", { supportsFileUpload });
    if (!supportsFileUpload) {
      console.log("当前选择的模型不支持文件上传功能");
      showToast({
        message: "当前选择的模型不支持文件上传功能",
        type: "warning",
        duration: 3000,
      });
      return;
    }

    toggleFileUpload();
  };

  return (
    <div className="flex flex-col space-y-2 p-4 border-t">
      {showFileUpload && (
        <div className="p-4 border rounded-md bg-muted/30 relative">
          {!supportsFileUpload && (
            <div className="bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-2 rounded mb-2 text-sm">
              当前选择的模型不支持文件上传功能
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6"
            onClick={toggleFileUpload}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="mb-2 font-medium">上传文件 (单个文件)</div>
          <FileUpload
            ref={fileUploadRef}
            files={files}
            onFilesChange={handleFilesChange}
            provider={selectedModel?.provider || ''}
            model={selectedModelId || ''}
            conversationId={activeChatId}
            disabled={!supportsFileUpload || disabled}
            uploading={isUploading}
            progress={uploadProgress}
            onUploadComplete={handleUploadComplete}
            maxFiles={1}
          />
        </div>
      )}

      <div className="flex items-end gap-2">
        {onClearMessage && (
          <Button
            onClick={onClearMessage}
            disabled={disabled}
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            title="清空聊天内容"
          >
            <EraserIcon className="h-5 w-5" />
          </Button>
        )}

        <Button
          onClick={handleFileUploadClick}
          disabled={disabled}
          variant={supportsFileUpload ? "ghost" : "outline"}
          size="icon"
          className={`h-10 w-10 ${!supportsFileUpload ? "opacity-50 cursor-not-allowed" : ""}`}
          title={supportsFileUpload ? "上传文件" : "当前模型不支持文件上传"}
        >
          <PaperclipIcon className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={`h-10 w-10 flex items-center justify-center ${!supportsReasoning ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => {
            if (!supportsReasoning || disabled) return;
            dispatch(toggleReasoning(!reasoningEnabled));
          }}
          disabled={!supportsReasoning || disabled}
          title={supportsReasoning ? '开启/关闭AI思考过程' : '当前模型不支持思考过程'}
        >
          <Lightbulb
            className={`h-5 w-5 ${reasoningEnabled && supportsReasoning ? 'text-amber-400' : ''}`}
          />
        </Button>

        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-10 max-h-64 flex-1 resize-none"
          rows={1}
        />

        <Button
          onClick={handleSendMessage}
          disabled={
            (!message.trim() && files.length === 0) || disabled || isUploading
          }
          size="icon"
          className="h-10 w-10"
        >
          <SendIcon className="h-5 w-5" />
        </Button>
      </div>

      {files.length > 0 && (
        <div className="pl-12 flex items-center text-xs text-muted-foreground">
          <span>已选择文件: {files[0]?.name}</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 ml-2 text-xs"
            onClick={handleClearFiles}
          >
            清除
          </Button>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        按 Enter 发送，Shift + Enter 换行
      </div>
    </div>
  );
};

export default ChatInput;
