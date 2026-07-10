import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invalidateAllConversationDetailsMock, invalidateConversationDetailMock } = vi.hoisted(() => ({
  invalidateAllConversationDetailsMock: vi.fn(),
  invalidateConversationDetailMock: vi.fn(),
}));

vi.mock('@/lib/chat/conversationDetailResource', () => ({
  invalidateAllConversationDetails: invalidateAllConversationDetailsMock,
  invalidateConversationDetail: invalidateConversationDetailMock,
}));

import conversationDetailInvalidationMiddleware from './conversationDetailInvalidationMiddleware';

describe('conversationDetailInvalidationMiddleware', () => {
  beforeEach(() => {
    invalidateAllConversationDetailsMock.mockClear();
    invalidateConversationDetailMock.mockClear();
  });

  it.each(['conversation/resetConversationState', 'auth/logout'])(
    '%s 会让全部 pending 详情请求失效',
    (type) => {
      const next = vi.fn();
      const invoke = conversationDetailInvalidationMiddleware({} as any)(next);

      invoke({ type });

      expect(invalidateAllConversationDetailsMock).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith({ type });
    }
  );

  it('清空单个会话时只让该会话 pending 详情请求失效', () => {
    const next = vi.fn();
    const invoke = conversationDetailInvalidationMiddleware({} as any)(next);

    invoke({ type: 'conversation/clearConversationMessages', payload: 'chat-a' });

    expect(invalidateConversationDetailMock).toHaveBeenCalledWith('chat-a');
    expect(invalidateAllConversationDetailsMock).not.toHaveBeenCalled();
  });
});
