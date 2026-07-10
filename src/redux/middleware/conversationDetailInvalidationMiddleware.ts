import type { Middleware } from '@reduxjs/toolkit';
import {
  invalidateAllConversationDetails,
  invalidateConversationDetail,
} from '@/lib/chat/conversationDetailResource';

const conversationDetailInvalidationMiddleware: Middleware = () => (next) => (action) => {
  const typedAction = action as { type?: string; payload?: unknown };
  if (
    typedAction.type === 'conversation/resetConversationState' ||
    typedAction.type === 'auth/logout'
  ) {
    invalidateAllConversationDetails();
  } else if (
    typedAction.type === 'conversation/clearConversationMessages' &&
    typeof typedAction.payload === 'string'
  ) {
    invalidateConversationDetail(typedAction.payload);
  }

  return next(action);
};

export default conversationDetailInvalidationMiddleware;
