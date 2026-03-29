import { API_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

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

export interface StreamStatusResponse {
  status: 'streaming' | 'done' | 'error' | 'not_found';
  // 仅 status=streaming 时返回
  last_entry_id?: string;
  message_id?: string;
}

/**
 * 查询指定会话的流式状态
 * 用于页面 mount 时判断是否有未完成的流需要恢复
 */
export async function fetchStreamStatus(
  conversationId: string
): Promise<StreamStatusResponse> {
  try {
    const response = await fetchWithAuth(`${API_BASE_URL}/api/chat/stream-status/${conversationId}`);
    if (!response.ok) {
      return { status: 'not_found' };
    }
    return response.json();
  } catch {
    return { status: 'not_found' };
  }
}
