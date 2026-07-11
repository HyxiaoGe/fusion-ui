import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  stream: {
    displayedTextLength: 0,
    totalTextLength: 0,
  },
}));
const dispatchMock = vi.hoisted(() => vi.fn());
const getStateMock = vi.hoisted(() => vi.fn(() => testState));

vi.mock('@/redux/hooks', () => ({
  useAppDispatch: () => dispatchMock,
}));

vi.mock('react-redux', () => ({
  useStore: () => ({ getState: getStateMock }),
}));

import {
  TYPEWRITER_MAX_CATCH_UP_CHARS_PER_TICK,
  calculateTypewriterAdvance,
  useTypewriter,
} from './useTypewriter';

describe('calculateTypewriterAdvance', () => {
  it('小 backlog 保持每 tick 4 字符的平滑速度，并且不越过剩余长度', () => {
    expect(calculateTypewriterAdvance({ backlog: 80, networkDone: false })).toBe(4);
    expect(calculateTypewriterAdvance({ backlog: 3, networkDone: false })).toBe(3);
    expect(calculateTypewriterAdvance({ backlog: 0, networkDone: false })).toBe(0);
  });

  it('网络仍在输出时只对大 backlog 温和提速并限制单 tick 上限', () => {
    expect(calculateTypewriterAdvance({ backlog: 1_200, networkDone: false })).toBe(20);
    expect(calculateTypewriterAdvance({ backlog: 100_000, networkDone: false })).toBe(32);
  });

  it('网络完成后按 backlog 快速追赶，但单 tick 不产生无上限大跳', () => {
    expect(calculateTypewriterAdvance({ backlog: 1_200, networkDone: true })).toBe(100);
    expect(calculateTypewriterAdvance({ backlog: 100_000, networkDone: true }))
      .toBe(TYPEWRITER_MAX_CATCH_UP_CHARS_PER_TICK);
  });

  it('一万字符 backlog 在有限 tick 内追平且不会单帧清空', () => {
    let backlog = 10_000;
    let ticks = 0;
    let maxAdvance = 0;

    while (backlog > 0 && ticks < 200) {
      const advance = calculateTypewriterAdvance({ backlog, networkDone: true });
      backlog -= advance;
      maxAdvance = Math.max(maxAdvance, advance);
      ticks += 1;
    }

    expect(backlog).toBe(0);
    expect(ticks).toBeLessThan(100);
    expect(ticks).toBeGreaterThan(1);
    expect(maxAdvance).toBeLessThanOrEqual(TYPEWRITER_MAX_CATCH_UP_CHARS_PER_TICK);
  });
});

describe('useTypewriter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    testState.stream.displayedTextLength = 0;
    testState.stream.totalTextLength = 0;
    getStateMock.mockClear();
    dispatchMock.mockReset();
    dispatchMock.mockImplementation((action: { type: string; payload: number }) => {
      if (action.type === 'stream/advanceTypewriter') {
        testState.stream.displayedTextLength = Math.min(
          testState.stream.displayedTextLength + action.payload,
          testState.stream.totalTextLength,
        );
      }
      return action;
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('每个 30ms tick 最多 dispatch 一次，并在 network done 后提高追赶量', () => {
    testState.stream.totalTextLength = 1_200;
    const { result } = renderHook(() => useTypewriter());

    act(() => {
      result.current.start(vi.fn());
      vi.advanceTimersByTime(30);
    });
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: 20 }),
    );

    act(() => {
      result.current.markNetworkDone();
      vi.advanceTimersByTime(30);
    });
    expect(dispatchMock).toHaveBeenCalledTimes(2);
    expect(dispatchMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: 99 }),
    );
  });

  it('追平后只调用一次首次 start 的 catchUp，并停止 interval', () => {
    testState.stream.totalTextLength = 20;
    const catchUp = vi.fn();
    const ignoredCatchUp = vi.fn();
    const { result } = renderHook(() => useTypewriter());

    act(() => {
      result.current.start(catchUp);
      result.current.start(ignoredCatchUp);
      result.current.markNetworkDone();
      vi.advanceTimersByTime(150);
    });

    expect(testState.stream.displayedTextLength).toBe(20);
    expect(dispatchMock).toHaveBeenCalledTimes(5);
    expect(catchUp).toHaveBeenCalledTimes(1);
    expect(ignoredCatchUp).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(dispatchMock).toHaveBeenCalledTimes(5);
    expect(catchUp).toHaveBeenCalledTimes(1);
  });

  it('没有 backlog 时 network done 在下一个 tick 完成且不 dispatch', () => {
    const catchUp = vi.fn();
    const { result } = renderHook(() => useTypewriter());

    act(() => {
      result.current.start(catchUp);
      result.current.markNetworkDone();
      vi.advanceTimersByTime(30);
    });

    expect(dispatchMock).not.toHaveBeenCalled();
    expect(catchUp).toHaveBeenCalledTimes(1);
  });

  it('先收到 network done 再启动时仍保留完成信号', () => {
    testState.stream.totalTextLength = 8;
    const catchUp = vi.fn();
    const { result } = renderHook(() => useTypewriter());

    act(() => {
      result.current.markNetworkDone();
      result.current.start(catchUp);
      vi.advanceTimersByTime(60);
    });

    expect(testState.stream.displayedTextLength).toBe(8);
    expect(catchUp).toHaveBeenCalledTimes(1);
  });

  it('stop 立即停止推进并清除 catchUp', () => {
    testState.stream.totalTextLength = 1_000;
    const catchUp = vi.fn();
    const { result } = renderHook(() => useTypewriter());

    act(() => {
      result.current.start(catchUp);
      vi.advanceTimersByTime(30);
      result.current.stop();
      vi.advanceTimersByTime(300);
      result.current.markNetworkDone();
    });

    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(catchUp).not.toHaveBeenCalled();
  });
});
