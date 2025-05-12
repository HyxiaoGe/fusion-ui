"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileWithPreview, createFileWithPreview } from "@/lib/utils/fileHelpers";
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { toggleReasoning, toggleWebSearch } from "@/redux/slices/chatSlice";
import { 
  clearFiles, 
  addFileId, 
  updateFileStatus, 
  makeSelectChatFiles, 
  makeSelectChatFileIds, 
  selectFileUploadStatuses 
} from "@/redux/slices/fileUploadSlice";
import { EraserIcon, Lightbulb, PaperclipIcon, SendIcon, X, Globe } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../ui/toast";
import FileUpload from "./FileUpload";
import { v4 as uuidv4 } from 'uuid';
import FilePreviewList from "./FilePreviewList";
import { useSelector } from 'react-redux';
import { RootState } from '@/redux/store';
import { uploadFiles } from "@/lib/api/files";
import { startPollingFileStatus } from "@/lib/api/FileStatusPoller";

interface ChatInputProps {
  onSendMessage: (
    content: string,
    files?: FileWithPreview[],
    fileIds?: string[]
  ) => void;
  onClearMessage?: () => void;
  disabled?: boolean;
  placeholder?: string;
  activeChatId?: string;
}

interface LocalFileWithStatus {
  file: File;
  previewUrl: string;
  id: string;
  fileId?: string;
  status: string;
  errorMessage?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onClearMessage,
  disabled = false,
  placeholder = "输入您的问题...",
  activeChatId,
}) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [localFiles, setLocalFiles] = useState<LocalFileWithStatus[]>([]);

  const [useNewFileUpload, setUseNewFileUpload] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { models, selectedModelId } = useAppSelector((state) => state.models);
  const { activeChatId: currentActiveChatId } = useAppSelector((state) => state.chat);
  const chatId = activeChatId || currentActiveChatId || "default-chat";

  // Ensure chatId has a fallback if needed, but should primarily come from props if available
  const effectiveChatId = chatId || useAppSelector((state) => state.chat.activeChatId) || "default-chat";

  // --- Use memoized selectors --- 
  // Create stable selector instances using useMemo
  const selectChatFiles = useMemo(makeSelectChatFiles, []);
  const selectChatFileIds = useMemo(makeSelectChatFileIds, []);

  // Use the memoized selectors
  const reduxFiles = useAppSelector(state => selectChatFiles(state, effectiveChatId));
  const fileIds = useAppSelector(state => selectChatFileIds(state, effectiveChatId));
  const fileUploads = useAppSelector(selectFileUploadStatuses); // No chatId needed
  // --- End of memoized selectors usage ---

  const isUploading = useAppSelector((state) => state.fileUpload.isUploading);
  const uploadProgress = useAppSelector(
    (state) => state.fileUpload.uploadProgress
  );
  const fileUploadRef = useRef<any>(null);

  const handleFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 处理文件变化
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // 先添加文件到本地状态
    addFiles(Array.from(files));
    
    // 立即上传文件
    if (selectedModel) {
      handleUploadFiles(Array.from(files));
    } else {
      toast({
        message: "请先选择模型再上传文件",
        type: "error",
        duration: 3000
      });
    }

    // 重置input，以便能够重新选择同一文件
    if (event.target) {
      event.target.value = '';
    }
  };

  // 处理粘贴事件
  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    const files: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      // 先添加文件到本地状态
      addFiles(files);
      
      // 立即上传文件
      if (selectedModel) {
        handleUploadFiles(files);
      } else {
        toast({
          message: "请先选择模型再上传文件",
          type: "error",
          duration: 3000
        });
      }
      
      // 如果只粘贴了文件，阻止默认行为（避免粘贴文本）
      if (items.length === files.length) {
        event.preventDefault();
      }
    }
  };

  // 添加文件到本地状态
  const addFiles = (files: File[]) => {
    const newFiles = files.map(file => {
      return {
        file,
        previewUrl: '', // FilePreviewItem现在会内部使用FileReader，不需要在这里创建URL
        id: uuidv4(),
        status: 'pending'
      };
    });

    setLocalFiles(prev => {
      const combined = [...prev, ...newFiles];
      console.log('更新后的文件列表:', combined);
      return combined;
    });
  };

  // 处理文件上传
  const handleUploadFiles = async (filesToUpload: File[]) => {
    if (!selectedModel || !chatId) {
      toast({
        message: "无法上传文件，请先选择模型",
        type: "error",
      });
      return;
    }
    
    console.log(`开始处理文件上传: ${filesToUpload.map(f => f.name).join(', ')}`);
    
    // 预先更新本地文件列表状态，标记为上传中
    setLocalFiles(prev => {
      return prev.map(file => {
        // 找到需要上传的文件
        if (filesToUpload.some(f => f.name === file.file.name)) {
          // 直接更新状态属性
          return { ...file, status: 'uploading' };
        }
        return file;
      });
    });
    
    try {
      // 将状态设置为上传中
      dispatch(updateFileStatus({
        fileId: 'temp',
        chatId: chatId,
        status: 'uploading'
      }));
      
      // 执行上传
      console.log(`调用uploadFiles API上传文件...`);
      const fileIds = await uploadFiles(
        selectedModel.provider,
        selectedModel.id,
        chatId,
        filesToUpload
      );
      
      console.log('文件上传成功，获取到文件ID:', fileIds);
      
      // 更新本地文件状态，关联fileId
      setLocalFiles(prev => {
        const updated = [...prev];
        
        filesToUpload.forEach((uploadedFile, index) => {
          const fileIndex = updated.findIndex(f => f.file.name === uploadedFile.name);
          if (fileIndex !== -1 && fileIds[index]) {
            updated[fileIndex] = { 
              ...updated[fileIndex], 
              fileId: fileIds[index],
              status: 'parsing'
            };
          }
        });
        
        return updated;
      });
      
      // 对每个文件ID开始状态轮询
      fileIds.forEach((fileId, index) => {
        console.log(`处理上传成功的文件 ${index + 1}/${fileIds.length}, 文件ID: ${fileId}`);
        
        // 更新Redux中的文件ID
        dispatch(addFileId({
          chatId: chatId,
          fileId: fileId,
          fileIndex: index,
        }));
        
        // 设置文件状态为parsing
        dispatch(updateFileStatus({
          fileId: fileId,
          chatId: chatId,
          status: 'parsing'
        }));
        
        // 开始轮询文件状态
        console.log(`开始轮询文件 ${fileId} 的处理状态...`);
        startPollingFileStatus(
          fileId,
          chatId,
          dispatch,
          (success) => {
            if (success) {
              console.log(`文件 ${fileId} 处理成功，状态已变为processed`);
              // 更新本地文件状态
              setLocalFiles(prev => {
                return prev.map(f => {
                  if ((f as any).fileId === fileId) {
                    return { ...f, status: 'processed' };
                  }
                  return f;
                });
              });
              
              // 通知用户文件已处理完成
              toast({
                message: "文件处理完成，可以发送消息",
                type: "success",
                duration: 3000
              });
            } else {
              console.log(`文件 ${fileId} 处理失败，状态已变为error`);
              // 更新本地文件状态
              setLocalFiles(prev => {
                return prev.map(f => {
                  if ((f as any).fileId === fileId) {
                    return { ...f, status: 'error' };
                  }
                  return f;
                });
              });
              
              // 显示错误状态
              toast({
                message: "文件处理失败，请重试",
                type: "error",
                duration: 3000
              });
            }
          }
        );
      });
    } catch (error) {
      console.error('文件上传失败:', error);
      // 更新文件状态为错误
      setLocalFiles(prev => {
        return prev.map(file => {
          if (filesToUpload.some(f => f.name === file.file.name)) {
            return { ...file, status: 'error' };
          }
          return file;
        });
      });
      
      toast({
        message: `文件上传失败: ${(error as Error).message}`,
        type: "error",
        duration: 3000
      });
    }
  };

  // 移除文件
  const handleRemoveFile = (id: string) => {
    setLocalFiles(prev => {
      const filtered = prev.filter(f => f.id !== id);
      return filtered;
    });
  };

  // 释放所有URL对象 - 不再需要
  useEffect(() => {
    return () => {
      // 不再需要释放URL
    };
  }, []);

  // 发送消息
  const handleSendMessage = () => {
    if ((!message.trim() && localFiles.length === 0) || disabled) return;

    // 检查是否有文件需要发送
    if (localFiles.length > 0) {
      // 将localFiles转换为FileWithPreview格式
      const filesToSend: FileWithPreview[] = localFiles.map(item => {
        // 使用工具函数创建FileWithPreview对象
        const fileWithPreview = createFileWithPreview(item.file);
        fileWithPreview.preview = ''; // 不再使用预览URL，避免CSP问题
        
        // 重要：将fileId属性复制到新对象上
        if (item.fileId) {
          (fileWithPreview as any).fileId = item.fileId;
        }
        
        return fileWithPreview;
      });

      // 收集文件ID（如果有的话）
      const actualFileIds = localFiles
        .map(file => file.fileId)
        .filter(id => id !== undefined) as string[];

      console.log("发送带文件的消息", { 
        messageText: message, 
        filesCount: filesToSend.length,
        fileIds: actualFileIds 
      });

      // 发送包含文件的消息
      onSendMessage(message, filesToSend, actualFileIds);
      
      // 清除redux中的文件状态
      dispatch(clearFiles(chatId));
    } else {
      // 仅发送文本消息
      onSendMessage(message);
    }

    // 清理状态
    setMessage("");
    setLocalFiles([]);
    setFiles([]);
    setShowFileUpload(false);

    // 重置文本框高度
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

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
  }, [disabled, chatId]);

  // 调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

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
    dispatch(clearFiles(chatId));

    // 直接清除FilePond实例中的文件
    if (fileUploadRef.current) {
      fileUploadRef.current.resetFiles();
    }
  };

  // 从Redux获取当前选中的模型信息
  const selectedModel = useAppSelector((state) =>
    state.models.models.find((m) => m.id === selectedModelId)
  );

  const reasoningEnabled = useAppSelector((state) => state.chat.reasoningEnabled);
  const webSearchEnabled = useAppSelector((state) => state.chat.webSearchEnabled);

  // 检查当前模型是否支持推理
  const supportsReasoning = selectedModel?.capabilities?.deepThinking || false;

  // 检查当前模型是否支持文件上传
  const supportsFileUpload = selectedModel?.capabilities?.fileSupport || false;

  // 检查当前模型是否支持网络搜索
  const supportsWebSearch = selectedModel?.capabilities?.webSearch || false;

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
      toast({
        message: "当前选择的模型不支持文件上传功能",
        type: "warning",
        duration: 3000
      });
      return;
    }

    toggleFileUpload();
  };

  // 从Redux获取文件处理状态
  const processingFiles = useSelector((state: RootState) => state.fileUpload.processingFiles);
  
  // 检查是否有文件正在处理中
  const hasProcessingFiles = React.useMemo(() => {
    if (fileIds.length === 0) return false;
    
    // 检查本地文件是否有任何一个没有关联fileId
    const hasUnuploadedFiles = localFiles.some(file => !(file as any).fileId);
    if (hasUnuploadedFiles) return true;
    
    // 检查已上传的文件是否仍在处理中
    return fileIds.some(fileId => {
      const status = processingFiles[fileId];
      return status === 'pending' || status === 'uploading' || status === 'parsing';
    });
  }, [fileIds, processingFiles, localFiles]);

  // 渲染文件状态标签
  const renderFileStatus = (file: LocalFileWithStatus) => {
    // 直接使用文件的状态属性
    const status = file.status || 'pending';
    
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center text-gray-500">
            <span className="mr-2 text-xs font-medium">等待上传</span>
            <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        );
      case 'uploading':
        return (
          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-blue-500">上传中</span>
              <span className="text-xs text-blue-500">...</span>
            </div>
            <div className="w-full bg-blue-100 dark:bg-blue-900/30 h-1 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full animate-pulse" style={{ width: '100%' }}></div>
            </div>
          </div>
        );
      case 'parsing':
        return (
          <div className="flex flex-col w-full">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-amber-500">AI解析中</span>
              <span className="text-xs text-amber-500">...</span>
            </div>
            <div className="w-full bg-amber-100 dark:bg-amber-900/30 h-1 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full rounded-full" 
                   style={{ 
                     width: '60%', 
                     animation: 'progressPulse 2s ease-in-out infinite' 
                   }}>
              </div>
            </div>
          </div>
        );
      case 'processed':
        return (
          <div className="flex items-center text-green-600 dark:text-green-500">
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium">文件已就绪</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center text-red-600 dark:text-red-500">
            <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium">{file.errorMessage || '处理失败'}</span>
          </div>
        );
      default:
        return <span className="text-xs text-gray-500">未知状态</span>;
    }
  };

  // 当本地文件列表更新时，自动隐藏文件上传区域
  useEffect(() => {
    if (localFiles.length > 0) {
      setShowFileUpload(false);
    }
  }, [localFiles]);

  // 渲染底部状态提示
  const renderProcessingMessage = () => {
    // 检查是否有任何文件没有fileId（尚未上传）
    const hasUnuploadedFiles = localFiles.some(file => !(file as any).fileId);
    
    // 检查是否有文件正在uploading状态
    const hasUploadingFiles = fileIds.some(fileId => processingFiles[fileId] === 'uploading');
    
    // 检查是否有文件正在parsing状态
    const hasParsingFiles = fileIds.some(fileId => processingFiles[fileId] === 'parsing');
    
    if (hasUnuploadedFiles) {
      return (
        <div className="flex items-center text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
          <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-500 rounded-full animate-spin mr-2"></div>
          文件等待上传，请稍候...
        </div>
      );
    } else if (hasUploadingFiles) {
      return (
        <div className="flex items-center text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
          <div className="w-3 h-3 border-2 border-blue-300 border-t-blue-500 rounded-full animate-spin mr-2"></div>
          文件正在上传，请稍候...
        </div>
      );
    } else if (hasParsingFiles) {
      return (
        <div className="flex items-center text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-md">
          <div className="w-3 h-3 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin mr-2"></div>
          AI正在处理文件，请等待处理完成后发送...
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="flex flex-col space-y-2 p-4 border-t">
      {useNewFileUpload && localFiles.length > 0 && (
        <div className="p-3 border rounded-md bg-background/50 space-y-3">
          <div className="text-xs font-medium text-muted-foreground mb-2">已选择文件</div>
          {/* 文件列表 */}
          {localFiles.map((file, index) => (
            <div key={file.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded flex items-center justify-center mr-2">
                    <svg className="w-4 h-4 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveFile(file.id)}
                  className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="pl-10 pr-1">
                {renderFileStatus(file)}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* 只在没有本地文件时显示拖放上传区域 */}
      {showFileUpload && localFiles.length === 0 && (
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
            conversationId={chatId}
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
          variant="ghost"
          size="icon"
          className={`h-10 w-10 flex items-center justify-center ${!supportsReasoning ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => {
            if (!supportsReasoning || disabled) return;
            dispatch(toggleReasoning(!reasoningEnabled));
          }}
          disabled={!supportsReasoning || disabled}
          title={supportsReasoning ? (reasoningEnabled ? 'AI思考过程已开启' : 'AI思考过程已关闭') : '当前模型不支持思考过程'}
        >
          <Lightbulb
            className={`h-5 w-5 ${reasoningEnabled && supportsReasoning ? 'text-amber-400' : ''}`}
          />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={`h-10 w-10 flex items-center justify-center ${!supportsWebSearch ? "opacity-50 cursor-not-allowed" : ""}`}
          onClick={() => {
            if (!supportsWebSearch || disabled) return;
            dispatch(toggleWebSearch(!webSearchEnabled));
          }}
          disabled={!supportsWebSearch || disabled}
          title={supportsWebSearch ? (webSearchEnabled ? '网络搜索已开启' : '网络搜索已关闭') : '当前模型不支持网络搜索'}
        >
          <Globe
            className={`h-5 w-5 ${webSearchEnabled && supportsWebSearch ? 'text-blue-500' : ''}`}
          />
        </Button>

        <Button
          onClick={useNewFileUpload ? handleFileSelect : undefined}
          disabled={disabled}
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          title="上传文件"
        >
          <PaperclipIcon className="h-5 w-5" />
        </Button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
        />

        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={useNewFileUpload ? handlePaste : undefined}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-10 max-h-64 flex-1 resize-none"
          rows={1}
        />

        <Button
          onClick={handleSendMessage}
          disabled={(!message.trim() && localFiles.length === 0) || disabled || hasProcessingFiles}
          size="icon"
          className="h-10 w-10"
        >
          <SendIcon className="h-5 w-5" />
        </Button>
      </div>

      {/* 状态处理消息 */}
      {hasProcessingFiles && renderProcessingMessage()}

      <div className="text-xs text-muted-foreground">
        按 Enter 发送，Shift + Enter 换行
      </div>
      
      {/* 添加进度条动画 */}
      <style jsx global>{`
        @keyframes progressPulse {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
};

export default ChatInput;
