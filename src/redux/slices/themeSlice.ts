import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type ThemeState = {
    mode: 'light' | 'dark' | 'system'
};

// 从localStorage获取保存的主题设置
const getSavedTheme = (): 'light' | 'dark' | 'system' => {
  if (typeof window !== 'undefined') {
    try {
      const savedTheme = localStorage.getItem('themeMode');
      if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
        return savedTheme as 'light' | 'dark' | 'system';
      }
    } catch (error) {
      console.error('Error loading theme from localStorage:', error);
    }
  }
  return 'system'; // 默认跟随系统
};

const initialState: ThemeState = {
    mode: getSavedTheme()
};

const themeSlice = createSlice({
    name: 'theme',
    initialState,
    reducers: {
        setThemeMode: (state, action: PayloadAction<'light' | 'dark' | 'system'>) => {
            state.mode = action.payload;
            // 保存到localStorage
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('themeMode', action.payload);
              } catch (error) {
                console.error('Error saving theme to localStorage:', error);
              }
            }
        },
    },
});

export const { setThemeMode } = themeSlice.actions;
export default themeSlice.reducer;