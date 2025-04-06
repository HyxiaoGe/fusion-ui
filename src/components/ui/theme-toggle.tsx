'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { MoonIcon, SunIcon, LaptopIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const ThemeToggle = () => {
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
          aria-label="切换主题"
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
  );
}; 