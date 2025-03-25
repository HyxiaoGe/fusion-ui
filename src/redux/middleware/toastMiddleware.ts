import { toast } from '@/components/ui/toast';
import { setError } from '@/redux/slices/chatSlice';
import { Middleware } from '@reduxjs/toolkit';

export const toastMiddleware: Middleware = store => next => action => {
  const result = next(action);
  
  if (setError.match(action) && action.payload) {
    toast.error(action.payload, 5000);
  }
  
  return result;
};

export default toastMiddleware;