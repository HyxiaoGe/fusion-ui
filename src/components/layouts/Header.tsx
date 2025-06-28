'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { openSettingsDialog } from '@/redux/slices/settingsSlice';
import { HomeIcon, MoonIcon, SettingsIcon, SunIcon, LaptopIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useEffect, useState, useCallback, memo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = memo(({ title }) => {
  const pathname = usePathname() || '/';
  const dispatch = useAppDispatch();
  const { mode } = useAppSelector((state) => state.theme);
  const [mounted, setMounted] = useState(false);
  const { activeChatId, chats } = useAppSelector((state) => state.chat);
  const { models, selectedModelId } = useAppSelector((state) => state.models);
  
  // 确保组件挂载后再渲染主题图标，避免服务端和客户端不一致
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 切换主题 - 使用useCallback优化
  const handleThemeChange = useCallback((value: 'light' | 'dark' | 'system') => {
    dispatch(setThemeMode(value));
  }, [dispatch]);

  // 打开设置弹窗 - 使用useCallback优化
  const handleOpenSettings = useCallback(() => {
    dispatch(openSettingsDialog({}));
  }, [dispatch]);
  
  // 获取当前主题对应的图标
  const ThemeIcon = mounted ? (mode === 'dark' ? MoonIcon : mode === 'light' ? SunIcon : LaptopIcon) : null;
  
  // 获取图标颜色样式
  const getIconColorClass = useCallback(() => {
    switch (mode) {
      case 'light':
        return 'text-amber-500';
      case 'dark':
        return 'text-indigo-400';
      default:
        return 'text-blue-500';
    }
  }, [mode]);
  
  // 获取当前选中的模型名称
  const getSelectedModelName = useCallback(() => {
    if (!selectedModelId) return '';
    const model = models.find(m => m.id === selectedModelId);
    return model ? model.name : '';
  }, [selectedModelId, models]);

  // 获取当前页面显示的标题
  const getCurrentPageTitle = useCallback(() => {
    if (pathname === '/') return '首页';
    
    // 优先使用传入的标题，如果存在
    if (title) return title;
    
    // 否则根据当前选择的聊天生成标题
    if (activeChatId) {
      const activeChat = chats.find(chat => chat.id === activeChatId);
      if (activeChat && activeChat.title) {
        return activeChat.title;
      }
      return `与 ${getSelectedModelName()} 的对话`;
    }
    
    return '';
  }, [pathname, title, activeChatId, chats, getSelectedModelName]);
  
  return (
    <header className="h-14 border-b flex items-center justify-between px-5 sticky top-0 z-10 shadow-sm bg-background">
      <div className="flex items-center">
        <Link href="/" className="text-xl font-bold flex items-center mr-6">
          <span className="bg-gradient-to-r from-blue-600 via-purple-500 to-pink-500 text-transparent bg-clip-text">Fusion AI</span>
        </Link>
        
        {/* 面包屑导航 */}
        <div className="hidden sm:flex items-center text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">首页</Link>
          {activeChatId && (
            <>
              <ChevronRightIcon className="h-4 w-4 mx-1.5 text-muted-foreground" />
              <span className="text-primary font-medium transition-colors">
                AI 聊天
              </span>
            </>
          )}
        </div>
      </div>

      {/* 中间部分：页面标题 */}
      <div className="absolute left-1/2 transform -translate-x-1/2 font-medium text-base">
        {getCurrentPageTitle()}
      </div>

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
            aria-label="首页"
          >
            <HomeIcon className="h-4 w-4 transition-transform" />
          </Button>
        </Link>
        
        <Button 
          variant="ghost"
          size="icon" 
          onClick={handleOpenSettings}
          className={cn(
            "h-9 w-9 rounded-full shadow-sm transition-all duration-300",
            "hover:scale-110 hover:shadow-md",
            "text-foreground"
          )}
          aria-label="设置"
        >
          <SettingsIcon className="h-4 w-4 transition-transform" />
        </Button>
        
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
      </div>
    </header>
  );
});

export default Header;