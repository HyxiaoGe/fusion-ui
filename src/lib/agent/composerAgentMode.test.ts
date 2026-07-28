import { describe, expect, it } from 'vitest';

import {
  getComposerAgentModeAvailability,
  resolveComposerAgentMode,
} from './composerAgentMode';

describe('composerAgentMode', () => {
  it.each([
    ['auto', 'auto', 'standard', 'auto'],
    ['plan', 'on', 'standard', 'plan'],
    ['deep_research', 'on', 'deep_research', 'deep_research'],
  ] as const)('把 %s 映射为 plan_mode=%s 与 task_mode=%s', (
    requestedMode,
    planMode,
    taskMode,
    effectiveMode,
  ) => {
    expect(resolveComposerAgentMode(requestedMode, {
      functionCalling: true,
      searchCapable: true,
      agentTools: true,
    })).toMatchObject({
      requestedMode,
      effectiveMode,
      planMode,
      taskMode,
    });
  });

  it('计划只要求工具调用，深度研究还要求联网工具', () => {
    expect(getComposerAgentModeAvailability('plan', {
      functionCalling: true,
      searchCapable: false,
      agentTools: false,
    })).toEqual({ enabled: true });
    expect(getComposerAgentModeAvailability('deep_research', {
      functionCalling: true,
      searchCapable: false,
      agentTools: false,
    })).toEqual({
      enabled: false,
      unavailableReason: '深度研究需要支持联网工具',
    });
  });

  it('不能只凭 agentTools 放行深度研究，searchCapable 必须明确为 true', () => {
    expect(getComposerAgentModeAvailability('deep_research', {
      functionCalling: true,
      searchCapable: false,
      agentTools: true,
    })).toEqual({
      enabled: false,
      unavailableReason: '深度研究需要支持联网工具',
    });
  });

  it('模型能力不满足时安全回退自动模式', () => {
    expect(resolveComposerAgentMode('deep_research', {
      functionCalling: false,
      searchCapable: true,
    })).toEqual({
      requestedMode: 'deep_research',
      effectiveMode: 'auto',
      planMode: 'auto',
      taskMode: 'standard',
      fallbackReason: '深度研究需要支持工具调用与联网工具',
    });
  });
});
