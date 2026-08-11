import { beforeEach, describe, expect, it } from 'vitest';
import reducer, { setModelsLoadStatus, updateModels } from './modelsSlice';

describe('modelsSlice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('prefers the first enabled model when the saved model is disabled', () => {
    localStorage.setItem('selectedModelId', 'disabled-model');

    const nextState = reducer(
      undefined,
      updateModels([
        {
          id: 'disabled-model',
          name: 'Disabled',
          provider: 'qwen',
          temperature: 0.7,
          capabilities: {},
          enabled: false,
        },
        {
          id: 'enabled-model',
          name: 'Enabled',
          provider: 'qwen',
          temperature: 0.7,
          capabilities: {},
          enabled: true,
        },
      ]),
    );

    expect(nextState.selectedModelId).toBe('enabled-model');
    expect(localStorage.getItem('selectedModelId')).toBe('enabled-model');
    expect(nextState.loadStatus).toBe('ready');
    expect(nextState.isLoading).toBe(false);
  });

  it('keeps an enabled saved model', () => {
    localStorage.setItem('selectedModelId', 'enabled-model');

    const nextState = reducer(
      undefined,
      updateModels([
        {
          id: 'enabled-model',
          name: 'Enabled',
          provider: 'qwen',
          temperature: 0.7,
          capabilities: {},
          enabled: true,
        },
      ]),
    );

    expect(nextState.selectedModelId).toBe('enabled-model');
  });

  it('保留隐藏模型供已有对话使用，但新对话偏好切换到可选择模型', () => {
    localStorage.setItem('selectedModelId', 'hidden-model');

    const nextState = reducer(
      undefined,
      updateModels([
        {
          id: 'hidden-model',
          name: 'Hidden',
          provider: 'qwen',
          temperature: 0.7,
          capabilities: {},
          enabled: true,
          selectable: false,
          routable: true,
        },
        {
          id: 'visible-model',
          name: 'Visible',
          provider: 'qwen',
          temperature: 0.7,
          capabilities: {},
          enabled: true,
          selectable: true,
          routable: true,
        },
      ]),
    );

    expect(nextState.models).toHaveLength(2);
    expect(nextState.models[0]).toMatchObject({ id: 'hidden-model', selectable: false, routable: true });
    expect(nextState.selectedModelId).toBe('visible-model');
  });

  it('记录模型目录初始化生命周期', () => {
    const loadingState = reducer(undefined, setModelsLoadStatus('loading'));
    const failedState = reducer(loadingState, setModelsLoadStatus('failed'));

    expect(loadingState.loadStatus).toBe('loading');
    expect(loadingState.isLoading).toBe(true);
    expect(failedState.loadStatus).toBe('failed');
    expect(failedState.isLoading).toBe(false);
  });
});
