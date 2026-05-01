import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResolvedTheme } from './useResolvedTheme';

beforeEach(() => {
  // jsdom 不实现 matchMedia，mock 一个默认返回 matches: false（系统亮色）
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe('useResolvedTheme', () => {
  it("'light' 模式返回 'light'", () => {
    const { result } = renderHook(() => useResolvedTheme('light'));
    expect(result.current).toBe('light');
  });

  it("'dark' 模式首次 render 即返回 'dark'（修复闪现 bug）", () => {
    const { result } = renderHook(() => useResolvedTheme('dark'));
    expect(result.current).toBe('dark');
  });

  it("'system' 模式：matchMedia matches=false 时返回 'light'", () => {
    const { result } = renderHook(() => useResolvedTheme('system'));
    expect(result.current).toBe('light');
  });

  it("'system' 模式：订阅 matchMedia change 事件", () => {
    const addEventListener = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener,
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    renderHook(() => useResolvedTheme('system'));
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it("mode 切换时重新解析", () => {
    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'light' | 'dark' | 'system' }) => useResolvedTheme(mode),
      { initialProps: { mode: 'light' } }
    );
    expect(result.current).toBe('light');

    rerender({ mode: 'dark' });
    expect(result.current).toBe('dark');
  });
});
