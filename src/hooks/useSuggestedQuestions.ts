import { useState, useCallback, useEffect } from 'react';
import { store } from '@/redux/store';
import { fetchSuggestedQuestions as fetchApi } from '@/lib/api/chat';

export const useSuggestedQuestions = (chatId: string | null) => {
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);

  // Clear questions when the chat changes
  useEffect(() => {
    setSuggestedQuestions([]);
  }, [chatId]);

  const fetchQuestions = useCallback(async (forceRefresh: boolean = false) => {
    console.log('[useSuggestedQuestions] fetchQuestions called, chatId:', chatId, 'forceRefresh:', forceRefresh);
    
    if (!chatId) {
      console.log('[useSuggestedQuestions] No chatId, aborting');
      return;
    }

    // Directly get the latest state from the store to avoid stale closures
    const state = store.getState().chat;
    const chat = state.chats.find(c => c.id === chatId);
    const isStreaming = state.isStreaming;

    if (!chat) {
      console.error(`[useSuggestedQuestions] Aborting: Chat with id ${chatId} not found.`);
      return;
    }

    const hasAIMessage = chat.messages.some(msg => msg.role === 'assistant' && msg.content?.trim());
    console.log('[useSuggestedQuestions] hasAIMessage:', hasAIMessage, 'message count:', chat.messages.length);
    
    // Do not fetch questions if a stream is in progress.
    if (isStreaming) {
      console.log('[useSuggestedQuestions] Stream is in progress, aborting');
      return;
    }

    console.log('[useSuggestedQuestions] Fetching suggested questions from API...');
    setIsLoadingQuestions(true);
    try {
      const messageCount = chat.messages.length || 0;
      const { questions } = await fetchApi(chatId, {}, forceRefresh, messageCount);
      console.log('[useSuggestedQuestions] Received questions:', questions);
      setSuggestedQuestions(questions);
    } catch (error) {
      console.error('Error fetching suggested questions:', error);
      setSuggestedQuestions([]);
    } finally {
      setIsLoadingQuestions(false);
    }
  }, [chatId]);

  const clearQuestions = useCallback(() => {
    setSuggestedQuestions([]);
  }, []);

  return {
    suggestedQuestions,
    isLoadingQuestions,
    fetchQuestions,
    clearQuestions,
  };
}; 