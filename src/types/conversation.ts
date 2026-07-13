import type { AgentRunState } from './agentRun';

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
  thumbnail_url?: string;  // 缩略图 presigned URL
  width?: number;          // 图片宽度
  height?: number;         // 图片高度
}

export interface SearchSource {
  title: string;
  url: string;
  description: string;
  content?: string;
  favicon?: string;
  requested_provider?: string | null;
  result_provider?: string | null;
  fallback_used?: boolean;
  provider_chain?: string[];
}

// 轻量版搜索来源，用于 SearchBlock 存储和 UI 展示
export interface SearchSourceSummary {
  title: string;
  url: string;
  favicon?: string;
}

export type NetworkSourceStatus = 'success' | 'failed' | 'degraded' | 'interrupted';

export interface SourceReference {
  kind: 'search' | 'url_read';
  title: string;
  url: string;
  domain?: string;
  favicon?: string;
  status?: NetworkSourceStatus;
  tool_call_log_id?: string;
  error_message?: string | null;
}

export interface SearchBlock {
  type: 'search';
  id: string;
  query: string;
  tool_call_log_id?: string;
  sources: SearchSourceSummary[];
  status?: NetworkSourceStatus;
  error_message?: string | null;
  source_count?: number;
  source_refs?: SourceReference[];
  requested_provider?: string | null;
  result_provider?: string | null;
  fallback_used?: boolean;
  provider_chain?: string[];
  requested_count?: number | null;
  actual_count?: number | null;
  context_source_count?: number | null;
  context_source_limit?: number | null;
  search_budget?: string | null;
  intent?: 'quick_fact' | 'freshness' | 'comparison' | 'deep_research' | 'official_source' | string | null;
  domains?: string[];
  recency_days?: number | null;
  budget_limited?: boolean;
}

export interface UrlBlock {
  type: 'url_read';
  id: string;
  url: string;
  title?: string;
  favicon?: string;
  tool_call_log_id?: string;
  status?: NetworkSourceStatus;
  error_message?: string | null;
  source_count?: number;
  source_refs?: SourceReference[];
  reason?: string | null;
}

export type ContentBlock = TextBlock | ThinkingBlock | FileBlock | SearchBlock | UrlBlock;

// ============================================================
// Usage
// ============================================================

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  context?: ContextUsage | null;
}

/** 单次有效模型请求的上下文快照；不与 usage.input_tokens 的 Agent 累计口径混用。 */
export interface ContextUsage {
  status: string;
  window_tokens: number | null;
  estimated_tokens_before: number | null;
  estimated_tokens_after: number | null;
  actual_prompt_tokens: number | null;
  removed_turns: number;
  removed_messages: number;
  removed_tool_transactions: number;
  round_index: number | null;
}

// ============================================================
// Message
// ============================================================

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  /** 服务端分配的会话内稳定顺序；本地 optimistic 消息在服务端确认前可以没有该值。 */
  sequence?: number;
  model_id?: string | null;
  usage?: Usage | null;
  timestamp?: number;
  chatId?: string;
  status?: 'pending' | 'failed' | null;
  isReasoningVisible?: boolean;
  shouldSyncToDb?: boolean;
  agent_run?: AgentRunState | null;
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

export function extractUrlBlock(content: ContentBlock[]): UrlBlock | undefined {
  return content.find((b): b is UrlBlock => b.type === 'url_read');
}
