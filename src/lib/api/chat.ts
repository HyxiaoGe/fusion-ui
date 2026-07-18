import { API_CONFIG } from '../config';
import fetchWithAuth, { apiRequest } from './fetchWithAuth';
import type {
  AgentEvidenceItem,
  AgentContextRequiredEvent,
  AgentContextResultEvent,
  AgentContextPurpose,
  AgentContextResultStatus,
  AgentEventEnvelope,
  AgentPlanItemKind,
  AgentPlanItemStatus,
  AgentProgressPhase,
  SseEnvelope,
  SubmitAgentContextResultInput,
} from '@/types/agentRun';
import type { ContentBlock, StructuredToolResultBlock } from '@/types/conversation';
import type { ContextUsage } from '@/types/conversation';
import { normalizeContextUsage, type ContextUsagePhase } from '@/lib/chat/contextUsage';

const API_BASE_URL = API_CONFIG.BASE_URL;

// ============================================================
// 请求 / 响应类型
// ============================================================

export interface ChatRequest {
  model_id: string;
  message: string;
  conversation_id?: string | null;
  user_message_id?: string;
  assistant_message_id?: string;
  stream?: boolean;
  options?: {
    use_reasoning?: boolean;
    temperature?: number;
    max_tokens?: number;
    [key: string]: unknown;
  } | null;
  file_ids?: string[];
}

export interface ContinueAgentRunRequest {
  conversationId: string;
  messageId: string;
  previousRunId?: string;
}

export interface AgentContextSubmissionResponse {
  outcome: 'accepted' | 'idempotent';
  request_id: string;
  context_type: 'geolocation';
  status: AgentContextResultStatus;
}

export async function submitAgentContextResult(
  input: SubmitAgentContextResultInput,
  signal?: AbortSignal,
): Promise<AgentContextSubmissionResponse> {
  const body = input.status === 'provided'
    ? {
        context_type: 'geolocation' as const,
        status: input.status,
        location: {
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          accuracy_m: input.location.accuracyM,
          acquired_at: input.location.acquiredAt,
        },
      }
    : {
        context_type: 'geolocation' as const,
        status: input.status,
        reason: input.reason,
      };

  return apiRequest<AgentContextSubmissionResponse>(
    `${API_BASE_URL}/api/chat/conversations/${encodeURIComponent(input.conversationId)}/runs/${encodeURIComponent(input.runId)}/context/${encodeURIComponent(input.requestId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(body),
    },
  );
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

export class StreamRequestError extends Error {
  readonly recoverable: boolean;
  readonly statusCode?: number;
  readonly code?: string;

  constructor(
    message: string,
    options: { recoverable: boolean; statusCode?: number; code?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'StreamRequestError';
    this.recoverable = options.recoverable;
    this.statusCode = options.statusCode;
    this.code = options.code;
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        value: options.cause,
      });
    }
  }
}

export function isRecoverableStreamError(error: unknown): boolean {
  return error instanceof StreamRequestError && error.recoverable;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isRecoverableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchStreamResponse(
  url: string,
  init: RequestInit,
  fallbackMessage: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchWithAuth(url, init);
  } catch (error) {
    if (isAbortError(error) || init.signal?.aborted) throw error;
    throw new StreamRequestError('网络连接中断', {
      recoverable: true,
      cause: error,
    });
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const body = errorData as { code?: string; message?: string; detail?: string };
    throw new StreamRequestError(body.message || body.detail || fallbackMessage, {
      recoverable:
        body.code !== 'STREAM_UNAVAILABLE' && isRecoverableHttpStatus(response.status),
      statusCode: response.status,
      code: body.code,
    });
  }

  if (!response.body) {
    throw new StreamRequestError('响应体为空', { recoverable: true });
  }
  return response;
}

export interface StreamCallbacks {
  /** 当前 data frame 完整处理后确认的 Redis Stream entry id。 */
  onEntryId?: (entryId: string) => void;
  /**
   * 流首次握手：从 agent_event.run_started 拿到 messageId 时触发。
   *
   * 单次调用：sendMessageStream / reconnectStream 内部各自维护 readyFired flag 防重；
   * **重连场景**：每次 reconnectStream 调用都会重置 flag，因此重连时 onReady 会再次 fire
   * （重连 stream 重放 run_started）。caller 必须保证回调内逻辑幂等
   * （如 materialize conversation 时 dedup）。
   *
   * 想拿完整 RunStarted payload（model/tools/config）走 onRunStarted；
   * 仅需要 messageId/conversationId 走 onReady。
   */
  onReady: (meta: { messageId: string; conversationId: string }) => void;
  /** 推理 token 流（reasoning chunk） */
  onReasoning: (payload: ContentDeltaPayload) => void;
  /** 回答 token 流（answering chunk） */
  onAnswering: (payload: ContentDeltaPayload) => void;
  /** preparing chunk：流开启信号（FE 可显示 spinner） */
  onPreparing?: () => void;

  /**
   * 完整 run_started payload（含 model/tools/config）。
   * 轻量版（仅 messageId/conversationId）走 onReady。
   * 重连场景下与 onReady 同步触发，caller 需自行保证幂等。
   */
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
  onRunProgressUpdated?: (
    ev: AgentEventEnvelope & {
      protocol_version: 2;
      phase: AgentProgressPhase;
      label: string;
      completed_steps?: number;
      total_steps?: number;
      completed_tool_calls?: number;
      max_tool_calls?: number;
    },
  ) => void;
  onPlanSnapshot?: (
    ev: AgentEventEnvelope & {
      protocol_version: 2;
      plan_id: string;
      revision: number;
      items: Array<{
        id: string;
        title: string;
        status: AgentPlanItemStatus;
        kind: AgentPlanItemKind;
        summary?: string | null;
        tool_names?: string[];
        evidence_item_ids?: string[];
      }>;
    },
  ) => void;
  onPlanStepUpdated?: (
    ev: AgentEventEnvelope & {
      protocol_version: 2;
      plan_id: string;
      revision: number;
      item: {
        id: string;
        title: string;
        status: AgentPlanItemStatus;
        kind: AgentPlanItemKind;
        summary?: string | null;
        tool_names?: string[];
        evidence_item_ids?: string[];
      };
    },
  ) => void;
  onToolResultDigest?: (
    ev: AgentEventEnvelope & {
      protocol_version: 2;
      tool_name: string;
      status: 'success' | 'failed' | 'degraded' | 'interrupted';
      title: string;
      summary: string;
      key_findings?: string[];
      source_refs?: string[];
      truncated: boolean;
    },
  ) => void;
  onEvidenceItemUpserted?: (
    ev: AgentEventEnvelope & {
      protocol_version: 2;
      evidence: {
        id: string;
        kind: AgentEvidenceItem['kind'];
        status: AgentEvidenceItem['status'];
        title: string;
        url?: string;
        domain?: string;
        claim: string;
        snippet?: string;
        used_by_final_answer?: boolean;
      };
    },
  ) => void;
  onContentBlockUpserted?: (
    ev: AgentEventEnvelope & {
      protocol_version: 2;
      content_block: StructuredToolResultBlock;
      /** 兼容早期实验事件；正式契约固定为 content_block。 */
      block?: StructuredToolResultBlock;
    },
  ) => void;
  onContentBlockDiscarded?: (
    ev: AgentEventEnvelope & {
      protocol_version: 2;
      block_id: string;
    },
  ) => void;
  onContextStatusUpdated?: (
    ev: AgentEventEnvelope & ContextUsage & {
      protocol_version: 2;
      phase: ContextUsagePhase;
      message_id: string;
    },
  ) => void;
  onContextRequired?: (ev: AgentContextRequiredEvent) => void;
  onContextResult?: (ev: AgentContextResultEvent) => void;

  /** done chunk：协议层流完成（与 [DONE] SSE 通道终止并存） */
  onDone: (meta: { messageId: string; conversationId: string }) => void;
  /** error chunk：infra 层错误（与 run_failed 不同层；run_failed 是 agent run 失败） */
  onError: (message: string, payload?: StreamErrorPayload) => void;
}

// ============================================================
// 共享 SSE envelope 解析主循环
// ============================================================

interface SseStreamContext {
  /** 是否消费 SSE `id:` 行（发送与重连都需要游标） */
  trackEntryId?: boolean;
  /** 触发 onReady 时用的 conversationId 兜底 */
  fallbackConversationId: string;
  /**
   * 触发 onDone 时用的 conversationId 兜底。
   * reconnectStream 用调用方传入的 convId（防 done 在 run_started 之前到）；
   * sendMessageStream 不传则用 BE 推的 conversationId（fallback 为 request.conversation_id）。
   */
  doneConversationId?: () => string;
}

const AGENT_CONTEXT_PURPOSES = new Set<AgentContextPurpose>([
  'nearby_search',
  'route_origin',
  'route_destination',
  'local_weather',
]);

const AGENT_CONTEXT_RESULT_STATUSES = new Set<AgentContextResultStatus>([
  'provided',
  'denied',
  'timeout',
  'unavailable',
]);

function contextRequiredEvent(
  ev: AgentEventEnvelope & Record<string, unknown>,
): AgentContextRequiredEvent | null {
  if (
    ev.protocol_version !== 2
    || ev.context_type !== 'geolocation'
    || typeof ev.request_id !== 'string'
    || !ev.request_id
    || typeof ev.purpose !== 'string'
    || !AGENT_CONTEXT_PURPOSES.has(ev.purpose as AgentContextPurpose)
    || typeof ev.reason !== 'string'
    || !ev.reason
    || typeof ev.expires_at !== 'number'
    || !Number.isFinite(ev.expires_at)
  ) {
    return null;
  }
  // 显式重建 allowlist，防止后端误带坐标或其他上下文进入前端回调链路。
  return {
    type: 'context_required',
    protocol_version: 2,
    run_id: ev.run_id,
    parent_run_id: ev.parent_run_id,
    step_id: ev.step_id,
    parent_step_id: ev.parent_step_id,
    tool_call_id: ev.tool_call_id,
    sequence: ev.sequence,
    trace_id: ev.trace_id,
    ts: ev.ts,
    request_id: ev.request_id,
    context_type: 'geolocation',
    purpose: ev.purpose as AgentContextPurpose,
    reason: ev.reason,
    expires_at: ev.expires_at,
  };
}

function contextResultEvent(
  ev: AgentEventEnvelope & Record<string, unknown>,
): AgentContextResultEvent | null {
  if (
    ev.protocol_version !== 2
    || ev.context_type !== 'geolocation'
    || typeof ev.request_id !== 'string'
    || !ev.request_id
    || typeof ev.status !== 'string'
    || !AGENT_CONTEXT_RESULT_STATUSES.has(ev.status as AgentContextResultStatus)
  ) {
    return null;
  }
  // 显式重建 allowlist，防止后端误带坐标后进入 Redux 或日志链路。
  return {
    type: 'context_result',
    protocol_version: 2,
    run_id: ev.run_id,
    parent_run_id: ev.parent_run_id,
    step_id: ev.step_id,
    parent_step_id: ev.parent_step_id,
    tool_call_id: ev.tool_call_id,
    sequence: ev.sequence,
    trace_id: ev.trace_id,
    ts: ev.ts,
    request_id: ev.request_id,
    context_type: 'geolocation',
    status: ev.status as AgentContextResultStatus,
  };
}

/**
 * 解析 SSE envelope 流主循环。sendMessageStream / reconnectStream 共享。
 *
 * 变化点通过 ctx 参数化：trackEntryId / doneConversationId fallback。
 *
 * @returns 流终止时的状态：entryId（最近 SSE id）、messageId、conversationId
 */
async function parseSseEnvelopeStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: StreamCallbacks,
  ctx: SseStreamContext,
): Promise<{ entryId: string; messageId: string; conversationId: string }> {
  const decoder = new TextDecoder();
  let buffer = '';
  let receivedDone = false;
  let entryId = '0';
  let pendingEntryId: string | null = null;
  let messageId = '';
  let conversationId = ctx.fallbackConversationId;
  let readyFired = false;

  // sequence dedup: per run_id 单调防重（spec §6.8）
  const lastSequenceByRun = new Map<string, number>();

  const commitPendingEntryId = () => {
    if (!pendingEntryId) return;
    entryId = pendingEntryId;
    pendingEntryId = null;
    callbacks.onEntryId?.(entryId);
  };

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
      case 'run_progress_updated':
        return callbacks.onRunProgressUpdated?.(ev as never);
      case 'plan_snapshot':
        return callbacks.onPlanSnapshot?.(ev as never);
      case 'plan_step_updated':
        return callbacks.onPlanStepUpdated?.(ev as never);
      case 'tool_result_digest':
        return callbacks.onToolResultDigest?.(ev as never);
      case 'evidence_item_upserted':
        return callbacks.onEvidenceItemUpserted?.(ev as never);
      case 'content_block_upserted':
        return callbacks.onContentBlockUpserted?.(ev as never);
      case 'content_block_discarded':
        return callbacks.onContentBlockDiscarded?.(ev as never);
      case 'context_required': {
        const event = contextRequiredEvent(ev);
        if (!event) {
          console.warn('[chat] context_required 数据无效，已忽略');
          return;
        }
        return callbacks.onContextRequired?.(event);
      }
      case 'context_result': {
        const event = contextResultEvent(ev);
        if (!event) {
          console.warn('[chat] context_result 数据无效，已忽略');
          return;
        }
        return callbacks.onContextResult?.(event);
      }
      case 'context_status_updated': {
        const usage = normalizeContextUsage(ev);
        const phase = ev.phase;
        const messageId = ev.message_id;
        if (
          !usage
          || ev.protocol_version !== 2
          || (phase !== 'estimated' && phase !== 'final' && phase !== 'error')
          || typeof messageId !== 'string'
          || !messageId
        ) {
          console.warn('[chat] context_status_updated 数据无效，已忽略', ev);
          return;
        }
        return callbacks.onContextStatusUpdated?.({
          ...ev,
          ...usage,
          protocol_version: 2,
          phase,
          message_id: messageId,
        } as never);
      }
      default:
        console.warn('[chat] 未知 agent_event type，已忽略', ev.type);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (!receivedDone) {
          throw new StreamRequestError('流异常结束', { recoverable: true });
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (ctx.trackEntryId && trimmed.startsWith('id:')) {
          pendingEntryId = trimmed.slice(3).trim();
          continue;
        }

        if (!trimmed.startsWith('data:')) continue;

        const raw = trimmed.slice(5).trim();
        if (raw === '[DONE]') {
          receivedDone = true;
          commitPendingEntryId();
          continue;
        }

        let envelope: SseEnvelope<unknown>;
        try {
          envelope = JSON.parse(raw) as SseEnvelope<unknown>;
        } catch {
          console.warn('[chat] SSE 帧 JSON 解析失败，将从上一游标重连', raw);
          throw new StreamRequestError('SSE 数据解析失败', { recoverable: true });
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
            callbacks.onDone({
              messageId,
              conversationId: ctx.doneConversationId
                ? ctx.doneConversationId()
                : conversationId,
            });
            break;
          case 'error': {
            const errPayload = envelope.data as StreamErrorPayload;
            const msg = errPayload?.message ?? '模型调用失败';
            const recoverable = errPayload?.code === 'redis_read_failed';
            if (!recoverable) {
              callbacks.onError(msg, errPayload);
            }
            throw new StreamRequestError(msg, {
              recoverable,
              code: errPayload?.code,
            });
          }
          default:
            console.warn('[chat] 未知 chunk_type，已忽略', envelope.chunk_type);
        }
        commitPendingEntryId();
      }
    }
  } catch (error) {
    if (error instanceof StreamRequestError || isAbortError(error)) throw error;
    throw new StreamRequestError('网络连接中断', {
      recoverable: true,
      cause: error,
    });
  } finally {
    reader.releaseLock();
  }

  return { entryId, messageId, conversationId };
}

// ============================================================
// 流式请求
// ============================================================

export async function sendMessageStream(
  data: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetchStreamResponse(`${API_BASE_URL}/api/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ ...data, stream: true }),
  }, '请求失败');

  const reader = response.body!.getReader();
  await parseSseEnvelopeStream(reader, callbacks, {
    fallbackConversationId: data.conversation_id ?? '',
    trackEntryId: true,
  });
}

export async function continueAgentRunStream(
  data: ContinueAgentRunRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetchStreamResponse(
    `${API_BASE_URL}/api/chat/conversations/${encodeURIComponent(data.conversationId)}/messages/${encodeURIComponent(data.messageId)}/continue`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        previous_run_id: data.previousRunId ?? null,
        stream: true,
      }),
    },
    '继续执行失败',
  );

  const reader = response.body!.getReader();
  await parseSseEnvelopeStream(reader, callbacks, {
    fallbackConversationId: data.conversationId,
    trackEntryId: true,
    doneConversationId: () => data.conversationId,
  });
}

// ============================================================
// 断线重连 — GET /stream/{conv_id}
// ============================================================

export async function reconnectStream(
  conversationId: string,
  lastEntryId: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<{ entryId: string }> {
  const response = await fetchStreamResponse(
    `${API_BASE_URL}/api/chat/stream/${conversationId}?last_entry_id=${encodeURIComponent(lastEntryId)}`,
    { signal },
    '重连失败',
  );

  const reader = response.body!.getReader();
  const { entryId } = await parseSseEnvelopeStream(reader, callbacks, {
    fallbackConversationId: conversationId,
    trackEntryId: true,
    // 重连场景 done 用调用方传入的 convId（防 done 在 run_started 之前到）
    doneConversationId: () => conversationId,
  });
  return { entryId };
}

export async function stopStream(
  conversationId: string,
  messageId?: string,
  signal?: AbortSignal,
  partialContent?: ContentBlock[],
): Promise<boolean> {
  try {
    const options: RequestInit = { method: 'POST', signal };
    if (partialContent !== undefined) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify({ partial_content: partialContent });
    }
    const data = await apiRequest<{ cancelled: boolean }>(
      `${API_BASE_URL}/api/chat/stop/${conversationId}${messageId ? `?message_id=${encodeURIComponent(messageId)}` : ''}`,
      options,
    );
    return data.cancelled ?? false;
  } catch (error) {
    if (signal?.aborted || partialContent !== undefined) {
      throw error;
    }
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

export async function getConversation(conversationId: string, signal?: AbortSignal) {
  const url = `${API_BASE_URL}/api/chat/conversations/${conversationId}`;
  return signal ? apiRequest(url, { signal }) : apiRequest(url);
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
