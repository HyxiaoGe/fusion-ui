import db, { chatStore, settingsStore } from '@/lib/db/chatStore';
import {
  addMessage,
  Chat,
  clearMessages,
  createChat,
  deleteChat,
  endStreaming,
  Message,
  updateChatModel,
  updateChatTitle,
  updateStreamingContent
} from '@/redux/slices/chatSlice';
import {
  updateModelConfig
} from '@/redux/slices/modelsSlice';
import {
  setAssistantAvatar,
  setUserAvatar
} from '@/redux/slices/settingsSlice';
import {
  setThemeMode
} from '@/redux/slices/themeSlice';
import { Middleware } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import { setContextMaxItems, toggleContextEnhancement } from '../slices/searchSlice';

// 创建持久化中间件
export const persistMiddleware: Middleware = store => next => action => {
  // 先执行原始action
  const result = next(action);
  // 添加节流功能
  let lastStreamingSaveTime = 0;
  const STREAMING_SAVE_INTERVAL = 2000; // 每2秒最多保存一次流式消息
  
  // 根据action类型进行持久化
  // 注意：处理是异步的，但我们不等待它完成
  (async () => {
    try {
      const { type, payload } = action as { type: string; payload: any };
      
      // 处理聊天相关action
      if (createChat.match(action)) {
        const state = store.getState();
        const chat = state.chat.chats.find((c: Chat) => c.id === payload.modelId);
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
            const chat = state.chat.chats.find((c: Chat) => c.id === chatId);
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
          const chat = state.chat.chats.find((c: Chat) => c.id === chatId);
          if (chat) {
            await chatStore.saveChat(chat);
          }
        }
      }
      else if (updateStreamingContent.match(action)) {
        // 使用节流技术减少流式消息的写入频率
        const currentTime = Date.now();
        if (currentTime - lastStreamingSaveTime > STREAMING_SAVE_INTERVAL) {
          lastStreamingSaveTime = currentTime;
          const { chatId, content } = action.payload;
          const state = store.getState();
          const streamingMessageId = state.chat.streamingMessageId;
          
          if (streamingMessageId) {
            // 更新已有消息，而不是添加新消息
            try {
              const message = {
                id: streamingMessageId,
                chatId: chatId,
                role: 'assistant',
                content: content,
                timestamp: currentTime
              };
              
              // 使用update而非add，避免主键冲突
              await db.messages.update(streamingMessageId, {
                content: content
              });
            } catch (error) {
              console.error('保存流式消息时出错:', error);
              // 错误不会中断用户体验
            }
          }
        }
      } 
      else if (endStreaming.match(action)) {
        // 流式结束后，确保最后的消息被保存
        const state = store.getState();
        const activeChatId = state.chat.activeChatId;
        const streamingMessageId = state.chat.streamingMessageId;
        
        if (activeChatId && streamingMessageId) {
          try {
            const chat = state.chat.chats.find((c: Chat) => c.id === activeChatId);
            const message = chat?.messages.find((m: Message) => m.id === streamingMessageId);
            
            if (message) {
              // 更新消息内容
              await db.messages.update(streamingMessageId, {
                content: message.content
              });
              
              // 更新聊天的updatedAt
              await db.chats.update(activeChatId, {
                updatedAt: Date.now()
              });
            }
          } catch (error) {
            console.error('保存最终流式消息时出错:', error);
          }
        }
      }
      else if (updateChatModel.match(action)) {
        const state = store.getState();
        const chat = state.chat.chats.find((c: Chat) => c.id === payload.chatId);
        if (chat) {
          await chatStore.saveChat(chat);
        }
      }
      else if (updateChatTitle.match(action)) {
        const state = store.getState();
        const chat = state.chat.chats.find((c: Chat) => c.id === payload.chatId);
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
      else if (toggleContextEnhancement.match(action)) {
        await settingsStore.saveSetting('contextEnhancementEnabled', action.payload);
      }
      else if (setContextMaxItems.match(action)) {
        await settingsStore.saveSetting('contextMaxItems', action.payload);
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