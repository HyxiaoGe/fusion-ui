import db, { chatStore, settingsStore } from './chatStore';
import { AppDispatch } from '@/redux/store';
import { setAllChats, setActiveChat } from '@/redux/slices/chatSlice';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { setUserAvatar, setAssistantAvatar } from '@/redux/slices/settingsSlice';
import { updateModelConfig } from '@/redux/slices/modelsSlice';
import {
  toggleContextEnhancement,
  setContextMaxItems
} from '@/redux/slices/searchSlice';

/**
 * 从IndexedDB加载数据并初始化Redux状态
 */
export async function initializeStoreFromDB(dispatch: AppDispatch): Promise<void> {
  try {
    console.log('开始从数据库加载数据...');

    // 检查数据库是否已经打开
    if (!db.isOpen()) {
      await db.open();
    }
    
    // 检查chats表是否为空
    const chatCount = await db.chats.count();
    
    if (chatCount === 0) {
      // 数据库为空，确保Redux状态也是空的
      dispatch(setAllChats([]));
      dispatch(setActiveChat(null));
      console.log('数据库为空，已重置Redux状态');
      return;
    }

    // 加载所有聊天记录
    const chats = await chatStore.getAllChats();
    if (chats.length > 0) {
      // 对每个聊天的消息进行去重处理
      const deduplicatedChats = chats.map(chat => {
        // 使用Map按消息内容去重
        const uniqueMessages = new Map();
        chat.messages.forEach(msg => {
          const key = `${msg.role}:${msg.content}`;
          if (!uniqueMessages.has(key)) {
            uniqueMessages.set(key, msg);
          }
        });
        
        return {
          ...chat,
          messages: Array.from(uniqueMessages.values())
        };
      });
      
      dispatch(setAllChats(deduplicatedChats));
      
      // 设置最新的聊天为活动聊天
      const latestChat = deduplicatedChats.reduce((latest, chat) => {
        return chat.updatedAt > latest.updatedAt ? chat : latest;
      }, deduplicatedChats[0]);
      
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
    
    const contextEnhancementEnabled = await settingsStore.getSetting('contextEnhancementEnabled');
    if (contextEnhancementEnabled !== null) {
      dispatch(toggleContextEnhancement(contextEnhancementEnabled));
    }
    
    const contextMaxItems = await settingsStore.getSetting('contextMaxItems');
    if (contextMaxItems !== null) {
      dispatch(setContextMaxItems(contextMaxItems));
    }

    console.log('数据库数据加载完成');
  } catch (error) {
    console.error('从数据库加载数据失败:', error);
  }
}

export default initializeStoreFromDB;