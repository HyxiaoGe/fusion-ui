import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTransientCompletionState } from './useTransientCompletionState';
import type { Message } from '@/types/conversation';

describe('useTransientCompletionState', () => {
  it('only becomes visible after streaming transitions to complete', async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ isStreaming, isLoadingQuestions, messages }) =>
        useTransientCompletionState({ isStreaming, isLoadingQuestions, messages }),
      {
        initialProps: {
          isStreaming: true,
          isLoadingQuestions: false,
          messages: [{ id: 'assistant-1', role: 'assistant', content: '回复完成' }] as Message[],
        },
      }
    );

    expect(result.current).toBe(false);

    rerender({
      isStreaming: false,
      isLoadingQuestions: false,
      messages: [{ id: 'assistant-1', role: 'assistant', content: '回复完成' }] as Message[],
    });

    expect(result.current).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(result.current).toBe(false);

    vi.useRealTimers();
  });

  it('stays hidden on historical pages that did not just finish streaming', () => {
    const { result } = renderHook(() =>
      useTransientCompletionState({
        isStreaming: false,
        isLoadingQuestions: false,
        messages: [{ id: 'assistant-1', role: 'assistant', content: '旧回复' }] as Message[],
      })
    );

    expect(result.current).toBe(false);
  });
});
