'use client';

import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/redux/hooks';
import { setError } from '@/redux/slices/chatSlice';
import { AlertCircle, X } from 'lucide-react';

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

  const handleClose = () => {
    dispatch(setError(null));
  };

  if (!error) return null;

  return <ErrorToast message={error} onClose={handleClose} />;
};

export default ErrorToastContainer;