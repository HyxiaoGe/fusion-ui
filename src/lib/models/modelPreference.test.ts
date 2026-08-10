import { describe, expect, it } from 'vitest';
import {
  getDefaultModelId,
  getPreferredModelId,
  isModelSelectable,
  isModelVisibleInSelector,
} from './modelPreference';

describe('getPreferredModelId', () => {
  const models = [
    { id: 'disabled-a', enabled: false, selectable: true },
    { id: 'hidden-a', enabled: true, selectable: false },
    { id: 'unroutable-a', enabled: true, selectable: true, routable: false },
    { id: 'unhealthy-a', enabled: true, selectable: true, routable: true, health: { status: 'unhealthy' as const } },
    { id: 'enabled-b', enabled: true, selectable: true },
    { id: 'enabled-c', enabled: true, selectable: true },
  ];

  it('keeps a requested enabled model', () => {
    expect(getPreferredModelId(models, 'enabled-c')).toBe('enabled-c');
  });

  it('falls back to the first enabled model when the requested one is disabled', () => {
    expect(getPreferredModelId(models, 'disabled-a')).toBe('enabled-b');
  });

  it('新对话不会沿用已隐藏但仍可路由的模型偏好', () => {
    expect(getPreferredModelId(models, 'hidden-a')).toBe('enabled-b');
  });

  it('新对话不会沿用不可路由的模型偏好', () => {
    expect(getPreferredModelId(models, 'unroutable-a')).toBe('enabled-b');
  });

  it('新对话不会沿用健康异常但显式可路由的模型偏好', () => {
    expect(getPreferredModelId(models, 'unhealthy-a')).toBe('enabled-b');
  });

  it('returns the stable default enabled model for recommendation purposes', () => {
    expect(getDefaultModelId(models)).toBe('enabled-b');
  });

  it('没有可选择模型时返回 null，不回退到隐藏或禁用模型', () => {
    expect(getPreferredModelId([
      { id: 'hidden-only', enabled: true, selectable: false },
      { id: 'disabled-only', enabled: false, selectable: true },
    ], null)).toBeNull();
  });

  it('健康异常模型保留诊断展示，但禁止新对话选择', () => {
    const unhealthy = models.find((model) => model.id === 'unhealthy-a')!;

    expect(isModelVisibleInSelector(unhealthy)).toBe(true);
    expect(isModelSelectable(unhealthy)).toBe(false);
  });
});
