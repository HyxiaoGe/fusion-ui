import { getTrajectoryLlmNodeDetail } from '@/lib/api/trajectory';
import type { TrajectoryLlmRoundSummary } from '@/types/trajectory';

const DEFAULT_MAX_REQUESTS = 7;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const PREVIEW_LIMIT = 200;

export interface SettleTrajectoryLlmNodeDetailInput {
  conversationId: string;
  runId: string;
  llmRoundId: string;
  signal?: AbortSignal;
  maxRequests?: number;
  retryDelayMs?: number;
}

/** 在有限窗口内把 LLM 终态事件收敛为单节点 preview，不重拉整份快照。 */
export async function settleTrajectoryLlmNodeDetail({
  conversationId,
  runId,
  llmRoundId,
  signal,
  maxRequests = DEFAULT_MAX_REQUESTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: SettleTrajectoryLlmNodeDetailInput): Promise<TrajectoryLlmRoundSummary | null> {
  for (let requestCount = 0; requestCount < maxRequests; requestCount += 1) {
    if (signal?.aborted) return null;
    const response = await getTrajectoryLlmNodeDetail(
      conversationId,
      runId,
      llmRoundId,
      signal,
    );
    if (
      response.status === 'available'
      && response.node_type === 'llm'
      && response.detail
      && 'llm_round_id' in response.detail
      && response.detail.llm_round_id === llmRoundId
    ) {
      return {
        llm_round_id: llmRoundId,
        reasoning_preview: preview(response.detail.reasoning_text),
        output_preview: preview(response.detail.output_text),
      };
    }
    if (response.status !== 'pending' || requestCount + 1 >= maxRequests) return null;
    await delay(retryDelayMs, signal);
  }
  return null;
}

function preview(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, PREVIEW_LIMIT);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
