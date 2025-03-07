import Dexie, { Table } from 'dexie';
import { Chat, Message } from '@/redux/slices/chatSlice';
import { v4 as uuidv4 } from 'uuid';

// 定义数据库架构
class ChatDatabase extends Dexie {
  chats!: Table<Chat, string>;
  messages!: Table<Message, string>;
  settings!: Table<{ id: string; value: any }, string>;

  constructor() {
    super('ai-assistant-db');
    
    // 定义数据库结构
    this.version(1).stores({
      chats: 'id, modelId, createdAt, updatedAt',
      messages: 'id, chatId, role, timestamp, [chatId+timestamp]',
      settings: 'id'
    });
  }
}

// 创建数据库实例
const db = new ChatDatabase();

// 聊天操作
export const chatStore = {
  // 保存整个聊天
  async saveChat(chat: Chat): Promise<void> {
    try {
      // 获取现有的聊天记录
      const existingChat = await db.chats.get(chat.id);
      
      // 如果聊天记录存在，更新它；否则，添加新的
      if (existingChat) {
        await db.chats.update(chat.id, {
          title: chat.title,
          modelId: chat.modelId,
          updatedAt: chat.updatedAt
        });
      } else {
        await db.chats.add(chat);
      }
      
      // 保存聊天消息
      if (chat.messages && chat.messages.length > 0) {
        // 为每条消息加上chatId引用
        const messagesWithChatId = chat.messages.map(msg => ({
          ...msg,
          chatId: chat.id
        }));
        
        // 批量保存消息
        await db.messages.bulkPut(messagesWithChatId);
      }
    } catch (error) {
      console.error('保存聊天失败:', error);
      throw error;
    }
  },
  
  // 获取所有聊天
  async getAllChats(): Promise<Chat[]> {
    try {
      // 获取所有聊天基本信息
      const chats = await db.chats.toArray();
      
      // 为每个聊天加载消息
      const chatsWithMessages = await Promise.all(
        chats.map(async (chat) => {
          const messages = await db.messages
            .where('chatId')
            .equals(chat.id)
            .sortBy('timestamp');
          
          return {
            ...chat,
            messages
          };
        })
      );
      
      return chatsWithMessages;
    } catch (error) {
      console.error('获取所有聊天失败:', error);
      throw error;
    }
  },
  
  // 根据ID获取聊天
  async getChatById(chatId: string): Promise<Chat | undefined> {
    try {
      // 获取聊天基本信息
      const chat = await db.chats.get(chatId);
      if (!chat) return undefined;
      
      // 加载聊天消息
      const messages = await db.messages
        .where('chatId')
        .equals(chatId)
        .sortBy('timestamp');
      
      return {
        ...chat,
        messages
      };
    } catch (error) {
      console.error(`获取聊天ID ${chatId} 失败:`, error);
      throw error;
    }
  },
  
  // 删除聊天
  async deleteChat(chatId: string): Promise<void> {
    try {
      // 开始事务，同时删除聊天和相关消息
      await db.transaction('rw', [db.chats, db.messages], async () => {
        // 删除聊天记录
        await db.chats.delete(chatId);
        
        // 删除相关消息
        await db.messages.where('chatId').equals(chatId).delete();
      });
    } catch (error) {
      console.error(`删除聊天ID ${chatId} 失败:`, error);
      throw error;
    }
  },
  
  // 添加消息到聊天
  async addMessage(chatId: string, message: Message): Promise<void> {
    try {
      // 设置消息的chatId
      const messageWithChatId = {
        ...message,
        chatId,
        id: message.id || uuidv4()
      };
      
      // 保存消息
      await db.messages.add(messageWithChatId);
      
      // 更新聊天的updatedAt时间
      await db.chats.update(chatId, {
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error(`添加消息到聊天ID ${chatId} 失败:`, error);
      throw error;
    }
  },
  
  // 清空指定聊天的所有消息
  async clearMessages(chatId: string): Promise<void> {
    try {
      await db.messages.where('chatId').equals(chatId).delete();
    } catch (error) {
      console.error(`清空聊天ID ${chatId} 的消息失败:`, error);
      throw error;
    }
  }
};

// 设置操作
export const settingsStore = {
  // 保存设置
  async saveSetting(id: string, value: any): Promise<void> {
    try {
      await db.settings.put({ id, value });
    } catch (error) {
      console.error(`保存设置 ${id} 失败:`, error);
      throw error;
    }
  },
  
  // 获取设置
  async getSetting(id: string): Promise<any> {
    try {
      const setting = await db.settings.get(id);
      return setting?.value;
    } catch (error) {
      console.error(`获取设置 ${id} 失败:`, error);
      throw error;
    }
  },
  
  // 获取所有设置
  async getAllSettings(): Promise<Record<string, any>> {
    try {
      const settings = await db.settings.toArray();
      return settings.reduce((acc, setting) => {
        acc[setting.id] = setting.value;
        return acc;
      }, {} as Record<string, any>);
    } catch (error) {
      console.error('获取所有设置失败:', error);
      throw error;
    }
  }
};

export default db;