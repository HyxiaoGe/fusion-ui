import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// 定义可用的头像选项
export const avatarOptions = {
  user: [
    { id: 'default-user', emoji: '👤', label: '默认' },
    { id: 'user-1', emoji: '👨', label: '男士' },
    { id: 'user-2', emoji: '👩', label: '女士' },
    { id: 'user-3', emoji: '🧑', label: '中性' },
    { id: 'user-4', emoji: '👦', label: '男孩' },
    { id: 'user-5', emoji: '👧', label: '女孩' },
    { id: 'user-6', emoji: '🧔', label: '胡子' },
  ],
  assistant: [
    { id: 'default-assistant', emoji: '🤖', label: '机器人' },
    { id: 'assistant-1', emoji: '💻', label: '电脑' },
    { id: 'assistant-2', emoji: '🦾', label: '智能' },
    { id: 'assistant-3', emoji: '🧠', label: '大脑' },
    { id: 'assistant-4', emoji: '👾', label: '游戏' },
    { id: 'assistant-5', emoji: '✨', label: '魔法' },
  ]
};

export interface SettingsState {
  userAvatar: string;
  assistantAvatar: string;
  // 其他设置项...
}

const initialState: SettingsState = {
  userAvatar: 'default-user',
  assistantAvatar: 'default-assistant',
  // 其他设置的初始值...
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setUserAvatar: (state, action: PayloadAction<string>) => {
      state.userAvatar = action.payload;
    },
    setAssistantAvatar: (state, action: PayloadAction<string>) => {
      state.assistantAvatar = action.payload;
    },
    // 其他设置的reducer...
  },
});

export const { setUserAvatar, setAssistantAvatar } = settingsSlice.actions;
export default settingsSlice.reducer;