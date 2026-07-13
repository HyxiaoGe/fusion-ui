'use client';

import { useEffect } from 'react';
import { useAppSelector } from '@/redux/hooks';
import { useResolvedTheme } from '@/lib/hooks/useResolvedTheme';

export default function ThemeClassSync() {
  const themeMode = useAppSelector((state) => state.theme.mode);
  const resolvedTheme = useResolvedTheme(themeMode);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  return null;
}
