import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { allowMock, declineMock, retryMock, hookState } = vi.hoisted(() => ({
  allowMock: vi.fn(),
  declineMock: vi.fn(),
  retryMock: vi.fn(),
  hookState: {
    value: null as null | {
      request: {
        purpose: 'nearby_search' | 'route_origin' | 'route_destination' | 'local_weather';
        phase: 'required' | 'locating' | 'submitting' | 'submit_failed';
      };
      allowLocation: () => Promise<void>;
      declineLocation: () => Promise<void>;
      retrySubmission: () => Promise<void>;
    },
  },
}));

vi.mock('@/hooks/useLocationContextHandshake', () => ({
  useLocationContextHandshake: () => hookState.value ?? {
    request: null,
    allowLocation: allowMock,
    declineLocation: declineMock,
    retrySubmission: retryMock,
  },
}));

import LocationContextBanner from './LocationContextBanner';

describe('LocationContextBanner', () => {
  beforeEach(() => {
    allowMock.mockReset();
    declineMock.mockReset();
    retryMock.mockReset();
    hookState.value = null;
  });

  it('required 状态说明隐私边界，只有点击才请求位置', () => {
    hookState.value = {
      request: { purpose: 'nearby_search', phase: 'required' },
      allowLocation: allowMock,
      declineLocation: declineMock,
      retrySubmission: retryMock,
    };
    render(<LocationContextBanner conversationId="c1" />);

    expect(screen.getByText(/仅用于本次请求，不会写入聊天记录/)).toBeInTheDocument();
    expect(allowMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '使用我的位置' }));
    expect(allowMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '暂不提供' }));
    expect(declineMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['locating', '正在获取位置'],
    ['submitting', '正在继续处理'],
  ] as const)('%s 状态显示进度且没有可重复点击按钮', (phase, text) => {
    hookState.value = {
      request: { purpose: 'route_origin', phase },
      allowLocation: allowMock,
      declineLocation: declineMock,
      retrySubmission: retryMock,
    };
    render(<LocationContextBanner conversationId="c1" />);

    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '使用我的位置' })).toBeNull();
  });

  it('提交失败时提供明确重试，不重新诱导授权', () => {
    hookState.value = {
      request: { purpose: 'local_weather', phase: 'submit_failed' },
      allowLocation: allowMock,
      declineLocation: declineMock,
      retrySubmission: retryMock,
    };
    render(<LocationContextBanner conversationId="c1" />);

    fireEvent.click(screen.getByRole('button', { name: '重试提交' }));
    expect(retryMock).toHaveBeenCalledTimes(1);
    expect(allowMock).not.toHaveBeenCalled();
  });
});
