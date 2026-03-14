import { RefObject, useCallback } from 'react';

type UseSuggestedQuestionContinuationOptions = {
  canContinue: boolean;
  clearQuestions: () => void;
  sendMessage: (question: string) => void;
  scrollTargetRef?: RefObject<HTMLElement | null>;
};

export const useSuggestedQuestionContinuation = ({
  canContinue,
  clearQuestions,
  sendMessage,
  scrollTargetRef,
}: UseSuggestedQuestionContinuationOptions) =>
  useCallback(
    (question: string) => {
      const normalizedQuestion = question.trim();
      if (!canContinue || !normalizedQuestion) {
        return;
      }

      clearQuestions();
      scrollTargetRef?.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
      sendMessage(normalizedQuestion);
    },
    [canContinue, clearQuestions, scrollTargetRef, sendMessage]
  );
