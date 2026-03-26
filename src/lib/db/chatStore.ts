import Dexie, { Table } from 'dexie';
import type { Conversation, Message } from '@/types/conversation';
import { v4 as uuidv4 } from 'uuid';

// 定义数据库架构
class ChatDatabase extends Dexie {
  chats!: Table<Conversation, string>;
  messages!: Table<Message, string>;
  settings!: Table<{ id: string; value: unknown }, string>;

  constructor() {
    super('ai-assistant-db');

    this.version(1).stores({
      chats: 'id, modelId, createdAt, updatedAt',
      messages: 'id, chatId, role, timestamp, [chatId+timestamp]',
      settings: 'id'
    });

    this.version(2).stores({
      messages: 'id, chatId, role, timestamp, [chatId+timestamp], [chatId+role+content]'
    });

    this.version(3).stores({
      messages: 'id, chatId, role, timestamp, [chatId+timestamp], [chatId+role+content]'
    });

    this.version(4).stores({
      chats: 'id, modelId, createdAt, updatedAt'
    });

    // v5: content blocks 重构 — model → model_id，移除 content 复合索引（content 是对象数组）
    this.version(5).stores({
      chats: 'id, model_id, createdAt, updatedAt',
      messages: 'id, chatId, role, timestamp, [chatId+timestamp]',
      settings: 'id'
    }).upgrade(tx => {
      // 清空旧数据，后端已 truncate，本地旧结构不兼容
      return Promise.all([
        tx.table('chats').clear(),
        tx.table('messages').clear(),
      ]);
    });
  }
}

// 创建数据库实例
const db = new ChatDatabase();

// 聊天操作
export const chatStore = {
  // 保存整个聊天
  async saveChat(chat: Conversation): Promise<void> {
    try {
      const existingChat = await db.chats.get(chat.id);

      if (existingChat) {
        await db.chats.update(chat.id, {
          title: chat.title,
          model_id: chat.model_id,
          updatedAt: chat.updatedAt,
        });
      } else {
        await db.chats.add(chat);
      }

      if (chat.messages && chat.messages.length > 0) {
        // 按 id 去重
        const existingMessages = await db.messages
          .where('chatId')
          .equals(chat.id)
          .toArray();

        const existingIds = new Set(existingMessages.map(msg => msg.id));

        const newMessages = chat.messages.filter(msg => !existingIds.has(msg.id));

        if (newMessages.length > 0) {
          const messagesWithChatId = newMessages.map(msg => ({
            ...msg,
            chatId: chat.id
          }));
          await db.messages.bulkAdd(messagesWithChatId);
        }
      }
    } catch (error) {
      console.error('保存聊天失败:', error);
      throw error;
    }
  },

  // 获取所有聊天
  async getAllChats(): Promise<Conversation[]> {
    try {
      const chats = await db.chats.toArray();

      const chatsWithMessages = await Promise.all(
        chats.map(async (chat) => {
          const messages = await db.messages
            .where('chatId')
            .equals(chat.id)
            .sortBy('timestamp');

          const validatedMessages = messages.map(msg => {
            if (!msg.timestamp || isNaN(msg.timestamp)) {
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
  async getChatById(chatId: string): Promise<Conversation | undefined> {
    try {
      const chat = await db.chats.get(chatId);
      if (!chat) return undefined;

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
      await db.transaction('rw', [db.chats, db.messages], async () => {
        await db.chats.delete(chatId);
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
      if (!message.timestamp || isNaN(message.timestamp)) {
        message.timestamp = Date.now();
      }

      const messageWithChatId = {
        ...message,
        chatId,
        id: message.id || uuidv4(),
        timestamp: Number(message.timestamp),
      };

      const existing = await db.messages.get(messageWithChatId.id);
      if (existing) return;

      await db.messages.add(messageWithChatId);
      await db.chats.update(chatId, { updatedAt: Date.now() });
    } catch (error) {
      console.error(`添加消息到聊天ID ${chatId} 失败:`, error);
      throw error;
    }
  },

  // 更新已有消息
  async updateMessage(messageId: string, updates: Partial<Message>): Promise<void> {
    try {
      const existingMessage = await db.messages.get(messageId);

      if (existingMessage) {
        await db.messages.update(messageId, {
          ...updates,
          chatId: existingMessage.chatId
        });

        if (existingMessage.chatId) {
          await db.chats.update(existingMessage.chatId, { updatedAt: Date.now() });
        }
      }
    } catch (error) {
      console.error(`更新消息 ${messageId} 失败:`, error);
      throw error;
    }
  },

  // 幂等同步消息
  async upsertMessage(message: Message): Promise<void> {
    try {
      const normalizedMessage = {
        ...message,
        id: message.id || uuidv4(),
        timestamp: Number(message.timestamp || Date.now()),
      };

      await db.messages.put(normalizedMessage);

      if (normalizedMessage.chatId) {
        await db.chats.update(normalizedMessage.chatId, { updatedAt: Date.now() });
      }
    } catch (error) {
      console.error(`同步消息 ${message.id} 快照失败:`, error);
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
  async saveSetting(id: string, value: unknown): Promise<void> {
    await db.settings.put({ id, value });
  },

  async getSetting(id: string): Promise<unknown> {
    const setting = await db.settings.get(id);
    return setting?.value;
  },

  async getAllSettings(): Promise<Record<string, unknown>> {
    const settings = await db.settings.toArray();
    return settings.reduce((acc, setting) => {
      acc[setting.id] = setting.value;
      return acc;
    }, {} as Record<string, unknown>);
  }
};

export default db;
