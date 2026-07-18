import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchMock, submitMock, state } = vi.hoisted(() => ({
  dispatchMock: vi.fn(),
  submitMock: vi.fn(),
  state: {
    request: null as null | {
      conversationId: string;
      runId: string;
      requestId: string;
      contextType: 'geolocation';
      purpose: 'nearby_search';
      reason: string;
      expiresAt: number;
      sequence: number;
      phase: 'required' | 'locating' | 'submitting' | 'submit_failed';
    },
  },
}));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (value: unknown) => unknown) => selector({
    stream: { pendingContextRequest: state.request },
  }),
}));

vi.mock('@/lib/api/chat', () => ({
  submitAgentContextResult: submitMock,
}));

import { useLocationContextHandshake } from './useLocationContextHandshake';

function request() {
  return {
    conversationId: 'c1',
    runId: 'r1',
    requestId: 'ctx-1',
    contextType: 'geolocation' as const,
    purpose: 'nearby_search' as const,
    reason: '搜索附近地点',
    expiresAt: 1_721_200_120,
    sequence: 1,
    phase: 'required' as const,
  };
}

describe('useLocationContextHandshake', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    submitMock.mockReset();
    submitMock.mockResolvedValue({
      outcome: 'accepted',
      request_id: 'ctx-1',
      context_type: 'geolocation',
      status: 'provided',
    });
    state.request = request();
  });

  it('收到请求和初次渲染时不主动调用浏览器定位', () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    renderHook(() => useLocationContextHandshake('c1'));

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
  });

  it('用户点击允许后才获取位置并通过独立 API 提交', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({
      coords: {
        latitude: 22.62123,
        longitude: 114.03541,
        accuracy: 35,
      },
      timestamp: 1_721_200_000_000,
    } as GeolocationPosition));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useLocationContextHandshake('c1'));

    await act(async () => result.current.allowLocation());

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
    expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'c1',
      runId: 'r1',
      requestId: 'ctx-1',
      status: 'provided',
      location: {
        latitude: 22.62123,
        longitude: 114.03541,
        accuracyM: 35,
        acquiredAt: 1_721_200_000,
      },
    }));
    expect(dispatchMock.mock.calls.flat()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ latitude: expect.any(Number) }),
    ]));
  });

  it('首次定位超时后自动用高精度长等待重试一次', async () => {
    const getCurrentPosition = vi.fn()
      .mockImplementationOnce((_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 3, message: 'timed out' } as GeolocationPositionError);
      })
      .mockImplementationOnce((success: PositionCallback) => success({
        coords: {
          latitude: 22.62123,
          longitude: 114.03541,
          accuracy: 42,
        },
        timestamp: 1_721_200_000_000,
      } as GeolocationPosition));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useLocationContextHandshake('c1'));

    await act(async () => result.current.allowLocation());

    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 },
    );
    expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'provided',
      location: expect.objectContaining({
        latitude: 22.62123,
        longitude: 114.03541,
      }),
    }));
  });

  it('用户主动拒绝时不调用 geolocation，并回传 denied', async () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useLocationContextHandshake('c1'));

    await act(async () => result.current.declineLocation());

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'denied',
      reason: 'user_declined',
    }));
  });

  it.each([
    [1, 'denied', 'permission_denied'],
    [2, 'unavailable', 'position_unavailable'],
    [3, 'timeout', 'geolocation_timeout'],
  ] as const)('映射 geolocation 错误 code=%s', async (code, status, reason) => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ code, message: 'browser detail' } as GeolocationPositionError);
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useLocationContextHandshake('c1'));

    await act(async () => result.current.allowLocation());

    expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({ status, reason }));
    expect(submitMock.mock.calls[0][0]).not.toHaveProperty('message');
  });

  it('浏览器仅返回超过后端上限的粗略位置时回传 unavailable', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({
      coords: {
        latitude: 22.62123,
        longitude: 114.03541,
        accuracy: 50_001,
      },
      timestamp: 1_721_200_000_000,
    } as GeolocationPosition));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useLocationContextHandshake('c1'));

    await act(async () => result.current.allowLocation());

    expect(submitMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'unavailable',
      reason: 'position_unavailable',
    }));
    expect(submitMock.mock.calls[0][0]).not.toHaveProperty('location');
  });

  it('提交失败后缓存结果并可重试，不重复请求浏览器位置', async () => {
    submitMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({
      outcome: 'accepted',
      request_id: 'ctx-1',
      context_type: 'geolocation',
      status: 'provided',
    });
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({
      coords: { latitude: 22.6, longitude: 114.0, accuracy: 50 },
      timestamp: 1_721_200_000_000,
    } as GeolocationPosition));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    const { result } = renderHook(() => useLocationContextHandshake('c1'));

    await act(async () => result.current.allowLocation());
    await waitFor(() => expect(dispatchMock).toHaveBeenCalledWith(expect.objectContaining({
      type: 'stream/setContextRequestPhase',
      payload: expect.objectContaining({ phase: 'submit_failed' }),
    })));
    await act(async () => result.current.retrySubmission());

    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledTimes(2);
  });
});
