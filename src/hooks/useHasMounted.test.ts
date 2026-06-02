import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useHasMounted } from './useHasMounted';

describe('useHasMounted', () => {
  it('is true after the component has mounted (client)', () => {
    const { result } = renderHook(() => useHasMounted());
    // After render + effects flush, the client is mounted.
    expect(result.current).toBe(true);
  });
});
