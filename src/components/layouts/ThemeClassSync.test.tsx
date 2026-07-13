import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeClassSync from './ThemeClassSync';

const { themeState } = vi.hoisted(() => ({
  themeState: { mode: 'light' as 'light' | 'dark' | 'system' },
}));

vi.mock('@/redux/hooks', () => ({
  useAppSelector: (selector: (state: { theme: typeof themeState }) => unknown) => selector({ theme: themeState }),
}));

describe('ThemeClassSync', () => {
  beforeEach(() => {
    themeState.mode = 'light';
    document.documentElement.className = 'existing-class';
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    document.documentElement.className = '';
    document.documentElement.style.colorScheme = '';
    vi.restoreAllMocks();
  });

  it('全局同步亮暗主题，并保留 html 上的无关 class', async () => {
    const { rerender } = render(<ThemeClassSync />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('light', 'existing-class');
      expect(document.documentElement).not.toHaveClass('dark');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });

    themeState.mode = 'dark';
    rerender(<ThemeClassSync />);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark', 'existing-class');
      expect(document.documentElement).not.toHaveClass('light');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });
  });

  it('system 模式跟随系统主题的动态变化', async () => {
    let matches = false;
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    const removeEventListener = vi.fn();
    const mediaQuery = {
      get matches() {
        return matches;
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
        changeListener = listener;
      }),
      removeEventListener,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue(mediaQuery),
    });
    themeState.mode = 'system';

    const { unmount } = render(<ThemeClassSync />);

    await waitFor(() => expect(document.documentElement).toHaveClass('light'));
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

    matches = true;
    act(() => changeListener?.({ matches: true } as MediaQueryListEvent));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark', 'existing-class');
      expect(document.documentElement).not.toHaveClass('light');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    const registeredListener = changeListener;
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', registeredListener);
  });
});
