'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FileWithPreview } from '@/lib/utils/fileHelpers';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { addFiles, clearFiles } from '@/redux/slices/fileUploadSlice';
import { PaperclipIcon, SendIcon, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import FileUpload from './FileUpload';

interface ChatInputProps {
  onSendMessage: (content: string, files?: FileWithPreview[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = '输入您的问题...'
}) => {
  const dispatch = useAppDispatch();
  const [message, setMessage] = useState('');
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 获取当前活跃聊天ID
  const activeChatId = useAppSelector(state => state.chat.activeChatId) || "default-chat";
  const isNewChat = useAppSelector(state => {
    // 判断是否为新对话（没有消息的对话）
    if (!activeChatId) return true;
    const chat = state.chat.chats.find(c => c.id === activeChatId);
    return !chat || chat.messages.length === 0;
  });
  
  // 从Redux获取文件状态
  const reduxFiles = useAppSelector(state => 
    state.fileUpload.files[activeChatId] || []
  );
  
  // 文件上传状态
  const isUploading = useAppSelector(state => state.fileUpload.isUploading);
  const uploadProgress = useAppSelector(state => state.fileUpload.uploadProgress);
  
  // 初始化或同步Redux中的文件
  useEffect(() => {
    if (reduxFiles.length > 0) {
      setFiles(reduxFiles);
    }
  }, [reduxFiles]);

  // 获取当前选中的模型，检查是否支持文件上传
  const selectedModel = useAppSelector(state => {
    const modelId = state.models.selectedModelId;
    return modelId ? state.models.models.find(m => m.id === modelId) : null;
  });
  
  // 简单判断模型是否支持文件上传
  const supportsFileUpload = selectedModel && ['qwen', 'openai', 'deepseek'].includes(selectedModel.provider);
  
  // 处理文件选择变更
  const handleFilesChange = (newFiles: FileWithPreview[]) => {
    setFiles(newFiles);
    dispatch(addFiles({ chatId: activeChatId, files: newFiles }));
  };

  // 清除所有文件
  const handleClearFiles = () => {
    setFiles([]);
    dispatch(clearFiles(activeChatId));
  };

  // 切换文件上传区域显示
  const toggleFileUpload = () => {
    setShowFileUpload(!showFileUpload);
  };

  const handleSendMessage = () => {
    if ((!message.trim() && files.length === 0) || disabled || isUploading) return;
    
    // 发送消息和文件
    onSendMessage(message, files);
    setMessage('');
    setFiles([]);
    
    // 清除Redux中的文件
    dispatch(clearFiles(activeChatId));
    setShowFileUpload(false);
    
    // 重置文本框高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex flex-col space-y-2 p-4 border-t">
      {showFileUpload && (
        <div className="p-4 border rounded-md bg-muted/30 relative">
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute top-2 right-2 h-6 w-6" 
            onClick={toggleFileUpload}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="mb-2 font-medium">上传文件</div>
          {!supportsFileUpload && (
            <div className="bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 p-2 rounded mb-2 text-sm">
              当前选择的模型不支持文件上传功能
            </div>
          )}
          {isNewChat && (
            <div className="bg-blue-100 dark:bg-blue-950/30 text-blue-800 dark:text-blue-200 p-2 rounded mb-2 text-sm">
              这是新对话，文件将会在发送消息时一起上传
            </div>
          )}
          <FileUpload 
            files={files}
            onFilesChange={handleFilesChange}
            disabled={!supportsFileUpload || disabled}
            uploading={false} // 不在这里上传，而是在发送消息时上传
            progress={0}
            simulateMode={true} // 新增模拟模式，不实际上传
          />
        </div>
      )}
      
      <div className="flex items-end gap-2">
        <Button
          onClick={toggleFileUpload}
          disabled={disabled || isUploading}
          variant={supportsFileUpload ? "ghost" : "outline"}
          size="icon"
          className={`h-10 w-10 ${!supportsFileUpload ? 'opacity-50' : ''}`}
          title={supportsFileUpload ? "上传文件" : "当前模型不支持文件上传"}
        >
          <PaperclipIcon className="h-5 w-5" />
        </Button>
        
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isUploading}
          className="min-h-10 max-h-64 flex-1 resize-none"
          rows={1}
        />
        
        <Button
          onClick={handleSendMessage}
          disabled={(!message.trim() && files.length === 0) || disabled || isUploading}
          size="icon"
          className="h-10 w-10"
        >
          <SendIcon className="h-5 w-5" />
        </Button>
      </div>
      
      {files.length > 0 && (
        <div className="pl-12 flex items-center text-xs text-muted-foreground">
          <span>{files.length} 个文件已选择</span>
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