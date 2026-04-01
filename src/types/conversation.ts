// ============================================================
// Content Blocks（对齐后端 schema）
// ============================================================

export interface TextBlock {
  type: 'text';
  id: string;
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  id: string;
  thinking: string;
}

export interface FileBlock {
  type: 'file';
  id: string;
  file_id: string;
  filename: string;
  mime_type: string;
}

export interface SearchSource {
  title: string;
  url: string;
  description: string;
  content?: string;
  favicon?: string;
}

export interface SearchBlock {
  type: 'search';
  id: string;
  query: string;
  sources: SearchSource[];
}

export type ContentBlock = TextBlock | ThinkingBlock | FileBlock | SearchBlock;

// ============================================================
// Usage
// ============================================================

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

// ============================================================
// Message
// ============================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  model_id?: string | null;
  usage?: Usage | null;
  timestamp?: number;
  chatId?: string;
  status?: 'pending' | 'failed' | null;
  isReasoningVisible?: boolean;
  shouldSyncToDb?: boolean;
  // 持久化推荐问题，刷新后随消息恢复
  suggestedQuestions?: string[];
}

// ============================================================
// Conversation
// ============================================================

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model_id: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// 其他
// ============================================================

export interface Pagination {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export type HydrationStatus = 'idle' | 'loading' | 'done' | 'error';

// ============================================================
// 工具函数：从 content blocks 中提取纯文本
// ============================================================

export function extractTextFromBlocks(content: ContentBlock[]): string {
  return content
    .filter((b): b is TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

export function extractThinkingFromBlocks(content: ContentBlock[]): string {
  return content
    .filter((b): b is ThinkingBlock => b.type === 'thinking')
    .map(b => b.thinking)
    .join('');
}

export function extractSearchBlock(content: ContentBlock[]): SearchBlock | null {
  return (content.find((b): b is SearchBlock => b.type === 'search') ?? null);
}
