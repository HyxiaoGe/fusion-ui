import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSuggestedQuestionContinuation } from './useSuggestedQuestionContinuation';

describe('useSuggestedQuestionContinuation', () => {
  it('clears questions, scrolls, and sends a trimmed follow-up', () => {
    const clearQuestions = vi.fn();
    const sendMessage = vi.fn();
    const scrollIntoView = vi.fn();
    const scrollTargetRef = {
      current: {
        scrollIntoView,
      } as unknown as HTMLElement,
    };

    const { result } = renderHook(() =>
      useSuggestedQuestionContinuation({
        canContinue: true,
        clearQuestions,
        sendMessage,
        scrollTargetRef,
      })
    );

    result.current('  继续说说这个点  ');

    expect(clearQuestions).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'end',
    });
    expect(sendMessage).toHaveBeenCalledWith('继续说说这个点');
  });

  it('does nothing when continuation is not allowed', () => {
    const clearQuestions = vi.fn();
    const sendMessage = vi.fn();

    const { result } = renderHook(() =>
      useSuggestedQuestionContinuation({
        canContinue: false,
        clearQuestions,
        sendMessage,
      })
    );

    result.current('继续');

    expect(clearQuestions).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing for empty follow-up text', () => {
    const clearQuestions = vi.fn();
    const sendMessage = vi.fn();

    const { result } = renderHook(() =>
      useSuggestedQuestionContinuation({
        canContinue: true,
        clearQuestions,
        sendMessage,
      })
    );

    result.current('   ');

    expect(clearQuestions).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
