import { API_CONFIG } from '../config';
import fetchWithAuth from './fetchWithAuth';

const API_BASE_URL = API_CONFIG.BASE_URL;

// ============================================================
// 流式状态 localStorage 标记
// 用于跨页面刷新传递 stop 意图，解决 beforeunload 不可靠的问题
// ============================================================

const STREAMING_FLAG_PREFIX = 'fusion_streaming_';

/** 流开始时标记 */
export function markStreaming(conversationId: string): void {
  localStorage.setItem(`${STREAMING_FLAG_PREFIX}${conversationId}`, Date.now().toString());
}

/** 流结束时（正常完成或手动停止）清除标记 */
export function clearStreamingMark(conversationId: string): void {
  localStorage.removeItem(`${STREAMING_FLAG_PREFIX}${conversationId}`);
}

/**
 * 检查是否有未清除的流标记（说明上次页面非正常退出）。
 * 返回 true 表示应该先 stop 再决定是否重连。
 */
export function hasStreamingMark(conversationId: string): boolean {
  const val = localStorage.getItem(`${STREAMING_FLAG_PREFIX}${conversationId}`);
  if (!val) return false;
  // 超过 10 分钟的标记视为过期（兜底清理）
  const age = Date.now() - parseInt(val, 10);
  if (age > 10 * 60 * 1000) {
    localStorage.removeItem(`${STREAMING_FLAG_PREFIX}${conversationId}`);
    return false;
  }
  return true;
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
