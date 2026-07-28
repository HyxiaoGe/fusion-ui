import { describe, expect, it } from 'vitest';

import { normalizeAgentRunConfig } from './runConfig';

describe('normalizeAgentRunConfig', () => {
  it('完整映射深度研究 run config', () => {
    expect(normalizeAgentRunConfig({
      max_steps: 12,
      max_tool_calls: 30,
      timeout_s: 600,
      task_mode: 'deep_research',
      network_profile: 'deep_research',
      evidence_policy: 'deep_research_v1',
    })).toEqual({
      maxSteps: 12,
      maxToolCalls: 30,
      timeoutS: 600,
      taskMode: 'deep_research',
      networkProfile: 'deep_research',
      evidencePolicy: 'deep_research_v1',
    });
  });

  it('旧历史和未知值安全归一化为标准模式', () => {
    expect(normalizeAgentRunConfig({})).toEqual({
      maxSteps: 0,
      maxToolCalls: 0,
      timeoutS: 0,
      taskMode: 'standard',
      networkProfile: 'standard',
      evidencePolicy: 'standard',
    });
  });
});
