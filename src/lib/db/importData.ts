import db, { chatStore, settingsStore } from './chatStore';
import { Chat, Message } from '@/redux/slices/chatSlice';
import { AppDispatch } from '@/redux/store';
import initializeStoreFromDB from './initializeStore';
import { v4 as uuidv4 } from 'uuid';

// 定义导入数据的类型
interface ImportData {
  chats: Chat[];
  settings: Record<string, any>;
}

/**
 * 从导入文件中导入数据到IndexedDB
 * @param file 导入的JSON文件
 * @param dispatch Redux dispatch函数
 */
export async function importDataFromFile(file: File, dispatch: AppDispatch): Promise<string> {
  try {
    // 读取文件内容
    const fileContent = await readFileAsText(file);
    const importData: ImportData = JSON.parse(fileContent);
    
    // 验证导入数据的格式
    if (!importData.chats || !Array.isArray(importData.chats)) {
      throw new Error('无效的导入数据格式：缺少聊天数据或格式不正确');
    }
    
    // 开始导入过程
    await db.transaction('rw', [db.chats, db.messages, db.settings], async () => {
      // 清空现有数据
      await db.chats.clear();
      await db.messages.clear();
      await db.settings.clear();
      
      // 导入聊天数据
      for (const chat of importData.chats) {
        // 先获取该聊天ID是否已存在
        const existingChat = await db.chats.get(chat.id);
        
        // 如果聊天已存在，先获取已有消息用于去重
        const existingContents = new Map();
        if (existingChat) {
          const existingMessages = await db.messages
            .where('chatId')
            .equals(chat.id)
            .toArray();
          
          existingMessages.forEach(msg => {
            existingContents.set(`${msg.role}:${msg.content}`, true);
          });
        }
        
        // 提取消息并添加chatId关联
        const messages = chat.messages || [];
        
        // 过滤出不重复的消息
        const uniqueMessages = messages.filter(msg => {
          const key = `${msg.role}:${msg.content}`;
          return !existingContents.has(key);
        });
        
        // 批量添加不重复的消息
        if (uniqueMessages.length > 0) {
          await db.messages.bulkAdd(
            uniqueMessages.map(msg => ({
              ...msg,
              chatId: chat.id
            }))
          );
          console.log(`导入了 ${uniqueMessages.length} 条新消息到聊天 ${chat.id}`);
        }
        
        // 添加不含消息的聊天记录到chats表
        const { messages: _, ...chatWithoutMessages } = chat;
        await db.chats.put(chatWithoutMessages);
      }
      
      // 导入设置数据
      if (importData.settings) {
        for (const [key, value] of Object.entries(importData.settings)) {
          await db.settings.put({ id: key, value });
        }
      }
    });
    
    // 重新初始化Redux存储
    await initializeStoreFromDB(dispatch);
    
    return `成功导入 ${importData.chats.length} 个聊天记录和 ${
      Object.keys(importData.settings || {}).length
    } 条设置数据`;
  } catch (error) {
    console.error('导入数据失败:', error);
    throw new Error(`导入数据失败: ${(error as Error).message}`);
  }
}

/**
 * 读取文件内容为文本
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        resolve(event.target.result as string);
      } else {
        reject(new Error('读取文件内容失败'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsText(file);
  });
}