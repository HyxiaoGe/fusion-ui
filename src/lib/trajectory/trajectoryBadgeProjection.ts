import type { TrajectorySnapshotCacheEntry } from '@/redux/slices/trajectorySlice';
import type { Message } from '@/types/conversation';
import type { TrajectoryRunSummary } from '@/types/trajectory';
import type { TrajectoryBadgeStatus } from './TrajectoryCellProjection';

function summaryStatus(value: string | null): TrajectoryBadgeStatus {
  if (value === 'recording' || value === 'complete' || value === 'degraded' || value === 'legacy') {
    return value;
  }
  return 'unknown';
}

function runBadgeStatus(
  run: TrajectoryRunSummary,
  snapshot: TrajectorySnapshotCacheEntry | undefined,
): TrajectoryBadgeStatus {
  if (!snapshot) return summaryStatus(run.trajectory_status);
  if (snapshot.truncated) return 'truncated';
  if (snapshot.completeness.status === 'legacy'
    || run.trajectory_status === 'legacy'
    || snapshot.hasLegacyEvents) return 'legacy';
  if (snapshot.completeness.status === 'degraded' || run.trajectory_status === 'degraded') {
    return 'degraded';
  }
  if (snapshot.completeness.status === 'complete') return 'complete';
  return summaryStatus(run.trajectory_status);
}

/**
 * 为 Chat 状态行派生轻量 badge；只读取有界 run 摘要和 snapshot 元数据，
 * 不访问 selected run 的 records、live tail，也不调用详情投影器。
 */
export function deriveTrajectoryBadgeStatusByMessageId(input: {
  messages: readonly Message[];
  runs: readonly TrajectoryRunSummary[];
  snapshotsByRunId: Readonly<Record<string, TrajectorySnapshotCacheEntry | undefined>>;
}): Map<string, TrajectoryBadgeStatus> {
  const assistantMessageIds = new Set(
    input.messages.filter(message => message.role === 'assistant').map(message => message.id),
  );
  const latestRunByMessageId = new Map<string, TrajectoryRunSummary>();

  for (const run of input.runs) {
    if (!run.message_id || !assistantMessageIds.has(run.message_id)) continue;
    const current = latestRunByMessageId.get(run.message_id);
    const currentAttempt = current?.attempt_index ?? -1;
    const candidateAttempt = run.attempt_index ?? -1;
    if (!current
      || candidateAttempt > currentAttempt
      || (candidateAttempt === currentAttempt && run.started_at > current.started_at)) {
      latestRunByMessageId.set(run.message_id, run);
    }
  }

  const result = new Map<string, TrajectoryBadgeStatus>();
  for (const [messageId, run] of latestRunByMessageId) {
    result.set(messageId, runBadgeStatus(run, input.snapshotsByRunId[run.run_id]));
  }
  for (const message of input.messages) {
    if (message.role === 'assistant' && message.agent_run && !result.has(message.id)) {
      result.set(message.id, 'summary-only');
    }
  }
  return result;
}
