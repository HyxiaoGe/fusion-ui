import { chatStore, settingsStore } from '@/lib/db/chatStore';
import {
  clearConversationMessages,
  removeConversation,
  updateConversationModel,
  updateConversationTitle,
} from '@/redux/slices/conversationSlice';
import {
  setAssistantAvatar,
  setUserAvatar
} from '@/redux/slices/settingsSlice';
import {
  setThemeMode
} from '@/redux/slices/themeSlice';
import { Middleware } from '@reduxjs/toolkit';

// 创建持久化中间件
export const persistMiddleware: Middleware = store => next => action => {
  // 先执行原始action
  const result = next(action);
  
  // 根据action类型进行持久化
  // 注意：处理是异步的，但我们不等待它完成
  (async () => {
    try {
      const { payload } = action as { payload: any };
      
      // 处理聊天相关action
      if (removeConversation.match(action)) {
        await chatStore.deleteChat(payload);
      }
      else if (updateConversationModel.match(action)) {
        const state = store.getState();
        const conversation = state.conversation.byId[payload.id];
        if (conversation) {
          await chatStore.saveChat(conversation);
        }
      }
      else if (updateConversationTitle.match(action)) {
        const state = store.getState();
        const conversation = state.conversation.byId[payload.id];
        if (conversation) {
          await chatStore.saveChat(conversation);
        }
      }
      else if (clearConversationMessages.match(action)) {
        await chatStore.clearMessages(payload);
      }
      // 处理设置相关action
      else if (setThemeMode.match(action)) {
        await settingsStore.saveSetting('themeMode', payload);
      }
      else if (setUserAvatar.match(action)) {
        await settingsStore.saveSetting('userAvatar', payload);
      }
      else if (setAssistantAvatar.match(action)) {
        await settingsStore.saveSetting('assistantAvatar', payload);
      }
    } catch (error) {
      console.error('持久化数据时出错:', error);
    }
  })();
  
  return result;
};

export default persistMiddleware;
