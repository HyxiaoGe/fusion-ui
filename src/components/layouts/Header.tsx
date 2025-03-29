'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { HomeIcon, MoonIcon, SettingsIcon, SunIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';

const Header: React.FC = () => {
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { mode } = useAppSelector((state) => state.theme);
  const [mounted, setMounted] = useState(false);
  
  // 确保组件挂载后再渲染主题图标，避免服务端和客户端不一致
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 切换主题
  const toggleTheme = () => {
    const newMode = mode === 'dark' ? 'light' : 'dark';
    dispatch(setThemeMode(newMode));
  };
  
  // 获取当前主题对应的图标
  const ThemeIcon = mounted ? (mode === 'dark' ? SunIcon : MoonIcon) : null;
  
  return (
    <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm bg-background">
      <Link href="/" className="text-xl font-bold flex items-center">
        <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
      </Link>
      
      {/* <div className="flex-1 max-w-lg mx-4">
        <GlobalSearch />
      </div> */}

      <div className="flex items-center gap-3">
        <Link href="/" passHref>
          <Button 
            variant={pathname === '/' ? 'default' : 'ghost'} 
            size="icon" 
            className={cn(
              "h-9 w-9 rounded-full shadow-sm transition-all duration-300",
              "hover:scale-110 hover:shadow-md",
              pathname === '/' ? "bg-primary text-primary-foreground" : "text-foreground"
            )}
          >
            <HomeIcon className="h-4 w-4 transition-transform" />
          </Button>
        </Link>
        <Link href="/settings" passHref>
          <Button 
            variant={pathname === '/settings' ? 'default' : 'ghost'} 
            size="icon" 
            className={cn(
              "h-9 w-9 rounded-full shadow-sm transition-all duration-300",
              "hover:scale-110 hover:shadow-md",
              pathname.startsWith('/settings') ? "bg-primary text-primary-foreground" : "text-foreground"
            )} 
          >
            <SettingsIcon className="h-4 w-4 transition-transform" />
          </Button>
        </Link>
        
        {/* 主题切换按钮 */}
        {mounted && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleTheme}
            className={cn(
              "h-9 w-9 rounded-full shadow-sm transition-all duration-300",
              "hover:scale-110 hover:shadow-md hover:rotate-12",
              "bg-muted text-foreground"
            )}
          >
            {ThemeIcon && <ThemeIcon className="h-4 w-4 transition-transform" />}
          </Button>
        )}
      </div>
    </header>
  );
};

export default Header;