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

    // 升级数据库版本，添加复合索引用于消息去重
    this.version(2).stores({
      messages: 'id, chatId, role, timestamp, [chatId+timestamp], [chatId+role+content]'
    });
  }
}

// 创建数据库实例
const db = new ChatDatabase();

// 聊天操作
export const chatStore = {
  async getMessagesByContent(chatId: string, role: string, content: string): Promise<Message[]> {
    try {
      return await db.messages
        .where('chatId')
        .equals(chatId)
        .filter(msg => msg.role === role && msg.content === content)
        .toArray();
    } catch (error) {
      console.error(`查找消息失败:`, error);
      return []; // 出错时返回空数组
    }
  },
  // 保存整个聊天
  async saveChat(chat: Chat): Promise<void> {
    console.log(`尝试保存聊天 ${chat.id} 包含 ${chat.messages.length} 条消息`);
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
      
      // 保存聊天消息，但避免重复
      if (chat.messages && chat.messages.length > 0) {
        // 获取已存在的消息内容，用于去重
        const existingMessages = await db.messages
          .where('chatId')
          .equals(chat.id)
          .toArray();
        
        const existingContents = new Map();
        existingMessages.forEach(msg => {
          existingContents.set(`${msg.role}:${msg.content}`, true);
        });
        
        // 过滤出不重复的消息
        const uniqueMessages = chat.messages.filter(msg => {
          const key = `${msg.role}:${msg.content}`;
          return !existingContents.has(key);
        });
        
        if (uniqueMessages.length > 0) {
          // 为每条消息加上chatId引用
          const messagesWithChatId = uniqueMessages.map(msg => ({
            ...msg,
            chatId: chat.id
          }));
          
          // 批量保存不重复的消息
          await db.messages.bulkAdd(messagesWithChatId);
          console.log(`添加了 ${messagesWithChatId.length} 条新消息`);
        }
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
      
      // 为每个聊天加载消息并确保排序
      const chatsWithMessages = await Promise.all(
        chats.map(async (chat) => {
          // 明确指定按timestamp排序
          const messages = await db.messages
            .where('chatId')
            .equals(chat.id)
            .sortBy('timestamp');
          
          // 验证所有消息的时间戳
          const validatedMessages = messages.map(msg => {
            // 确保timestamp是有效的数字
            if (!msg.timestamp || isNaN(msg.timestamp)) {
              console.warn(`修复聊天 ${chat.id} 中的无效时间戳`);
              msg.timestamp = Date.now();
            }
            return msg;
          });
          
          return {
            ...chat,
            messages: validatedMessages
          };
        })
      );
      
      return chatsWithMessages.sort((a, b) => b.updatedAt - a.updatedAt);
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
      // 确保时间戳是有效的数字
      if (!message.timestamp || isNaN(message.timestamp)) {
        console.warn(`为消息设置默认时间戳`);
        message.timestamp = Date.now();
      }
      
      // 设置消息的chatId
      const messageWithChatId = {
        ...message,
        chatId,
        id: message.id || uuidv4(),
        timestamp: Number(message.timestamp) // 确保是数字类型
      };
      
      const existingMessageById = await db.messages.get(messageWithChatId.id);
      if (existingMessageById) {
        return;
      }

      // 检查是否已存在相同内容的消息
      const existingMessage = await db.messages
        .where('[chatId+role+content]')
        .equals([chatId, message.role, message.content])
        .first();
      
      if (!existingMessage) {
        // 只有在不存在相同消息时才添加
        await db.messages.add(messageWithChatId);
        
        // 更新聊天的updatedAt时间
        await db.chats.update(chatId, {
          updatedAt: Date.now()
        });
      }
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