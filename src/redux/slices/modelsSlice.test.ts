import { describe, expect, it, beforeEach, vi } from 'vitest';
import reducer, { updateModels } from './modelsSlice';

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
});
