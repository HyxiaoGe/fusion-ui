import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TrajectoryNodeDetailResponse } from '@/types/trajectory';

const getTrajectoryToolNodeDetailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/trajectory', () => ({
  getTrajectoryToolNodeDetail: getTrajectoryToolNodeDetailMock,
}));

import {
  useTrajectoryToolNodeDetail,
  type TrajectoryToolNodeIdentity,
} from './useTrajectoryToolNodeDetail';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function toolIdentity(toolCallId: string): TrajectoryToolNodeIdentity {
  return {
    conversationId: 'conversation-a',
    runId: 'run-a',
    nodeType: 'tool',
    toolCallId,
  };
}

function toolDetail(status: TrajectoryNodeDetailResponse['status']): TrajectoryNodeDetailResponse {
  return {
    status,
    node_type: 'tool',
    available_sections: status === 'available' ? ['summary', 'payload', 'result', 'timing'] : ['summary'],
    detail: status === 'available'
      ? {
        tool_call_id: 'tool-a',
        tool_name: 'weather',
        status: 'completed',
        duration_ms: 42,
        payload: { city: '上海' },
        result: { temperature: 28 },
        error: null,
      }
      : null,
    redacted_fields: [],
    reason: status === 'available' ? null : `tool detail is ${status}`,
  };
}

describe('useTrajectoryToolNodeDetail', () => {
  beforeEach(() => {
    getTrajectoryToolNodeDetailMock.mockReset();
  });

  it('disabled、identity 不完整或非 Tool 选择都不发请求', async () => {
    const { rerender } = renderHook(
      ({ identity, enabled }) => useTrajectoryToolNodeDetail(identity, enabled),
      { initialProps: { identity: toolIdentity('tool-a'), enabled: false } },
    );
    await act(async () => Promise.resolve());

    rerender({
      identity: { ...toolIdentity('tool-a'), toolCallId: null },
      enabled: true,
    });
    await act(async () => Promise.resolve());
    rerender({
      identity: { ...toolIdentity('tool-a'), nodeType: 'llm' },
      enabled: true,
    });
    await act(async () => Promise.resolve());

    expect(getTrajectoryToolNodeDetailMock).not.toHaveBeenCalled();
  });

  it('切换 identity 时 abort A，A 的迟到成功不会覆盖 B', async () => {
    const requestA = deferred<TrajectoryNodeDetailResponse>();
    const requestB = deferred<TrajectoryNodeDetailResponse>();
    let signalA: AbortSignal | undefined;
    getTrajectoryToolNodeDetailMock
      .mockImplementationOnce((_: string, __: string, ___: string, signal: AbortSignal) => {
        signalA = signal;
        return requestA.promise;
      })
      .mockReturnValueOnce(requestB.promise);
    const { result, rerender } = renderHook(
      ({ identity }) => useTrajectoryToolNodeDetail(identity, true),
      { initialProps: { identity: toolIdentity('tool-a') } },
    );
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1));

    rerender({ identity: toolIdentity('tool-b') });
    await waitFor(() => expect(signalA?.aborted).toBe(true));
    expect(result.current.response).toBeNull();
    expect(result.current.status).toBe('loading');

    await act(async () => {
      requestA.resolve(toolDetail('available'));
      requestB.resolve({ ...toolDetail('available'), reason: 'B response' });
      await Promise.all([requestA.promise, requestB.promise]);
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.response?.reason).toBe('B response');
  });

  it('切换 identity 后 A 的迟到失败不会覆盖 B 的 ready 响应', async () => {
    const requestA = deferred<TrajectoryNodeDetailResponse>();
    const requestB = deferred<TrajectoryNodeDetailResponse>();
    getTrajectoryToolNodeDetailMock
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise);
    const { result, rerender } = renderHook(
      ({ identity }) => useTrajectoryToolNodeDetail(identity, true),
      { initialProps: { identity: toolIdentity('tool-a') } },
    );
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1));

    rerender({ identity: toolIdentity('tool-b') });
    await act(async () => {
      requestA.reject(new Error('A late failure'));
      requestB.resolve({ ...toolDetail('available'), reason: 'B response' });
      await Promise.allSettled([requestA.promise, requestB.promise]);
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.response?.reason).toBe('B response');
    expect(result.current.error).toBeNull();
  });

  it('卸载时 abort 当前请求', async () => {
    const pendingRequest = deferred<TrajectoryNodeDetailResponse>();
    let signal: AbortSignal | undefined;
    getTrajectoryToolNodeDetailMock.mockImplementation(
      (_: string, __: string, ___: string, requestSignal: AbortSignal) => {
        signal = requestSignal;
        return pendingRequest.promise;
      },
    );
    const { unmount } = renderHook(() => useTrajectoryToolNodeDetail(toolIdentity('tool-a'), true));
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(1));

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('retry 只重试当前 identity', async () => {
    const requestB = deferred<TrajectoryNodeDetailResponse>();
    getTrajectoryToolNodeDetailMock
      .mockResolvedValueOnce(toolDetail('available'))
      .mockRejectedValueOnce(new Error('B failed'))
      .mockReturnValueOnce(requestB.promise);
    const { result, rerender } = renderHook(
      ({ identity }) => useTrajectoryToolNodeDetail(identity, true),
      { initialProps: { identity: toolIdentity('tool-a') } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ identity: toolIdentity('tool-b') });
    await waitFor(() => expect(result.current.status).toBe('failed'));
    act(() => result.current.retry());
    await waitFor(() => expect(getTrajectoryToolNodeDetailMock).toHaveBeenCalledTimes(3));

    expect(getTrajectoryToolNodeDetailMock.mock.calls.map(call => call[2]))
      .toEqual(['tool-a', 'tool-b', 'tool-b']);
    await act(async () => {
      requestB.resolve({ ...toolDetail('available'), reason: 'B retry' });
      await requestB.promise;
    });
    await waitFor(() => expect(result.current.response?.reason).toBe('B retry'));
  });

  it.each(['available', 'pending', 'not_recorded', 'degraded'] as const)(
    '%s 是 ready 的业务响应，不混同传输失败',
    async status => {
      getTrajectoryToolNodeDetailMock.mockResolvedValue(toolDetail(status));
      const { result } = renderHook(() => useTrajectoryToolNodeDetail(toolIdentity(`tool-${status}`), true));

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(result.current.response?.status).toBe(status);
      expect(result.current.error).toBeNull();
    },
  );

  it('当前 identity 请求失败时不保留上个节点数据', async () => {
    getTrajectoryToolNodeDetailMock
      .mockResolvedValueOnce(toolDetail('available'))
      .mockRejectedValueOnce(new Error('network unavailable'));
    const { result, rerender } = renderHook(
      ({ identity }) => useTrajectoryToolNodeDetail(identity, true),
      { initialProps: { identity: toolIdentity('tool-a') } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.response?.detail?.tool_call_id).toBe('tool-a');

    rerender({ identity: toolIdentity('tool-b') });
    await waitFor(() => expect(result.current.status).toBe('failed'));

    expect(result.current.response).toBeNull();
    expect(result.current.error).toBe('加载工具详情失败，请稍后重试');
  });
});
