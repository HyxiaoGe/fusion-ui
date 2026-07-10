import type { Middleware } from '@reduxjs/toolkit';
import { resetConversationListForAuthChange } from '@/redux/slices/conversationSlice';
import {
  invalidateAllConversationDetails,
  invalidateConversationDetail,
} from '@/lib/chat/conversationDetailResource';
import { invalidateAllConversationFiles } from '@/lib/chat/conversationFilesResource';

interface AuthIdentityState {
  auth?: {
    isAuthenticated?: boolean;
    user?: { id?: string | null } | null;
    token?: string | null;
  };
}

function selectAuthIdentity(state: unknown): string | null {
  const auth = (state as AuthIdentityState | undefined)?.auth;
  if (!auth?.isAuthenticated) return null;
  return auth.user?.id ?? auth.token ?? null;
}

const conversationDetailInvalidationMiddleware: Middleware = (api) => (next) => (action) => {
  const typedAction = action as { type?: string; payload?: unknown };
  const previousAuthIdentity = selectAuthIdentity(api.getState());
  if (typedAction.type === 'conversation/resetConversationState') {
    invalidateAllConversationDetails();
    invalidateAllConversationFiles();
  } else if (
    typedAction.type === 'conversation/clearConversationMessages' &&
    typeof typedAction.payload === 'string'
  ) {
    invalidateConversationDetail(typedAction.payload);
  }

  const result = next(action);
  const nextAuthIdentity = selectAuthIdentity(api.getState());
  if (
    typedAction.type === 'auth/logout' ||
    previousAuthIdentity !== nextAuthIdentity
  ) {
    invalidateAllConversationDetails();
    invalidateAllConversationFiles();
    api.dispatch(resetConversationListForAuthChange());
    api.dispatch({ type: 'stream/endStream' });
    api.dispatch({ type: 'fileUpload/resetFileUploadState' });
  }

  return result;
};

export default conversationDetailInvalidationMiddleware;
