import { createAction } from '@reduxjs/toolkit';

export const accountSessionSwitchStarted = createAction('auth/accountSessionSwitchStarted');
export const accountSessionSwitchBlocked = createAction<string>('auth/accountSessionSwitchBlocked');
export const accountSessionSwitchCompleted = createAction<{ email: string | null }>(
  'auth/accountSessionSwitchCompleted',
);
