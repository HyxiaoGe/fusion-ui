'use client';

import { useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

/**
 * 把 'light' | 'dark' | 'system' 解析为实际的 'light' | 'dark'。
 * - 'light' / 'dark' 直接返回（包括 SSR 首次 render）
 * - 'system' 通过 matchMedia 解析，并订阅 change 事件自动更新
 *
 * 初始值从 mode 派生：'dark' 立即返回 'dark'，'light'/'system' 默认 'light'，
 * 客户端 hydrate 后 useEffect 处理 'system' 的真实 matchMedia 值。
 * 避免 dark 直设模式下首次 render 显示错误图标的闪现 bug。
 *
 * SSR 安全：服务端 'system' 默认返回 'light'（无 matchMedia）。
 */
export function useResolvedTheme(mode: ThemeMode): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(
    mode === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    if (mode !== 'system') {
      setResolved(mode);
      return;
    }

    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolved(media.matches ? 'dark' : 'light');
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [mode]);

  return resolved;
}
