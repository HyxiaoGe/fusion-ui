'use client';

import React from 'react';
import { useAppSelector } from '@/redux/hooks';

interface MainLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, sidebar }) => {
  const themeMode = useAppSelector((state) => state.theme.mode);

  // 根据系统和用户设置应用主题
  React.useEffect(() => {
    const root = window.document.documentElement;
    
    if (themeMode === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      
      root.classList.remove('light', 'dark');
      root.classList.add(systemTheme);
    } else {
      root.classList.remove('light', 'dark');
      root.classList.add(themeMode);
    }
  }, [themeMode]);

  return (
    <div className="h-screen flex flex-col">
      <header className="h-14 border-b flex items-center px-4">
        <h1 className="text-xl font-bold">小助手</h1>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {sidebar && (
          <aside className="w-64 border-r bg-slate-50 dark:bg-slate-900 overflow-y-auto">
            {sidebar}
          </aside>
        )}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;