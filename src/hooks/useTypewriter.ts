// src/hooks/useTypewriter.ts
import { useRef, useCallback } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { useStore } from 'react-redux';
import { advanceTypewriter } from '@/redux/slices/streamSlice';
import type { StreamState } from '@/redux/slices/streamSlice';

const TYPEWRITER_BASE_CHARS_PER_TICK = 4;
const TYPEWRITER_TICK_MS = 30;
const TYPEWRITER_STREAM_TARGET_TICKS = 60;
const TYPEWRITER_CATCH_UP_TARGET_TICKS = 12;
const TYPEWRITER_MAX_STREAM_CHARS_PER_TICK = 32;
export const TYPEWRITER_MAX_CATCH_UP_CHARS_PER_TICK = 192;

interface TypewriterAdvanceInput {
  backlog: number;
  networkDone: boolean;
}

/**
 * 小 backlog 保持逐字平滑；积压增大时按目标 tick 数自适应提速。
 * 网络完成后使用更短的追赶窗口，同时用硬上限避免单帧清空长回答。
 */
export function calculateTypewriterAdvance({
  backlog,
  networkDone,
}: TypewriterAdvanceInput): number {
  const safeBacklog = Math.max(0, Math.floor(backlog));
  if (safeBacklog === 0) return 0;

  const targetTicks = networkDone
    ? TYPEWRITER_CATCH_UP_TARGET_TICKS
    : TYPEWRITER_STREAM_TARGET_TICKS;
  const maxAdvance = networkDone
    ? TYPEWRITER_MAX_CATCH_UP_CHARS_PER_TICK
    : TYPEWRITER_MAX_STREAM_CHARS_PER_TICK;
  const adaptiveAdvance = Math.max(
    TYPEWRITER_BASE_CHARS_PER_TICK,
    Math.ceil(safeBacklog / targetTicks),
  );

  return Math.min(safeBacklog, adaptiveAdvance, maxAdvance);
}

/**
 * 打字机效果 hook：定时推进 displayedTextLength，
 * 当网络完成且显示追上时调用 onCatchUp 回调。
 */
export function useTypewriter() {
  const dispatch = useAppDispatch();
  const store = useStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const catchUpRef = useRef<(() => void) | null>(null);
  const networkDoneRef = useRef(false);

  const finishCatchUp = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const onCatchUp = catchUpRef.current;
    catchUpRef.current = null;
    networkDoneRef.current = false;
    onCatchUp?.();
  }, []);

  const start = useCallback((onCatchUp: () => void) => {
    if (intervalRef.current !== null) return;

    catchUpRef.current = onCatchUp;
    intervalRef.current = setInterval(() => {
      const streamState = (store.getState() as { stream: StreamState }).stream;
      const backlog = streamState.totalTextLength - streamState.displayedTextLength;
      const advance = calculateTypewriterAdvance({
        backlog,
        networkDone: networkDoneRef.current,
      });
      if (advance > 0) {
        dispatch(advanceTypewriter(advance));
      }

      const updated = (store.getState() as { stream: StreamState }).stream;
      if (networkDoneRef.current && updated.displayedTextLength >= updated.totalTextLength) {
        finishCatchUp();
      }
    }, TYPEWRITER_TICK_MS);
  }, [dispatch, finishCatchUp, store]);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    networkDoneRef.current = false;
    catchUpRef.current = null;
  }, []);

  const markNetworkDone = useCallback(() => {
    networkDoneRef.current = true;
    // 如果打字机还没启动（无文本内容），直接触发 catchUp
    if (intervalRef.current === null && catchUpRef.current !== null) {
      finishCatchUp();
    }
  }, [finishCatchUp]);

  return { start, stop, markNetworkDone };
}
