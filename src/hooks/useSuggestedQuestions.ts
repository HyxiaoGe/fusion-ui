import { useState, useCallback, useEffect, useRef } from 'react';
import { store } from '@/redux/store';
import { fetchSuggestedQuestions as fetchApi } from '@/lib/api/chat';

export const useSuggestedQuestions = (chatId: string | null) => {
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const requestIdRef = useRef(0);
  const lastFetchKeyRef = useRef<string | null>(null);

  // Clear questions when the chat changes
  useEffect(() => {
    requestIdRef.current += 1;
    lastFetchKeyRef.current = null;
    setIsLoadingQuestions(false);
    setSuggestedQuestions([]);
  }, [chatId]);

  const fetchQuestions = useCallback(async (forceRefresh: boolean = false) => {
    if (!chatId) {
      setSuggestedQuestions([]);
      setIsLoadingQuestions(false);
      return;
    }

    // Directly get the latest state from the store to avoid stale closures
    const state = store.getState().chat;
    const chat = state.chats.find(c => c.id === chatId);
    const isStreaming = state.isStreaming;
    const requestId = requestIdRef.current + 1;

    if (!chat) {
      setSuggestedQuestions([]);
      return;
    }

    const hasAIMessage = chat.messages.some(msg => msg.role === 'assistant' && msg.content?.trim());
    if (!hasAIMessage) {
      setSuggestedQuestions([]);
      return;
    }

    const fetchKey = `${chatId}:${chat.messages.length}`;
    if (!forceRefresh && lastFetchKeyRef.current === fetchKey) {
      return;
    }
    
    if (isStreaming) {
      setIsLoadingQuestions(false);
      return;
    }

    if (isLoadingQuestions && !forceRefresh) {
      return;
    }

    requestIdRef.current = requestId;
    setIsLoadingQuestions(true);
    try {
      const messageCount = chat.messages.length || 0;
      const { questions } = await fetchApi(chatId, {}, forceRefresh, messageCount);
      if (requestId !== requestIdRef.current) {
        return;
      }
      lastFetchKeyRef.current = fetchKey;
      setSuggestedQuestions(questions);
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setSuggestedQuestions([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoadingQuestions(false);
      }
    }
  }, [chatId, isLoadingQuestions]);

  const clearQuestions = useCallback(() => {
    requestIdRef.current += 1;
    setIsLoadingQuestions(false);
    setSuggestedQuestions([]);
  }, []);

  return {
    suggestedQuestions,
    isLoadingQuestions,
    fetchQuestions,
    clearQuestions,
  };
}; 
