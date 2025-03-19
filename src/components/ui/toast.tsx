import { cn } from '@/lib/utils';
import { AlertCircle, X } from 'lucide-react';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';

interface ToastProps {
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onClose
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    
    return () => clearTimeout(timer);
  }, [duration, onClose]);
  
  const bgColor = {
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
  };
  
  return (
    <div className={cn(
      'fixed bottom-4 right-4 z-50 px-4 py-3 rounded-md shadow-lg flex items-center gap-3 max-w-md',
      bgColor[type]
    )}>
      <AlertCircle className="h-5 w-5" />
      <p className="flex-1">{message}</p>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

// 创建一个全局toast管理器
let toastContainer: HTMLDivElement | null = null;

if (typeof window !== 'undefined') {
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  document.body.appendChild(toastContainer);
}

export const showToast = (props: Omit<ToastProps, 'onClose'>) => {
  if (!toastContainer) return;
  
  const toastId = Date.now().toString();
  const toastElement = document.createElement('div');
  toastElement.id = `toast-${toastId}`;
  toastContainer.appendChild(toastElement);
  
  const removeToast = () => {
    const element = document.getElementById(`toast-${toastId}`);
    if (element && toastContainer) {
      toastContainer.removeChild(element);
    }
  };
  
  createPortal(
    <Toast {...props} onClose={removeToast} />,
    toastElement
  );
};