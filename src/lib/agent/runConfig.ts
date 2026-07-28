import type { AgentRunConfig } from '@/types/agentRun';

interface WireRunConfig {
  max_steps?: unknown;
  max_tool_calls?: unknown;
  timeout_s?: unknown;
  task_mode?: unknown;
  network_profile?: unknown;
  evidence_policy?: unknown;
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function normalizeAgentRunConfig(config: WireRunConfig | null | undefined): AgentRunConfig {
  const source = config ?? {};
  const taskMode = source.task_mode === 'deep_research' ? 'deep_research' : 'standard';

  return {
    maxSteps: nonNegativeNumber(source.max_steps),
    maxToolCalls: nonNegativeNumber(source.max_tool_calls),
    timeoutS: nonNegativeNumber(source.timeout_s),
    taskMode,
    networkProfile: source.network_profile === 'deep_research' || taskMode === 'deep_research'
      ? 'deep_research'
      : 'standard',
    evidencePolicy: source.evidence_policy === 'deep_research_v1' || taskMode === 'deep_research'
      ? 'deep_research_v1'
      : 'standard',
  };
}
