import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock('./fetchWithAuth', () => ({
  apiRequest: apiRequestMock,
}));

import { getMessageNetworkDiagnostics } from './chatDiagnostics';

describe('getMessageNetworkDiagnostics', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('请求单条消息 diagnostics 路径', async () => {
    apiRequestMock.mockResolvedValueOnce({ is_empty: true });

    await getMessageNetworkDiagnostics('conv 1', 'msg/1');

    expect(apiRequestMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/chat/conversations/conv%201/messages/msg%2F1/diagnostics'),
    );
  });

  it('请求失败时向调用方抛出原错误', async () => {
    const error = new Error('diagnostics unavailable');
    apiRequestMock.mockRejectedValueOnce(error);

    await expect(getMessageNetworkDiagnostics('conv-1', 'msg-1')).rejects.toBe(error);
  });
});
