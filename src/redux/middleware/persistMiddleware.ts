import { v4 as uuidv4 } from 'uuid';
import { Middleware } from '@reduxjs/toolkit';
import { chatStore, settingsStore } from '@/lib/db/chatStore';
import { 
  addMessage, 
  createChat, 
  deleteChat, 
  updateChatTitle,
  clearMessages
} from '@/redux/slices/chatSlice';
import { 
  setThemeMode 
} from '@/redux/slices/themeSlice';
import {
  setUserAvatar,
  setAssistantAvatar
} from '@/redux/slices/settingsSlice';
import { 
  updateModelConfig 
} from '@/redux/slices/modelsSlice';

// 创建持久化中间件
export const persistMiddleware: Middleware = store => next => action => {
  // 先执行原始action
  const result = next(action);
  
  // 根据action类型进行持久化
  // 注意：处理是异步的，但我们不等待它完成
  (async () => {
    try {
      const { type, payload } = action;
      
      // 处理聊天相关action
      if (createChat.match(action)) {
        const state = store.getState();
        const chat = state.chat.chats.find(c => c.id === payload.modelId);
        if (chat) {
          await chatStore.saveChat(chat);
        }
      }
      else if (deleteChat.match(action)) {
        await chatStore.deleteChat(payload);
      }
      else if (addMessage.match(action)) {
        const { chatId, message } = payload;
      
        // 确保消息有ID
        if (!message.id) {
          message.id = uuidv4();
        }
      
        // 检查消息是否重复
        try {
          const existingMessages = await chatStore.getMessagesByContent(chatId, message.role, message.content);
          
          // 如果消息不是重复的，则添加它
          if (existingMessages.length === 0) {
            // 方法1：使用addMessage添加单条消息
            await chatStore.addMessage(chatId, message);
            
            // 方法2：保存整个聊天对象（作为备份保存方式）
            const state = store.getState();
            const chat = state.chat.chats.find(c => c.id === chatId);
            if (chat) {
              await chatStore.saveChat(chat);
            }
          } else {
            console.log('跳过重复消息:', message.content.substring(0, 30) + '...');
          }
        } catch (error) {
          console.error('检查或保存消息时出错:', error);
          // 出错时，仍然尝试保存聊天对象作为备份
          const state = store.getState();
          const chat = state.chat.chats.find(c => c.id === chatId);
          if (chat) {
            await chatStore.saveChat(chat);
          }
        }
      }
      else if (updateChatTitle.match(action)) {
        const state = store.getState();
        const chat = state.chat.chats.find(c => c.id === payload.chatId);
        if (chat) {
          await chatStore.saveChat(chat);
        }
      }
      else if (clearMessages.match(action)) {
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
      
      // 处理模型相关action
      else if (updateModelConfig.match(action)) {
        const { modelId, config } = payload;
        await settingsStore.saveSetting(`modelConfig_${modelId}`, config);
      }
    } catch (error) {
      console.error('持久化数据时出错:', error);
    }
  })();
  
  return result;
};

export default persistMiddleware;