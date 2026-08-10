import { describe, expect, it } from 'vitest';
import { getDefaultModelId, getPreferredModelId } from './modelPreference';

describe('getPreferredModelId', () => {
  const models = [
    { id: 'disabled-a', enabled: false, selectable: true },
    { id: 'hidden-a', enabled: true, selectable: false },
    { id: 'unroutable-a', enabled: true, selectable: true, routable: false },
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

  it('returns the stable default enabled model for recommendation purposes', () => {
    expect(getDefaultModelId(models)).toBe('enabled-b');
  });

  it('没有可选择模型时返回 null，不回退到隐藏或禁用模型', () => {
    expect(getPreferredModelId([
      { id: 'hidden-only', enabled: true, selectable: false },
      { id: 'disabled-only', enabled: false, selectable: true },
    ], null)).toBeNull();
  });
});
