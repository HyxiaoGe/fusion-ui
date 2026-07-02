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
});
