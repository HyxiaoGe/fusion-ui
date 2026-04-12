// src/hooks/useTypewriter.ts
import { useRef, useCallback } from 'react';
import { useAppDispatch } from '@/redux/hooks';
import { useStore } from 'react-redux';
import { advanceTypewriter } from '@/redux/slices/streamSlice';
import type { StreamState } from '@/redux/slices/streamSlice';

const TYPEWRITER_CHARS_PER_TICK = 4;
const TYPEWRITER_TICK_MS = 30;

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

  const start = useCallback((onCatchUp: () => void) => {
    if (intervalRef.current !== null) return;

    catchUpRef.current = onCatchUp;
    intervalRef.current = setInterval(() => {
      const streamState = (store.getState() as { stream: StreamState }).stream;
      if (streamState.displayedTextLength < streamState.totalTextLength) {
        dispatch(advanceTypewriter(TYPEWRITER_CHARS_PER_TICK));
      }

      const updated = (store.getState() as { stream: StreamState }).stream;
      if (networkDoneRef.current && updated.displayedTextLength >= updated.totalTextLength) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        catchUpRef.current?.();
      }
    }, TYPEWRITER_TICK_MS);
  }, [dispatch, store]);

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
    if (intervalRef.current === null) {
      catchUpRef.current?.();
    }
  }, []);

  return { start, stop, markNetworkDone };
}
