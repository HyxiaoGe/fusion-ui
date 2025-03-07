import { chatStore, settingsStore } from './chatStore';
import { AppDispatch } from '@/redux/store';
import { setAllChats, setActiveChat } from '@/redux/slices/chatSlice';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { setUserAvatar, setAssistantAvatar } from '@/redux/slices/settingsSlice';
import { updateModelConfig } from '@/redux/slices/modelsSlice';

/**
 * 从IndexedDB加载数据并初始化Redux状态
 */
export async function initializeStoreFromDB(dispatch: AppDispatch): Promise<void> {
  try {
    console.log('开始从数据库加载数据...');
    
    // 加载所有聊天记录
    const chats = await chatStore.getAllChats();
    if (chats.length > 0) {
      dispatch(setAllChats(chats));
      
      // 设置最新的聊天为活动聊天
      const latestChat = chats.reduce((latest, chat) => {
        return chat.updatedAt > latest.updatedAt ? chat : latest;
      }, chats[0]);
      
      dispatch(setActiveChat(latestChat.id));
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
    
    // 加载所有模型配置
    const allSettings = await settingsStore.getAllSettings();
    for (const [key, value] of Object.entries(allSettings)) {
      if (key.startsWith('modelConfig_')) {
        const modelId = key.replace('modelConfig_', '');
        dispatch(updateModelConfig({
          modelId,
          config: value
        }));
      }
    }
    
    console.log('数据库数据加载完成');
  } catch (error) {
    console.error('从数据库加载数据失败:', error);
  }
}

export default initializeStoreFromDB;