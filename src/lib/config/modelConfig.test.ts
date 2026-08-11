import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock('@/lib/api/fetchWithAuth', () => ({ apiRequest: apiRequestMock }));

import { convertApiModelToModelInfo, fetchModels, refreshModels } from './modelConfig';

describe('modelConfig', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

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

  it('保留模型的新选择可见性与已有对话可路由状态', () => {
    const model = convertApiModelToModelInfo({
      modelId: 'hidden-model',
      name: 'Hidden Model',
      provider: 'test',
      capabilities: {},
      enabled: true,
      selectable: false,
      routable: true,
    });

    expect(model.selectable).toBe(false);
    expect(model.routable).toBe(true);
  });

  it('强制刷新等待旧请求后重新读取目录，不复用写操作前响应', async () => {
    let resolveOldRequest!: (value: { models: []; providers: [] }) => void;
    const oldRequest = new Promise<{ models: []; providers: [] }>((resolve) => {
      resolveOldRequest = resolve;
    });
    apiRequestMock
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce({
        models: [{
          modelId: 'new-model',
          name: 'New Model',
          provider: 'test',
          capabilities: {},
          enabled: true,
        }],
        providers: [],
      });

    const initial = fetchModels();
    const refreshed = refreshModels();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    resolveOldRequest({ models: [], providers: [] });
    await initial;

    const result = await refreshed;
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
    expect(result.models.map((model) => model.id)).toEqual(['new-model']);
  });
});
