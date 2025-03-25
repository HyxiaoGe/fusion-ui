'use client';

import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Button } from './button';

// Toast配置类型
export interface ToastProps {
  id?: string;
  message: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  duration?: number;
  onClose?: () => void;
}

// 单个Toast组件
const ToastItem: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onClose
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose && onClose();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);
  
  // 不同类型的背景色和图标
  const bgColor = {
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    error: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    success: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
  };
  
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5" />;
      case 'error':
        return <AlertCircle className="h-5 w-5" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5" />;
      case 'info':
      default:
        return <Info className="h-5 w-5" />;
    }
  };
  
  return (
    <div 
      className={cn(
        'px-4 py-3 rounded-md shadow-lg flex items-center gap-3 max-w-md mb-2',
        'animate-in fade-in-50 slide-in-from-top-5 duration-200',
        bgColor[type]
      )}
    >
      {getIcon()}
      <p className="flex-1">{message}</p>
      {onClose && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

// 创建ToastContext
interface ToastContextType {
  toasts: ToastProps[];
  toast: (props: Omit<ToastProps, 'id' | 'onClose'>) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Toast提供者组件
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);
  
  const toast = (props: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast = {
      ...props,
      id,
      onClose: () => dismiss(id)
    };
    
    setToasts(prev => [...prev, newToast]);
    return id;
  };
  
  const dismiss = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };
  
  const dismissAll = () => {
    setToasts([]);
  };
  
  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, dismissAll }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col items-end">
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              onClose={toast.onClose}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};

// 自定义Hook
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// 简便方法用于组件外部
let globalToast: ToastContextType | null = null;

export const setGlobalToast = (toastContext: ToastContextType) => {
  globalToast = toastContext;
};

// 全局方法，用于非React组件或Redux中使用
export const toast = {
  info: (message: string, duration?: number) => {
    if (globalToast) return globalToast.toast({ message, type: 'info', duration });
    console.warn('Toast provider not initialized');
    return '';
  },
  success: (message: string, duration?: number) => {
    if (globalToast) return globalToast.toast({ message, type: 'success', duration });
    console.warn('Toast provider not initialized');
    return '';
  },
  warning: (message: string, duration?: number) => {
    if (globalToast) return globalToast.toast({ message, type: 'warning', duration });
    console.warn('Toast provider not initialized');
    return '';
  },
  error: (message: string, duration?: number) => {
    if (globalToast) return globalToast.toast({ message, type: 'error', duration });
    console.warn('Toast provider not initialized');
    return '';
  },
  dismiss: (id: string) => {
    if (globalToast) globalToast.dismiss(id);
  },
  dismissAll: () => {
    if (globalToast) globalToast.dismissAll();
  }
};