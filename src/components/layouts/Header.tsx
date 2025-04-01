'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { HomeIcon, MoonIcon, SettingsIcon, SunIcon, LaptopIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    dispatch(setThemeMode(value));
  };
  
  // 获取当前主题对应的图标
  const ThemeIcon = mounted ? (mode === 'dark' ? MoonIcon : mode === 'light' ? SunIcon : LaptopIcon) : null;
  
  // 获取图标颜色样式
  const getIconColorClass = () => {
    switch (mode) {
      case 'light':
        return 'text-amber-500';
      case 'dark':
        return 'text-indigo-400';
      default:
        return 'text-blue-500';
    }
  };
  
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className={cn(
                "h-9 w-9 rounded-full shadow-sm transition-all duration-300",
                "hover:scale-110 hover:shadow-md hover:rotate-12",
                "bg-muted",
                getIconColorClass()
              )}
            >
              {ThemeIcon && <ThemeIcon className="h-4 w-4 transition-transform" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => handleThemeChange('light')} 
              className={cn(
                "flex items-center gap-2 cursor-pointer",
                mode === 'light' && "bg-amber-50 dark:bg-amber-950/30",
                mode === 'light' ? "text-amber-500" : "text-foreground hover:text-amber-500"
              )}
            >
              <SunIcon className="h-4 w-4" />
              <span>浅色</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleThemeChange('dark')} 
              className={cn(
                "flex items-center gap-2 cursor-pointer",
                mode === 'dark' && "bg-indigo-50 dark:bg-indigo-950/30",
                mode === 'dark' ? "text-indigo-400" : "text-foreground hover:text-indigo-400"
              )}
            >
              <MoonIcon className="h-4 w-4" />
              <span>深色</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => handleThemeChange('system')} 
              className={cn(
                "flex items-center gap-2 cursor-pointer",
                mode === 'system' && "bg-blue-50 dark:bg-blue-950/30",
                mode === 'system' ? "text-blue-500" : "text-foreground hover:text-blue-500"
              )}
            >
              <LaptopIcon className="h-4 w-4" />
              <span>跟随系统</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;