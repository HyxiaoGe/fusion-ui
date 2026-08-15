import { describe, expect, it } from 'vitest';

import { normalizeAgentRunConfig } from './runConfig';

describe('normalizeAgentRunConfig', () => {
  it('完整映射深度研究 run config', () => {
    expect(normalizeAgentRunConfig({
      max_steps: 12,
      max_tool_calls: 30,
      timeout_s: 600,
      plan_mode: 'on',
      task_mode: 'deep_research',
      network_profile: 'deep_research',
      evidence_policy: 'deep_research_v1',
    })).toEqual({
      maxSteps: 12,
      maxToolCalls: 30,
      timeoutS: 600,
      planMode: 'on',
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
      planMode: 'auto',
      taskMode: 'standard',
      networkProfile: 'standard',
      evidencePolicy: 'standard',
    });
  });

  it('保留严格知识库 evidence policy，不归一成 standard', () => {
    expect(normalizeAgentRunConfig({
      max_steps: 1,
      max_tool_calls: 1,
      timeout_s: 30,
      plan_mode: 'auto',
      task_mode: 'standard',
      network_profile: 'standard',
      evidence_policy: 'knowledge_grounded_v1',
    })).toEqual({
      maxSteps: 1,
      maxToolCalls: 1,
      timeoutS: 30,
      planMode: 'auto',
      taskMode: 'standard',
      networkProfile: 'standard',
      evidencePolicy: 'knowledge_grounded_v1',
    });
  });
});
