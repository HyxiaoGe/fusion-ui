import { API_CONFIG } from '../config';
import fetchWithAuth, { apiRequest } from './fetchWithAuth';
import type {
  AgentEventEnvelope,
  SseEnvelope,
} from '@/types/agentRun';

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

// ============================================================
// 流回调接口（新 SSE envelope 协议，BE Task 8）
// ============================================================

/** reasoning / answering chunk 的 data plane 形态. */
export interface ContentDeltaPayload {
  block_id: string;
  delta: string;
  run_id?: string;
  step_id?: string;
}

/** error chunk 的 data plane 形态（BYOK 结构化 / stream_error 兜底）. */
export interface StreamErrorPayload {
  code?: string;
  message?: string;
  data?: Record<string, unknown>;
}

export interface StreamCallbacks {
  /** 流首次握手：从 agent_event.run_started 拿到 messageId 时触发一次 */
  onReady: (meta: { messageId: string; conversationId: string }) => void;
  /** 推理 token 流（reasoning chunk） */
  onReasoning: (payload: ContentDeltaPayload) => void;
  /** 回答 token 流（answering chunk） */
  onAnswering: (payload: ContentDeltaPayload) => void;
  /** preparing chunk：流开启信号（FE 可显示 spinner） */
  onPreparing?: () => void;

  /** agent_event 控制面 — 10 个事件类型 */
  onRunStarted?: (
    ev: AgentEventEnvelope & {
      conversation_id: string;
      message_id: string;
      model: string;
      tools: string[];
      config: Record<string, unknown>;
    },
  ) => void;
  onStepStarted?: (ev: AgentEventEnvelope & { step_number: number }) => void;
  onToolCallStarted?: (
    ev: AgentEventEnvelope & {
      tool_name: string;
      arguments: Record<string, unknown>;
    },
  ) => void;
  onToolCallDelta?: (
    ev: AgentEventEnvelope & {
      tool_name: string;
      delta: Record<string, unknown>;
    },
  ) => void;
  onToolCallCompleted?: (
    ev: AgentEventEnvelope & {
      tool_name: string;
      status: string;
      duration_ms: number;
      result_summary: Record<string, unknown>;
      error?: string | null;
    },
  ) => void;
  onStepCompleted?: (
    ev: AgentEventEnvelope & {
      step_number: number;
      tool_call_count: number;
      duration_ms: number;
    },
  ) => void;
  onRunLimitReached?: (ev: AgentEventEnvelope & { reason: string }) => void;
  onRunInterrupted?: (ev: AgentEventEnvelope & { reason: string }) => void;
  onRunFailed?: (
    ev: AgentEventEnvelope & { error_code: string; message: string },
  ) => void;
  onRunCompleted?: (
    ev: AgentEventEnvelope & {
      total_steps: number;
      total_tool_calls: number;
      finish_reason: string;
    },
  ) => void;

  /** done chunk：协议层流完成（与 [DONE] SSE 通道终止并存） */
  onDone: (meta: { messageId: string; conversationId: string }) => void;
  /** error chunk：infra 层错误（与 run_failed 不同层；run_failed 是 agent run 失败） */
  onError: (message: string, payload?: StreamErrorPayload) => void;
}

// ============================================================
// 流式请求
// ============================================================

export async function sendMessageStream(
  data: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
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
  let receivedDone = false;
  let currentEntryId = '0'; // Redis Stream entry ID，供断线重连
  let conversationId = data.conversation_id ?? '';
  let messageId = '';
  let readyFired = false;

  // sequence dedup: per run_id 单调防重（spec §6.8）
  const lastSequenceByRun = new Map<string, number>();

  const dispatchAgentEvent = (
    ev: AgentEventEnvelope & Record<string, unknown>,
  ) => {
    switch (ev.type) {
      case 'run_started': {
        const payload = ev as unknown as AgentEventEnvelope & {
          conversation_id: string;
          message_id: string;
          model: string;
          tools: string[];
          config: Record<string, unknown>;
        };
        messageId = payload.message_id;
        conversationId = payload.conversation_id;
        if (!readyFired) {
          readyFired = true;
          callbacks.onReady({ messageId, conversationId });
        }
        callbacks.onRunStarted?.(payload);
        return;
      }
      case 'step_started':
        return callbacks.onStepStarted?.(ev as never);
      case 'tool_call_started':
        return callbacks.onToolCallStarted?.(ev as never);
      case 'tool_call_delta':
        return callbacks.onToolCallDelta?.(ev as never);
      case 'tool_call_completed':
        return callbacks.onToolCallCompleted?.(ev as never);
      case 'step_completed':
        return callbacks.onStepCompleted?.(ev as never);
      case 'run_limit_reached':
        return callbacks.onRunLimitReached?.(ev as never);
      case 'run_interrupted':
        return callbacks.onRunInterrupted?.(ev as never);
      case 'run_failed':
        return callbacks.onRunFailed?.(ev as never);
      case 'run_completed':
        return callbacks.onRunCompleted?.(ev as never);
      default:
        console.warn('[chat] 未知 agent_event type，已忽略', ev.type);
    }
  };

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

        // SSE id 行：Redis Stream entry ID，供断线重连
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

        let envelope: SseEnvelope<unknown>;
        try {
          envelope = JSON.parse(raw) as SseEnvelope<unknown>;
        } catch {
          console.warn('[chat] SSE 帧 JSON 解析失败，跳过', raw);
          continue;
        }

        switch (envelope.chunk_type) {
          case 'agent_event': {
            const ev = envelope.data as AgentEventEnvelope &
              Record<string, unknown>;
            const last = lastSequenceByRun.get(ev.run_id) ?? -1;
            if (ev.sequence <= last) {
              console.warn('[chat] agent_event sequence 倒退，丢弃', ev);
              break;
            }
            lastSequenceByRun.set(ev.run_id, ev.sequence);
            dispatchAgentEvent(ev);
            break;
          }
          case 'reasoning':
            callbacks.onReasoning(envelope.data as ContentDeltaPayload);
            break;
          case 'answering':
            callbacks.onAnswering(envelope.data as ContentDeltaPayload);
            break;
          case 'preparing':
            callbacks.onPreparing?.();
            break;
          case 'done':
            callbacks.onDone({ messageId, conversationId });
            break;
          case 'error': {
            const errPayload = envelope.data as StreamErrorPayload;
            const msg = errPayload?.message ?? '模型调用失败';
            callbacks.onError(msg, errPayload);
            throw new Error(msg);
          }
          default:
            console.warn('[chat] 未知 chunk_type，已忽略', envelope.chunk_type);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // currentEntryId 由调用方按需通过其它路径（如 stream-status）拿
  void currentEntryId;
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
    { signal },
  );

  if (!response.ok) {
    throw new Error('重连失败');
  }
  if (!response.body) throw new Error('响应体为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;
  let resolvedConversationId = conversationId;
  let messageId = '';
  let readyFired = false;
  const lastSequenceByRun = new Map<string, number>();

  const dispatchAgentEvent = (
    ev: AgentEventEnvelope & Record<string, unknown>,
  ) => {
    switch (ev.type) {
      case 'run_started': {
        const payload = ev as unknown as AgentEventEnvelope & {
          conversation_id: string;
          message_id: string;
          model: string;
          tools: string[];
          config: Record<string, unknown>;
        };
        messageId = payload.message_id;
        resolvedConversationId = payload.conversation_id;
        if (!readyFired) {
          readyFired = true;
          callbacks.onReady({ messageId, conversationId: resolvedConversationId });
        }
        callbacks.onRunStarted?.(payload);
        return;
      }
      case 'step_started':
        return callbacks.onStepStarted?.(ev as never);
      case 'tool_call_started':
        return callbacks.onToolCallStarted?.(ev as never);
      case 'tool_call_delta':
        return callbacks.onToolCallDelta?.(ev as never);
      case 'tool_call_completed':
        return callbacks.onToolCallCompleted?.(ev as never);
      case 'step_completed':
        return callbacks.onStepCompleted?.(ev as never);
      case 'run_limit_reached':
        return callbacks.onRunLimitReached?.(ev as never);
      case 'run_interrupted':
        return callbacks.onRunInterrupted?.(ev as never);
      case 'run_failed':
        return callbacks.onRunFailed?.(ev as never);
      case 'run_completed':
        return callbacks.onRunCompleted?.(ev as never);
      default:
        console.warn('[chat] 未知 agent_event type，已忽略', ev.type);
    }
  };

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
        if (raw === '[DONE]') {
          receivedDone = true;
          continue;
        }

        let envelope: SseEnvelope<unknown>;
        try {
          envelope = JSON.parse(raw) as SseEnvelope<unknown>;
        } catch {
          console.warn('[chat] SSE 帧 JSON 解析失败，跳过', raw);
          continue;
        }

        switch (envelope.chunk_type) {
          case 'agent_event': {
            const ev = envelope.data as AgentEventEnvelope &
              Record<string, unknown>;
            const last = lastSequenceByRun.get(ev.run_id) ?? -1;
            if (ev.sequence <= last) {
              console.warn('[chat] agent_event sequence 倒退，丢弃', ev);
              break;
            }
            lastSequenceByRun.set(ev.run_id, ev.sequence);
            dispatchAgentEvent(ev);
            break;
          }
          case 'reasoning':
            callbacks.onReasoning(envelope.data as ContentDeltaPayload);
            break;
          case 'answering':
            callbacks.onAnswering(envelope.data as ContentDeltaPayload);
            break;
          case 'preparing':
            callbacks.onPreparing?.();
            break;
          case 'done':
            callbacks.onDone({ messageId, conversationId: resolvedConversationId });
            break;
          case 'error': {
            const errPayload = envelope.data as StreamErrorPayload;
            const msg = errPayload?.message ?? '模型调用失败';
            callbacks.onError(msg, errPayload);
            throw new Error(msg);
          }
          default:
            console.warn('[chat] 未知 chunk_type，已忽略', envelope.chunk_type);
        }
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

/**
 * 按 ID 列表拉取对话元数据（不含 messages）
 * 用于发完消息后只刷新已显示对话的标题等，避免重拉整个分页
 */
export async function getConversationsMetadata(ids: string[]): Promise<Array<{
  id: string;
  title: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}>> {
  if (ids.length === 0) return [];
  const idsParam = encodeURIComponent(ids.join(','));
  const data = await apiRequest<{ items: Array<{
    id: string;
    title: string;
    model_id: string;
    created_at: string;
    updated_at: string;
  }> }>(`${API_BASE_URL}/api/chat/conversations/metadata?ids=${idsParam}`);
  return data.items || [];
}

/**
 * 按标题模糊搜索当前用户对话
 */
export async function searchConversations(query: string, limit = 50, signal?: AbortSignal): Promise<Array<{
  id: string;
  title: string;
  model_id: string;
  created_at: string;
  updated_at: string;
}>> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  const data = await apiRequest<{ items: Array<{
    id: string;
    title: string;
    model_id: string;
    created_at: string;
    updated_at: string;
  }> }>(`${API_BASE_URL}/api/chat/conversations/search?${params.toString()}`, { signal });
  return data.items || [];
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
  void _forceRefresh;
  void _messageCount;
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
