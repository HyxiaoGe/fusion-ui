import { API_CONFIG } from '../config';
import { apiRequest } from './fetchWithAuth';
import { ApiError } from '@/types/api';

const API_BASE_URL = API_CONFIG.BASE_URL;

// ============================================================
// 流式状态 localStorage 标记
// 用一个全局 key 记录当前正在流式输出的 conversationId，
// 页面加载时检查：如果标记存在且匹配当前 chatId → 发 stop，不重连
// ============================================================

const STREAMING_KEY = 'fusion_active_stream';

/** 流开始时标记（记录 conversationId） */
export function markStreaming(conversationId: string): void {
  localStorage.setItem(STREAMING_KEY, JSON.stringify({
    conversationId,
    timestamp: Date.now(),
  }));
}

/** 流结束时（正常完成或手动停止）清除标记 */
export function clearStreamingMark(_conversationId?: string): void {
  void _conversationId;
  localStorage.removeItem(STREAMING_KEY);
}

/**
 * 检查当前 chatId 是否有活跃的流标记。
 * 只有 conversationId 匹配时才消费标记并返回，否则保留给正确的页面消费。
 */
export function consumeStreamingMark(chatId: string): string | null {
  const raw = localStorage.getItem(STREAMING_KEY);
  if (!raw) return null;
  try {
    const { conversationId, timestamp } = JSON.parse(raw);
    // 超过 10 分钟视为过期
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      localStorage.removeItem(STREAMING_KEY);
      return null;
    }
    // 只有匹配当前 chatId 才消费，不匹配则保留
    if (conversationId !== chatId) return null;
    localStorage.removeItem(STREAMING_KEY);
    return conversationId;
  } catch {
    localStorage.removeItem(STREAMING_KEY);
    return null;
  }
}

export interface StreamStatusData {
  status: 'streaming' | 'done' | 'error' | 'not_found';
  last_entry_id?: string;
  message_id?: string;
  stream_mode?: 'initial' | 'continuation';
}

export class StreamStatusRequestError extends Error {
  readonly recoverable: boolean;
  readonly code?: string;

  constructor(message: string, options: { recoverable: boolean; code?: string; cause?: unknown }) {
    super(message);
    this.name = 'StreamStatusRequestError';
    this.recoverable = options.recoverable;
    this.code = options.code;
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', { configurable: true, value: options.cause });
    }
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  );
}

export async function fetchStreamStatus(
  conversationId: string,
  signal?: AbortSignal,
): Promise<StreamStatusData> {
  try {
    const url = `${API_BASE_URL}/api/chat/stream-status/${conversationId}`;
    return await (signal
      ? apiRequest<StreamStatusData>(url, { signal })
      : apiRequest<StreamStatusData>(url));
  } catch (error) {
    if (isAbortError(error)) throw error;
    const code = error instanceof ApiError ? error.code : undefined;
    const unauthorized = code === 'UNAUTHORIZED' || code === 'FORBIDDEN' ||
      (error instanceof Error && error.message === 'Unauthorized');
    throw new StreamStatusRequestError(
      error instanceof Error ? error.message : '流状态查询失败',
      {
        recoverable: !unauthorized && code !== 'NOT_FOUND',
        code,
        cause: error,
      },
    );
  }
}
