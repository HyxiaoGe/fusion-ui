import Dexie, { Table } from 'dexie';

// 定义对话记录的类型
export interface Conversation {
  id?: number;
  title: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

// 定义消息的类型
export interface Message {
  id: string;
  conversationId: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// 定义设置的类型
export interface Setting {
  id?: number;
  key: string;
  value: any;
}

// 创建 Dexie 数据库类
class AppDatabase extends Dexie {
  conversations!: Table<Conversation, number>;
  messages!: Table<Message, number>;
  settings!: Table<Setting, number>;

  constructor() {
    super('xiaohubDatabase');
    this.version(1).stores({
      conversations: '++id, title, model, createdAt, updatedAt',
      messages: '++id, conversationId, role, timestamp',
      settings: '++id, key',
    });
  }
}

export const db = new AppDatabase();

// 创建一些辅助函数
export async function getAllConversations() {
  return await db.conversations.toArray();
}

export async function getConversationMessages(conversationId: number) {
  return await db.messages
    .where('conversationId')
    .equals(conversationId)
    .sortBy('timestamp');
}

export async function getSetting(key: string) {
  const setting = await db.settings.where('key').equals(key).first();
  return setting?.value;
}

export async function setSetting(key: string, value: any) {
  const existing = await db.settings.where('key').equals(key).first();
  if (existing) {
    return await db.settings.update(existing.id!, { value });
  } else {
    return await db.settings.add({ key, value });
  }
}