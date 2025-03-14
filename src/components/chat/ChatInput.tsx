'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SendIcon } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = '输入您的问题...'
}) => {
  const [message, setMessage] = useState('');
  const [isEditable, setIsEditable] = useState(true); // 添加可编辑状态追踪
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
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
  
  // 监听文本框事件
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // 添加测试事件监听器
    const handleFocus = () => {
      console.log("文本框获得焦点");
      setIsEditable(true);
    };
    
    const handleBlur = () => {
      console.log("文本框失去焦点");
    };
    
    const handleClick = () => {
      console.log("文本框被点击");
      // 尝试强制可编辑
      if (!isEditable) {
        setIsEditable(true);
        textarea.disabled = disabled;
        textarea.readOnly = false;
      }
    };
    
    textarea.addEventListener('focus', handleFocus);
    textarea.addEventListener('blur', handleBlur);
    textarea.addEventListener('click', handleClick);
    
    return () => {
      textarea.removeEventListener('focus', handleFocus);
      textarea.removeEventListener('blur', handleBlur);
      textarea.removeEventListener('click', handleClick);
    };
  }, [disabled, isEditable]);

  // 调整文本框高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSendMessage = () => {
    console.log("尝试发送消息", { message, disabled });
    if (!message.trim() || disabled) return;
    
    onSendMessage(message);
    setMessage('');
    
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

  // 添加一个点击外部重置方法
  const resetTextarea = () => {
    console.log("执行重置方法");
    if (textareaRef.current) {
      textareaRef.current.disabled = disabled;
      textareaRef.current.readOnly = false;
      setIsEditable(true);
    }
  };

  return (
    <div className="flex flex-col space-y-2 p-4 border-t">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-10 max-h-64 flex-1 resize-none"
          rows={1}
          onClick={resetTextarea} // 添加点击重置
        />
        <Button
          onClick={handleSendMessage}
          disabled={!message.trim() || disabled}
          size="icon"
          className="h-10 w-10"
        >
          <SendIcon className="h-5 w-5" />
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        按 Enter 发送，Shift + Enter 换行
      </div>
    </div>
  );
};

export default ChatInput;