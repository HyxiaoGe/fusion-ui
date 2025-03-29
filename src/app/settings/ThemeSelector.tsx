'use client';

import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { LaptopIcon, MoonIcon, SunIcon } from 'lucide-react';
import React, { useEffect } from 'react';

const ThemeSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const { mode } = useAppSelector(state => state.theme);
  const { toast } = useToast();
  
  // 切换主题时添加全局过渡动画
  useEffect(() => {
    document.documentElement.style.setProperty('--theme-transition', 'background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, fill 0.3s ease, stroke 0.3s ease');
    document.documentElement.classList.add('theme-transition-active');
    
    return () => {
      document.documentElement.style.removeProperty('--theme-transition');
      document.documentElement.classList.remove('theme-transition-active');
    };
  }, []);
  
  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    dispatch(setThemeMode(value));
    
    // 显示toast提示
    toast({
      message: `已切换到${value === 'light' ? '浅色' : value === 'dark' ? '深色' : '跟随系统'}主题`,
      type: 'success',
      duration: 2000,
    });
  };
  
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {/* 浅色模式按钮 */}
        <button
          onClick={() => handleThemeChange('light')}
          className={cn(
            "flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-300",
            "border-2 hover:border-primary/50",
            mode === 'light' 
              ? "bg-primary/10 border-primary ring-2 ring-primary/20 shadow-md" 
              : "bg-muted/30 border-border hover:bg-muted"
          )}
          aria-label="选择浅色模式"
        >
          <div className={cn(
            "relative mb-2 size-12 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-blue-50 to-amber-50 shadow-inner",
            mode === 'light' ? "text-amber-500" : "text-muted-foreground"
          )}>
            <SunIcon 
              className={cn(
                "size-7 transition-all duration-300",
                mode === 'light' && "animate-pulse-slow"
              )} 
            />
          </div>
          <span className={cn(
            "text-sm font-medium transition-colors duration-300",
            mode === 'light' && "text-primary"
          )}>
            浅色
          </span>
        </button>
        
        {/* 深色模式按钮 */}
        <button
          onClick={() => handleThemeChange('dark')}
          className={cn(
            "flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-300",
            "border-2 hover:border-primary/50", 
            mode === 'dark' 
              ? "bg-primary/10 border-primary ring-2 ring-primary/20 shadow-md" 
              : "bg-muted/30 border-border hover:bg-muted"
          )}
          aria-label="选择深色模式"
        >
          <div className={cn(
            "relative mb-2 size-12 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-slate-800 to-indigo-950 shadow-inner",
            mode === 'dark' ? "text-indigo-400" : "text-muted-foreground"
          )}>
            <MoonIcon 
              className={cn(
                "size-6 transition-all duration-300",
                mode === 'dark' && "animate-pulse-slow"
              )} 
            />
          </div>
          <span className={cn(
            "text-sm font-medium transition-colors duration-300",
            mode === 'dark' && "text-primary"
          )}>
            深色
          </span>
        </button>
        
        {/* 系统模式按钮 */}
        <button
          onClick={() => handleThemeChange('system')}
          className={cn(
            "flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-300",
            "border-2 hover:border-primary/50", 
            mode === 'system' 
              ? "bg-primary/10 border-primary ring-2 ring-primary/20 shadow-md" 
              : "bg-muted/30 border-border hover:bg-muted"
          )}
          aria-label="跟随系统设置"
        >
          <div className={cn(
            "relative mb-2 size-12 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-900 shadow-inner",
            mode === 'system' ? "text-blue-500 dark:text-blue-400" : "text-muted-foreground"
          )}>
            <LaptopIcon 
              className={cn(
                "size-6 transition-all duration-300",
                mode === 'system' && "animate-pulse-slow"
              )} 
            />
          </div>
          <span className={cn(
            "text-sm font-medium transition-colors duration-300",
            mode === 'system' && "text-primary"
          )}>
            跟随系统
          </span>
        </button>
      </div>

      {/* 添加全局CSS动画 */}
      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
        
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
        
        .theme-transition-active * {
          transition: var(--theme-transition);
        }
      `}</style>
      
      <p className="text-sm text-muted-foreground mt-2">
        {mode === 'light' 
          ? '浅色模式适合在白天使用，减少眼睛疲劳。' 
          : mode === 'dark' 
            ? '深色模式适合在夜间使用，减少屏幕光线。' 
            : '跟随系统设置，自动根据操作系统的暗色/亮色模式切换。'}
      </p>
    </div>
  );
};

export default ThemeSelector;