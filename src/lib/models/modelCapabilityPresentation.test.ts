import { describe, expect, it } from 'vitest';

import {
  buildModelCapabilityLabels,
  buildModelCapabilityTooltip,
} from './modelCapabilityPresentation';

describe('modelCapabilityPresentation', () => {
  it('为支持 agent tools 的模型展示可联网、读图、工具和深度任务标签', () => {
    const labels = buildModelCapabilityLabels({
      id: 'deepseek-v4-flash',
      name: 'DeepSeek V4 Flash',
      provider: 'deepseek',
      temperature: 0.7,
      enabled: true,
      contextWindowTokens: 128000,
      capabilities: {
        searchCapable: true,
        agentTools: true,
        functionCalling: true,
        webSearch: true,
        vision: true,
        deepThinking: true,
      },
    });

    expect(labels.map((label) => label.text)).toEqual(['可联网', '读图', '工具', '长上下文', '深度任务']);
    expect(labels[0].tone).toBe('success');
  });

  it('上下文窗口达到 128k 时展示长上下文标签和 tooltip 说明', () => {
    const model = {
      id: 'long-context-model',
      name: 'Long Context Model',
      provider: 'openai',
      temperature: 0.7,
      enabled: true,
      contextWindowTokens: 1_000_000,
      capabilities: {
        searchCapable: false,
        agentTools: false,
        vision: false,
      },
    };

    const labels = buildModelCapabilityLabels(model);
    const tooltip = buildModelCapabilityTooltip(model);

    expect(labels.map((label) => label.text)).toContain('长上下文');
    expect(tooltip).toContain('上下文窗口约 100万 tokens');
  });

  it('优先用 searchCapable=true 判断模型可联网', () => {
    const labels = buildModelCapabilityLabels({
      id: 'search-contract-model',
      name: 'Search Contract Model',
      provider: 'openai',
      temperature: 0.7,
      enabled: true,
      capabilities: {
        searchCapable: true,
        agentTools: false,
        webSearch: false,
      },
    });

    expect(labels.map((label) => label.text)).toContain('可联网');
    expect(labels.map((label) => label.text)).not.toContain('不可联网');
  });

  it('searchCapable=false 时即使 webSearch=true 也展示不可联网', () => {
    const model = {
      id: 'search-disabled-model',
      name: 'Search Disabled Model',
      provider: 'openai',
      temperature: 0.7,
      enabled: true,
      capabilities: {
        searchCapable: false,
        agentTools: true,
        webSearch: true,
      },
    };

    const labels = buildModelCapabilityLabels(model);
    const tooltip = buildModelCapabilityTooltip(model);

    expect(labels.map((label) => label.text)).toContain('不可联网');
    expect(labels.map((label) => label.text)).not.toContain('可联网');
    expect(tooltip).toContain('不支持联网搜索');
  });

  it('为不支持 agent tools 的模型明确展示不可联网而不是工具调用', () => {
    const labels = buildModelCapabilityLabels({
      id: 'qwen-vl-max',
      name: 'Qwen VL Max',
      provider: 'qwen',
      temperature: 0.7,
      enabled: true,
      capabilities: {
        searchCapable: false,
        agentTools: false,
        functionCalling: true,
        vision: true,
      },
    });

    expect(labels.map((label) => label.text)).toContain('不可联网');
    expect(labels.map((label) => label.text)).not.toContain('工具');
  });

  it('为当前模型生成包含能力边界和健康状态的 tooltip 文案', () => {
    const tooltip = buildModelCapabilityTooltip({
      id: 'legacy-model',
      name: '旧模型',
      provider: 'qwen',
      temperature: 0.7,
      enabled: true,
      capabilities: {
        searchCapable: false,
        agentTools: false,
        functionCalling: true,
        vision: false,
        deepThinking: false,
      },
      health: {
        status: 'unhealthy',
        error: '模型已下线',
      },
    });

    expect(tooltip).toContain('旧模型');
    expect(tooltip).toContain('不支持联网搜索');
    expect(tooltip).toContain('不支持图片理解');
    expect(tooltip).toContain('健康状态异常：模型已下线');
  });
});
