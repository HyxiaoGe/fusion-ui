import { API_CONFIG } from '../config';
import fetchWithAuth, { apiRequest } from './fetchWithAuth';
import type { ContentBlock, SearchSource, Usage } from '@/types/conversation';

const API_BASE_URL = API_CONFIG.BASE_URL;

// ============================================================
// 请求 / 响应类型
// ============================================================

export interface ChatRequest {
  model_id: string;
  message: string;
  conversation_id?: string | null;
  stream?: boolean;
  options?: {
    use_reasoning?: boolean;
    temperature?: number;
    max_tokens?: number;
    [key: string]: unknown;
  } | null;
  file_ids?: string[];
}

// SSE chunk 结构（对齐后端 StreamChunk schema）
interface StreamChunkPayload {
  id: string;
  conversation_id: string;
  choices: Array<{
    delta: {
      content?: ContentBlock[];
    };
    finish_reason?: 'stop' | 'error' | null;
  }>;
  usage?: Usage | null;
}

export interface StreamCallbacks {
  onReady: (meta: { messageId: string; conversationId: string }) => void;
  onTextDelta: (delta: string, blockId: string, meta: { messageId: string; conversationId: string }) => void;
  onThinkingDelta: (delta: string, blockId: string, meta: { messageId: string; conversationId: string }) => void;
  onSearchStart?: (query: string, meta: { messageId: string; conversationId: string }, toolCallId?: string) => void;
  onSearchComplete?: (sources: SearchSource[], meta: { messageId: string; conversationId: string }, toolCallId?: string) => void;
  onUrlReadStart?: (url: string, source: string, toolCallId?: string) => void;
  onUrlReadComplete?: (result: { url: string; title?: string; favicon?: string; status: string }, toolCallId?: string) => void;
  onAgentStepStart?: (step: number, maxSteps: number, toolCount: number) => void;
  onAgentStepEnd?: (step: number) => void;
  onAgentLimitReached?: (reason: string) => void;
  onDone: (messageId: string, conversationId: string, usage: Usage | null) => void;
  onError: (message: string) => void;
}

// ============================================================
// 流式请求
// ============================================================

export async function sendMessageStream(
  data: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ ...data, stream: true }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const body = errorData as { code?: string; message?: string; detail?: string };
    throw new Error(body.message || body.detail || '请求失败');
  }

  if (!response.body) throw new Error('响应体为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ready = false;
  let receivedDone = false;
  let currentEntryId = '0'; // Redis Stream entry ID，供断线重连使用

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (!receivedDone) {
          callbacks.onError('流异常结束');
          throw new Error('流异常结束');
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();

        // 解析 SSE id 行（Redis Stream entry ID）
        if (trimmed.startsWith('id:')) {
          currentEntryId = trimmed.slice(3).trim();
          continue;
        }

        if (!trimmed.startsWith('data:')) continue;

        const raw = trimmed.slice(5).trim();
        if (raw === '[DONE]') {
          receivedDone = true;
          continue;
        }

        let chunk: StreamChunkPayload;
        try {
          chunk = JSON.parse(raw) as StreamChunkPayload;
        } catch {
          continue;
        }

        const messageId = chunk.id;
        const conversationId = chunk.conversation_id;
        const choice = chunk.choices?.[0];

        // 第一帧触发 onReady
        if (!ready && messageId) {
          ready = true;
          callbacks.onReady({ messageId, conversationId });
        }

        // 处理 content blocks 增量
        if (choice?.delta?.content) {
          for (const block of choice.delta.content) {
            if (block.type === 'text') {
              callbacks.onTextDelta((block as { text: string }).text, block.id, { messageId, conversationId });
            } else if (block.type === 'thinking') {
              callbacks.onThinkingDelta((block as { thinking: string }).thinking, block.id, { messageId, conversationId });
            } else if (block.type === 'search') {
              // 搜索事件处理，携带 tool_call_id 以关联 agent 步骤
              const searchBlock = (block as unknown) as { search_event: string; query: string; sources?: SearchSource[]; tool_call_id?: string };
              if (searchBlock.search_event === 'start' && callbacks.onSearchStart) {
                callbacks.onSearchStart(searchBlock.query, { messageId, conversationId }, searchBlock.tool_call_id);
              } else if (searchBlock.search_event === 'complete' && callbacks.onSearchComplete) {
                callbacks.onSearchComplete(searchBlock.sources ?? [], { messageId, conversationId }, searchBlock.tool_call_id);
              }
            } else if (block.type === 'url_read') {
              // URL 读取事件处理，携带 tool_call_id 以关联 agent 步骤
              const urlReadBlock = (block as unknown) as { url_read_event: string; url: string; source: string; title?: string; favicon?: string; status?: string; tool_call_id?: string };
              if (urlReadBlock.url_read_event === 'start' && callbacks.onUrlReadStart) {
                callbacks.onUrlReadStart(urlReadBlock.url, urlReadBlock.source, urlReadBlock.tool_call_id);
              } else if (urlReadBlock.url_read_event === 'complete' && callbacks.onUrlReadComplete) {
                callbacks.onUrlReadComplete({
                  url: urlReadBlock.url,
                  title: urlReadBlock.title,
                  favicon: urlReadBlock.favicon,
                  status: urlReadBlock.status ?? 'success',
                }, urlReadBlock.tool_call_id);
              }
            } else {
              // agent 步骤事件处理（block.type 不在静态联合类型中，运行时动态扩展）
              const rawBlock = (block as unknown) as { type: string; agent_event?: string; step?: number; max_steps?: number; tool_count?: number; total_tool_calls?: number; reason?: string };
              if (rawBlock.type === 'agent_step') {
                if (rawBlock.agent_event === 'step_start' && callbacks.onAgentStepStart) {
                  callbacks.onAgentStepStart(rawBlock.step ?? 0, rawBlock.max_steps ?? 0, rawBlock.tool_count ?? 0);
                } else if (rawBlock.agent_event === 'step_end' && callbacks.onAgentStepEnd) {
                  callbacks.onAgentStepEnd(rawBlock.step ?? 0);
                } else if (rawBlock.agent_event === 'limit_reached' && callbacks.onAgentLimitReached) {
                  callbacks.onAgentLimitReached(rawBlock.reason ?? '');
                }
              }
            }
          }
        }

        // 结束帧
        if (choice?.finish_reason === 'stop') {
          callbacks.onDone(messageId, conversationId, chunk.usage ?? null);
        } else if (choice?.finish_reason === 'error') {
          callbacks.onError('模型调用失败');
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================
// 断线重连 — GET /stream/{conv_id}
// ============================================================

export async function reconnectStream(
  conversationId: string,
  lastEntryId: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetchWithAuth(
    `${API_BASE_URL}/api/chat/stream/${conversationId}?last_entry_id=${encodeURIComponent(lastEntryId)}`,
    { signal }
  );

  if (!response.ok) {
    throw new Error('重连失败');
  }
  if (!response.body) throw new Error('响应体为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ready = false;
  let receivedDone = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (!receivedDone) callbacks.onError('流异常结束');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('id:')) continue;
        if (!trimmed.startsWith('data:')) continue;

        const raw = trimmed.slice(5).trim();
        if (raw === '[DONE]') { receivedDone = true; continue; }

        let chunk: StreamChunkPayload;
        try { chunk = JSON.parse(raw) as StreamChunkPayload; } catch { continue; }

        const messageId = chunk.id;
        const conversationId = chunk.conversation_id;
        const choice = chunk.choices?.[0];

        if (!ready && messageId) {
          ready = true;
          callbacks.onReady({ messageId, conversationId });
        }

        if (choice?.delta?.content) {
          for (const block of choice.delta.content) {
            if (block.type === 'text') callbacks.onTextDelta(block.text, block.id, { messageId, conversationId });
            else if (block.type === 'thinking') callbacks.onThinkingDelta(block.thinking, block.id, { messageId, conversationId });
          }
        }

        if (choice?.finish_reason === 'stop') callbacks.onDone(messageId, conversationId, chunk.usage ?? null);
        else if (choice?.finish_reason === 'error') callbacks.onError('模型调用失败');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function stopStream(conversationId: string, messageId?: string): Promise<boolean> {
  try {
    const data = await apiRequest<{ cancelled: boolean }>(
      `${API_BASE_URL}/api/chat/stop/${conversationId}${messageId ? `?message_id=${encodeURIComponent(messageId)}` : ''}`,
      { method: 'POST' },
    );
    return data.cancelled ?? false;
  } catch {
    return false;
  }
}

// ============================================================
// 非流式及其他接口
// ============================================================

interface ConversationListData {
  items: unknown[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export async function getConversations(page: number = 1, pageSize: number = 10): Promise<ConversationListData> {
  return apiRequest<ConversationListData>(`${API_BASE_URL}/api/chat/conversations?page=${page}&page_size=${pageSize}`);
}

export async function getConversation(conversationId: string) {
  return apiRequest(`${API_BASE_URL}/api/chat/conversations/${conversationId}`);
}

export async function renameConversation(conversationId: string, title: string) {
  return apiRequest(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(conversationId: string) {
  return apiRequest(`${API_BASE_URL}/api/chat/conversations/${conversationId}`, {
    method: 'DELETE',
  });
}

export const fetchSuggestedQuestions = async (
  conversationId: string,
  options: Record<string, unknown> = {},
  _forceRefresh: boolean = false,
  _messageCount?: number
): Promise<{ questions: string[] }> => {
  const data = await apiRequest<{ questions: string[]; conversation_id: string }>(
    `${API_BASE_URL}/api/chat/suggest-questions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, options }),
    },
  );
  return { questions: data.questions || [] };
};
