import { toast } from '@/components/ui/toast';
import { setGlobalError } from '@/redux/slices/conversationSlice';
import { Middleware } from '@reduxjs/toolkit';

export const toastMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);
  
  if (setGlobalError.match(action) && action.payload) {
    toast.error(action.payload, 5000);
  }
  
  return result;
};

export default toastMiddleware;
