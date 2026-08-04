import { describe, expect, it } from 'vitest';
import { resolveSendModel } from './sendModelResolution';

function createState() {
  return {
    models: {
      selectedModelId: 'hidden-model',
      models: [
        {
          id: 'hidden-model',
          name: 'Hidden Model',
          provider: 'test',
          temperature: 0.7,
          capabilities: {},
          enabled: true,
          selectable: false,
          routable: true,
          health: { status: 'unhealthy' },
        },
        {
          id: 'visible-model',
          name: 'Visible Model',
          provider: 'test',
          temperature: 0.7,
          capabilities: {},
          enabled: true,
          selectable: true,
          routable: true,
        },
      ],
    },
    conversation: {
      byId: {
        'chat-1': {
          id: 'chat-1',
          model_id: 'hidden-model',
        },
      },
    },
  } as never;
}

describe('resolveSendModel 的 selectable/routable 边界', () => {
  it('新对话跳过 selectable=false 的模型', () => {
    const resolution = resolveSendModel(createState(), null);

    expect(resolution).toMatchObject({
      status: 'ready',
      model: { id: 'visible-model' },
    });
  });

  it('已有对话仍可使用 selectable=false 但 enabled/routable 的绑定模型，不受展示健康状态影响', () => {
    const resolution = resolveSendModel(createState(), 'chat-1');

    expect(resolution).toMatchObject({
      status: 'ready',
      model: { id: 'hidden-model' },
    });
  });

  it('已有对话绑定模型 routable=false 时阻止发送', () => {
    const state = createState() as any;
    state.models.models[0].routable = false;

    expect(resolveSendModel(state, 'chat-1')).toEqual({
      status: 'conversation_model_unavailable',
    });
  });
});
