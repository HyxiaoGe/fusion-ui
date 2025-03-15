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
  const [isEditable, setIsEditable] = useState(true);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // 获取当前活跃聊天ID
  const activeChatId = useAppSelector(state => state.chat.activeChatId) || "default-chat";
  
  // 从Redux获取文件状态
  const reduxFiles = useAppSelector(state => 
    state.fileUpload.files[activeChatId] || []
  );
  
  // 初始化或同步Redux中的文件
  useEffect(() => {
    if (reduxFiles.length > 0) {
      setFiles(reduxFiles);
    }
  }, [reduxFiles]);
  
  // 组件挂载时记录日志
  useEffect(() => {
    console.log("ChatInput组件已挂载", { disabled });
    
    // 检查文本框是否可交互
    if (textareaRef.current) {
      const isDisabled = textareaRef.current.hasAttribute('disabled');
      const isReadOnly = textareaRef.current.hasAttribute('readonly');
      console.log("文本框状态检查:", { isDisabled, isReadOnly });
      
      // 尝试强制确保文本框可编辑
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.disabled = disabled;
          textareaRef.current.readOnly = false;
          textareaRef.current.blur(); // 先失去焦点
          textareaRef.current.focus(); // 再获取焦点
          console.log("已重置文本框状态");
        }
      }, 100);
    }
    
    return () => {
      console.log("ChatInput组件将卸载");
    };
  }, [disabled]);
  
  // 调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSendMessage = () => {
    console.log("尝试发送消息", { message, disabled, files });
    if ((!message.trim() && files.length === 0) || disabled) return;
    
    // 模拟上传进度
    if (files.length > 0) {
      setUploading(true);
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setUploading(false);
            // 发送消息和文件
            onSendMessage(message, files);
            setMessage('');
            setFiles([]);
            // 清除Redux中的文件
            dispatch(clearFiles(activeChatId));
            setShowFileUpload(false);
            return 0;
          }
          return prev + 10;
        });
      }, 300);
    } else {
      // 只发送文本消息
      onSendMessage(message);
      setMessage('');
    }
    
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

  // 处理文件变化
  const handleFilesChange = (newFiles: FileWithPreview[]) => {
    setFiles(newFiles);
    dispatch(addFiles({ chatId: activeChatId, files: newFiles }));
  };

  // 切换文件上传区域显示
  const toggleFileUpload = () => {
    setShowFileUpload(!showFileUpload);
  };

  // 清除所有文件
  const handleClearFiles = () => {
    setFiles([]);
    dispatch(clearFiles(activeChatId));
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
          <FileUpload 
            files={files} // 传递文件列表
            onFilesChange={handleFilesChange} 
            disabled={disabled || uploading}
            uploading={uploading}
            progress={uploadProgress}
          />
        </div>
      )}
      
      <div className="flex items-end gap-2">
        <Button
          onClick={toggleFileUpload}
          disabled={disabled || uploading}
          variant="ghost"
          size="icon"
          className="h-10 w-10"
        >
          <PaperclipIcon className="h-5 w-5" />
        </Button>
        
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || uploading}
          className="min-h-10 max-h-64 flex-1 resize-none"
          rows={1}
        />
        
        <Button
          onClick={handleSendMessage}
          disabled={(!message.trim() && files.length === 0) || disabled || uploading}
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