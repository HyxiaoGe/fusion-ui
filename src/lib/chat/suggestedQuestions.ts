import { store } from '@/redux/store';
import { fetchSuggestedQuestions } from '@/lib/api/chat';
import { Dispatch, SetStateAction } from 'react';

/**
 * Fetches suggested questions for a chat and updates the component's state.
 * @param chatId The ID of the chat.
 * @param forceRefresh Whether to force a refresh, ignoring cache.
 * @param setIsLoading The state setter for the loading status.
 * @param setQuestions The state setter for the suggested questions.
 */
export const getAndSetSuggestedQuestions = async (
    chatId: string,
    forceRefresh: boolean,
    setIsLoading: Dispatch<SetStateAction<boolean>>,
    setQuestions: Dispatch<SetStateAction<string[]>>
) => {
    console.log(`[getAndSetSuggestedQuestions] Fired for chatId: ${chatId}. Force refresh: ${forceRefresh}`);
    if (!chatId) {
        console.error('[getAndSetSuggestedQuestions] Aborting: No chatId provided.');
        return;
    }

    const currentChats = store.getState().chat.chats;
    const chat = currentChats.find(c => c.id === chatId);

    if (!chat) {
        console.error(`[getAndSetSuggestedQuestions] Aborting: Chat with id ${chatId} not found in store.`);
        console.log(`[getAndSetSuggestedQuestions] Available chat IDs: ${currentChats.map(c => c.id).join(', ')}`);
        return;
    }

    const hasAIMessage = chat.messages.some(msg => msg.role === 'assistant' && msg.content && msg.content.trim() !== '');
    
    console.log(`[getAndSetSuggestedQuestions] Checking for AI message with content in chat ${chatId}. Result: ${hasAIMessage}`);

    if (!hasAIMessage) {
        console.warn(`[getAndSetSuggestedQuestions] Aborting: No assistant message with content found for chat ${chatId}.`);
        return;
    }

    console.log(`[getAndSetSuggestedQuestions] Proceeding to fetch questions for chat ${chatId}.`);
    setIsLoading(true);
    try {
        const messageCount = chat?.messages.length || 0;
        const { questions } = await fetchSuggestedQuestions(chatId, {}, forceRefresh, messageCount);
        setQuestions(questions);
    } catch (error) {
        console.error('获取推荐问题错误:', error);
        setQuestions([]);
    } finally {
        setIsLoading(false);
    }
}; 