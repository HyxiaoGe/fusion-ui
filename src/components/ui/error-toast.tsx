'use client';

import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setError } from '@/redux/slices/chatSlice';
import { AlertCircle, X } from 'lucide-react';
import { useEffect } from 'react';
import { useToast } from './toast';

interface ErrorToastProps {
  message: string;
  onClose: () => void;
}

const ErrorToast: React.FC<ErrorToastProps> = ({ message, onClose }) => {
  useEffect(() => {
    // 5秒后自动关闭
    const timer = setTimeout(() => {
      onClose();
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-destructive text-destructive-foreground px-4 py-3 rounded-md shadow-lg flex items-center gap-3 max-w-md">
      <AlertCircle className="h-5 w-5" />
      <p className="flex-1">{message}</p>
      <button onClick={onClose} className="text-destructive-foreground/80 hover:text-destructive-foreground">
        <X className="h-5 w-5" />
      </button>
    </div>
  );
};

const ErrorToastContainer: React.FC = () => {
  const dispatch = useAppDispatch();
  const error = useAppSelector((state) => state.chat.error);
  const { toast } = useToast();

  useEffect(() => {
    if (error) {
      toast({
        message: error,
        type: 'error',
        duration: 5000
      });
      
      // 清除错误，防止重复显示
      setTimeout(() => {
        dispatch(setError(null));
      }, 100);
    }
  }, [error, toast, dispatch]);

  return null;
};

export default ErrorToastContainer;