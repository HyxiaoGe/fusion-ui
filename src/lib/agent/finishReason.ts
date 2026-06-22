import type { AgentRunStatus } from '@/types/agentRun';

export type CompletedAgentRunStatus = Exclude<AgentRunStatus, 'running'>;

export function getRunStatusFromFinishReason(finishReason: string): CompletedAgentRunStatus {
  if (finishReason === 'limit_reached') return 'limit_reached';
  if (finishReason === 'incomplete') return 'incomplete';
  return 'completed';
}
