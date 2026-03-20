import { useEffect, useMemo, useRef, useState } from 'react';

import type { Message } from '@/types/conversation';

const COMPLETION_VISIBILITY_MS = 2500;

export function useTransientCompletionState(options: {
  isStreaming: boolean;
  isLoadingQuestions: boolean;
  messages: Message[];
}) {
  const { isStreaming, isLoadingQuestions, messages } = options;
  const [showCompletionState, setShowCompletionState] = useState(false);
  const previousStreamingRef = useRef(isStreaming);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasCompletedAssistantMessage = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    return lastMessage?.role === 'assistant' && Boolean(lastMessage.content?.trim());
  }, [messages]);

  useEffect(() => {
    const wasStreaming = previousStreamingRef.current;
    previousStreamingRef.current = isStreaming;

    if (isStreaming) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setShowCompletionState(false);
      return;
    }

    if (!wasStreaming || !hasCompletedAssistantMessage || isLoadingQuestions) {
      return;
    }

    setShowCompletionState(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setShowCompletionState(false);
    }, COMPLETION_VISIBILITY_MS);
  }, [hasCompletedAssistantMessage, isLoadingQuestions, isStreaming]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  return showCompletionState;
}
