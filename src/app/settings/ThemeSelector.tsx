'use client';

import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { LaptopIcon, MoonIcon, SunIcon } from 'lucide-react';
import React from 'react';

const ThemeSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const { mode } = useAppSelector(state => state.theme);
  
  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    dispatch(setThemeMode(value));
  };
  
  // 简化组件，不使用复杂的嵌套RadioGroup
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="font-medium mb-2">主题设置</h3>
        <div className="flex gap-2">
          {/* 浅色模式按钮 */}
          <button
            onClick={() => handleThemeChange('light')}
            className={cn(
              "flex flex-col items-center justify-center p-3 rounded-md flex-1 transition-all",
              mode === 'light' 
                ? "bg-primary text-primary-foreground shadow-sm" 
                : "bg-muted hover:bg-muted/80"
            )}
          >
            <SunIcon className="h-5 w-5 mb-1" />
            <span className="text-sm font-medium">浅色</span>
          </button>
          
          {/* 深色模式按钮 */}
          <button
            onClick={() => handleThemeChange('dark')}
            className={cn(
              "flex flex-col items-center justify-center p-3 rounded-md flex-1 transition-all",
              mode === 'dark' 
                ? "bg-primary text-primary-foreground shadow-sm" 
                : "bg-muted hover:bg-muted/80"
            )}
          >
            <MoonIcon className="h-5 w-5 mb-1" />
            <span className="text-sm font-medium">深色</span>
          </button>
          
          {/* 跟随系统按钮 */}
          <button
            onClick={() => handleThemeChange('system')}
            className={cn(
              "flex flex-col items-center justify-center p-3 rounded-md flex-1 transition-all",
              mode === 'system' 
                ? "bg-primary text-primary-foreground shadow-sm" 
                : "bg-muted hover:bg-muted/80"
            )}
          >
            <LaptopIcon className="h-5 w-5 mb-1" />
            <span className="text-sm font-medium">跟随系统</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThemeSelector;