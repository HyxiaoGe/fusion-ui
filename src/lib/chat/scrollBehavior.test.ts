import { describe, expect, it } from 'vitest';

import { isNearBottom } from './scrollBehavior';

describe('isNearBottom', () => {
  it('returns true when the user is within the threshold', () => {
    const element = {
      scrollHeight: 1200,
      scrollTop: 700,
      clientHeight: 400,
    } as HTMLElement;

    expect(isNearBottom(element)).toBe(true);
  });

  it('returns false when the user is far from the bottom', () => {
    const element = {
      scrollHeight: 1600,
      scrollTop: 600,
      clientHeight: 400,
    } as HTMLElement;

    expect(isNearBottom(element)).toBe(false);
  });
});
