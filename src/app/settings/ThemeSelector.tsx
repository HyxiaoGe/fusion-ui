// src/components/settings/ThemeSelector.tsx
'use client';

import React from 'react';
import { useAppSelector, useAppDispatch } from '@/redux/hooks';
import { setThemeMode } from '@/redux/slices/themeSlice';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { SunIcon, MoonIcon, LaptopIcon } from 'lucide-react';

const ThemeSelector: React.FC = () => {
  const dispatch = useAppDispatch();
  const { mode } = useAppSelector(state => state.theme);
  
  const handleThemeChange = (value: 'light' | 'dark' | 'system') => {
    dispatch(setThemeMode(value));
  };
  
  return (
    <RadioGroup
      value={mode}
      onValueChange={handleThemeChange as (value: string) => void}
      className="flex gap-4"
    >
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="light" id="light" />
        <Label htmlFor="light" className="flex items-center gap-1">
          <SunIcon className="h-4 w-4" />
          浅色
        </Label>
      </div>
      
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="dark" id="dark" />
        <Label htmlFor="dark" className="flex items-center gap-1">
          <MoonIcon className="h-4 w-4" />
          深色
        </Label>
      </div>
      
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="system" id="system" />
        <Label htmlFor="system" className="flex items-center gap-1">
          <LaptopIcon className="h-4 w-4" />
          跟随系统
        </Label>
      </div>
    </RadioGroup>
  );
};

export default ThemeSelector;