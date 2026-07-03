import { describe, expect, it } from 'vitest';

import { convertApiModelToModelInfo } from './modelConfig';

describe('modelConfig', () => {
  it('保留模型上下文窗口和输出 token 上限字段', () => {
    const model = convertApiModelToModelInfo({
      modelId: 'xiaomi/mimo-v2.5-pro',
      name: 'MiMo V2.5 Pro',
      provider: 'xiaomi',
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 32_768,
      capabilities: {
        searchCapable: true,
        agentTools: true,
        functionCalling: true,
      },
      enabled: true,
    });

    expect(model.contextWindowTokens).toBe(1_000_000);
    expect(model.maxOutputTokens).toBe(32_768);
  });

  it('保留后端返回的模型能力展示配置', () => {
    const model = convertApiModelToModelInfo({
      modelId: 'deepseek-chat',
      name: 'DeepSeek V4 Flash',
      provider: 'deepseek',
      capabilities: {
        searchCapable: true,
        agentTools: true,
      },
      capabilityPresentation: {
        score: 88,
        level: 'recommended',
        headline: '后端推荐标题',
        reasons: ['后端推荐原因'],
        warnings: ['后端风险提示'],
        tooltip: '后端 tooltip',
        labels: [{ key: 'network', text: '可联网', tone: 'success' }],
      },
      enabled: true,
    });

    expect(model.capabilityPresentation?.score).toBe(88);
    expect(model.capabilityPresentation?.headline).toBe('后端推荐标题');
    expect(model.capabilityPresentation?.tooltip).toBe('后端 tooltip');
  });
});
