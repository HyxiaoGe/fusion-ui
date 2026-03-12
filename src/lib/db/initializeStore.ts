import db, { chatStore, settingsStore } from './chatStore';
import { AppDispatch } from '@/redux/store';
import { setAllChats, setActiveChat } from '@/redux/slices/chatSlice';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { setUserAvatar, setAssistantAvatar } from '@/redux/slices/settingsSlice';

interface InitializeStoreOptions {
  includeChats?: boolean;
}

/**
 * 从 IndexedDB 加载设置；聊天数据仅在显式要求时才回灌到 Redux。
 */
export async function initializeStoreFromDB(
  dispatch: AppDispatch,
  options: InitializeStoreOptions = {}
): Promise<void> {
  const { includeChats = false } = options;

  try {
    // 检查数据库是否已经打开
    if (!db.isOpen()) {
      await db.open();
    }

    if (includeChats) {
      const chatCount = await db.chats.count();

      if (chatCount === 0) {
        dispatch(setAllChats([]));
        dispatch(setActiveChat(null));
      } else {
        const chats = await chatStore.getAllChats();
        if (chats.length > 0) {
          const deduplicatedChats = chats.map(chat => {
            const uniqueMessages = new Map();
            chat.messages.forEach(msg => {
              const key = `${msg.role}:${msg.content}`;
              if (!uniqueMessages.has(key)) {
                uniqueMessages.set(key, {
                  ...msg,
                  reasoning: msg.reasoning || '',
                  isReasoningVisible: msg.isReasoningVisible || false
                });
              }
            });

            return {
              ...chat,
              messages: Array.from(uniqueMessages.values())
            };
          });

          dispatch(setAllChats(deduplicatedChats));

          const latestChat = deduplicatedChats.reduce((latest, chat) => {
            return chat.updatedAt > latest.updatedAt ? chat : latest;
          }, deduplicatedChats[0]);

          dispatch(setActiveChat(latestChat.id));
        }
      }
    }

    // 加载主题设置
    const themeMode = await settingsStore.getSetting('themeMode');
    if (themeMode) {
      dispatch(setThemeMode(themeMode));
    }
    
    // 加载头像设置
    const userAvatar = await settingsStore.getSetting('userAvatar');
    if (userAvatar) {
      dispatch(setUserAvatar(userAvatar));
    }
    
    const assistantAvatar = await settingsStore.getSetting('assistantAvatar');
    if (assistantAvatar) {
      dispatch(setAssistantAvatar(assistantAvatar));
    }
    
  } catch (error) {
    console.error('从数据库加载数据失败:', error);
  }
}

export default initializeStoreFromDB;
