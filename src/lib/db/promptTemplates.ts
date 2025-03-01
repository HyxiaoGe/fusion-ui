import Dexie, { Table } from 'dexie';

export interface PromptTemplate {
  id?: number;
  title: string;
  content: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
  isSystem?: boolean;
}

// 扩展现有的数据库类或创建新的类
class PromptTemplatesDatabase extends Dexie {
  promptTemplates!: Table<PromptTemplate, number>;

  constructor() {
    super('promptTemplatesDb');
    this.version(1).stores({
      promptTemplates: '++id, title, category, isSystem, createdAt, updatedAt',
    });
  }
}

export const promptDb = new PromptTemplatesDatabase();

// 操作函数
export async function getAllPromptTemplates() {
  return await promptDb.promptTemplates.toArray();
}

export async function getPromptTemplatesByCategory(category: string) {
  return await promptDb.promptTemplates
    .where('category')
    .equals(category)
    .toArray();
}

export async function getPromptTemplateById(id: number) {
  return await promptDb.promptTemplates.get(id);
}

export async function addPromptTemplate(template: Omit<PromptTemplate, 'id'>) {
  return await promptDb.promptTemplates.add(template);
}

export async function updatePromptTemplate(
  id: number,
  template: Partial<Omit<PromptTemplate, 'id'>>
) {
  return await promptDb.promptTemplates.update(id, { 
    ...template, 
    updatedAt: new Date() 
  });
}

export async function deletePromptTemplate(id: number) {
  return await promptDb.promptTemplates.delete(id);
}

// 初始化一些示例提示词模板
export async function initializeDefaultPromptTemplates() {
  const count = await promptDb.promptTemplates.count();
  if (count === 0) {
    const defaultTemplates: Omit<PromptTemplate, 'id'>[] = [
      {
        title: '代码解释',
        content: '请解释以下代码的功能，并分析其时间和空间复杂度：\n\n```\n<在此处放置代码>\n```',
        category: '编程',
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: '文本总结',
        content: '请总结以下文本的要点：\n\n<在此处放置文本>',
        category: '写作',
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: '问题解答',
        content: '我需要回答以下问题，请提供详细的解释：\n\n<在此处放置问题>',
        category: '学习',
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await promptDb.promptTemplates.bulkAdd(defaultTemplates);
  }
}