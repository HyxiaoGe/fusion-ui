import { describe, expect, it } from 'vitest';
import { getDefaultModelId, getPreferredModelId } from './modelPreference';

describe('getPreferredModelId', () => {
  const models = [
    { id: 'disabled-a', enabled: false },
    { id: 'enabled-b', enabled: true },
    { id: 'enabled-c', enabled: true },
  ];

  it('keeps a requested enabled model', () => {
    expect(getPreferredModelId(models, 'enabled-c')).toBe('enabled-c');
  });

  it('falls back to the first enabled model when the requested one is disabled', () => {
    expect(getPreferredModelId(models, 'disabled-a')).toBe('enabled-b');
  });

  it('returns the stable default enabled model for recommendation purposes', () => {
    expect(getDefaultModelId(models)).toBe('enabled-b');
  });

  it('falls back to the first model when none are enabled', () => {
    expect(getPreferredModelId([{ id: 'disabled-only', enabled: false }], null)).toBe('disabled-only');
  });
});
