import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invalidateAllConversationDetailsMock,
  invalidateAllConversationFilesMock,
  invalidateConversationDetailMock,
} = vi.hoisted(() => ({
  invalidateAllConversationDetailsMock: vi.fn(),
  invalidateAllConversationFilesMock: vi.fn(),
  invalidateConversationDetailMock: vi.fn(),
}));

vi.mock('@/lib/chat/conversationDetailResource', () => ({
  invalidateAllConversationDetails: invalidateAllConversationDetailsMock,
  invalidateConversationDetail: invalidateConversationDetailMock,
}));

vi.mock('@/lib/chat/conversationFilesResource', () => ({
  invalidateAllConversationFiles: invalidateAllConversationFilesMock,
}));

import conversationDetailInvalidationMiddleware from './conversationDetailInvalidationMiddleware';

describe('conversationDetailInvalidationMiddleware', () => {
  beforeEach(() => {
    invalidateAllConversationDetailsMock.mockClear();
    invalidateAllConversationFilesMock.mockClear();
    invalidateConversationDetailMock.mockClear();
  });

  it('conversation/resetConversationState 会让全部 pending 会话资源请求失效', () => {
    const state = { auth: { isAuthenticated: true, user: { id: 'user-a' }, token: 'token-a' } };
    const dispatch = vi.fn();
    const next = vi.fn();
    const invoke = conversationDetailInvalidationMiddleware({
      getState: () => state,
      dispatch,
    } as any)(next);

    invoke({ type: 'conversation/resetConversationState' });

    expect(invalidateAllConversationDetailsMock).toHaveBeenCalledTimes(1);
    expect(invalidateAllConversationFilesMock).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([
    ['logout', null],
    ['切换账号', 'user-b'],
  ])('auth %s 后同步重置旧账号会话列表', (_label, nextUserId) => {
    let state = { auth: { isAuthenticated: true, user: { id: 'user-a' }, token: 'token-a' } } as any;
    const dispatch = vi.fn();
    const next = vi.fn(() => {
      state = nextUserId
        ? { auth: { isAuthenticated: true, user: { id: nextUserId }, token: `token-${nextUserId}` } }
        : { auth: { isAuthenticated: false, user: null, token: null } };
    });
    const invoke = conversationDetailInvalidationMiddleware({
      getState: () => state,
      dispatch,
    } as any)(next);

    invoke({ type: nextUserId ? 'auth/fetchUserProfile/fulfilled' : 'auth/logout' });

    expect(invalidateAllConversationDetailsMock).toHaveBeenCalledTimes(1);
    expect(invalidateAllConversationFilesMock).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation/resetConversationListForAuthChange' })
    );
    expect(dispatch).toHaveBeenCalledWith({ type: 'stream/endStream' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'fileUpload/resetFileUploadState' });
  });

  it('清空单个会话时只让该会话 pending 详情请求失效', () => {
    const next = vi.fn();
    const invoke = conversationDetailInvalidationMiddleware({
      getState: () => ({ auth: { isAuthenticated: false, user: null, token: null } }),
      dispatch: vi.fn(),
    } as any)(next);

    invoke({ type: 'conversation/clearConversationMessages', payload: 'chat-a' });

    expect(invalidateConversationDetailMock).toHaveBeenCalledWith('chat-a');
    expect(invalidateAllConversationDetailsMock).not.toHaveBeenCalled();
    expect(invalidateAllConversationFilesMock).not.toHaveBeenCalled();
  });
});
