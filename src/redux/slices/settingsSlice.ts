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
  // 弹窗相关状态
  isSettingsDialogOpen: boolean;
  activeSettingsTab: string;
  shouldOpenAddModel: boolean;
  // 其他设置项...
}

const initialState: SettingsState = {
  userAvatar: 'default-user',
  assistantAvatar: 'default-assistant',
  // 弹窗相关状态
  isSettingsDialogOpen: false,
  activeSettingsTab: 'general',
  shouldOpenAddModel: false,
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
    // 弹窗相关的reducer
    setSettingsDialogOpen: (state, action: PayloadAction<boolean>) => {
      state.isSettingsDialogOpen = action.payload;
    },
    setActiveSettingsTab: (state, action: PayloadAction<string>) => {
      state.activeSettingsTab = action.payload;
    },
    openSettingsDialog: (state, action: PayloadAction<{ tab?: string; addModel?: boolean }>) => {
      state.isSettingsDialogOpen = true;
      if (action.payload.tab) {
        state.activeSettingsTab = action.payload.tab;
      }
      // 如果是添加模型操作，确保切换到模型标签页
      if (action.payload.addModel) {
        state.activeSettingsTab = 'models';
        state.shouldOpenAddModel = true;
      }
    },
    closeSettingsDialog: (state) => {
      state.isSettingsDialogOpen = false;
      state.shouldOpenAddModel = false;
    },
    resetAddModelFlag: (state) => {
      state.shouldOpenAddModel = false;
    },
    // 其他设置的reducer...
  },
});

export const { 
  setUserAvatar, 
  setAssistantAvatar,
  setSettingsDialogOpen,
  setActiveSettingsTab,
  openSettingsDialog,
  closeSettingsDialog,
  resetAddModelFlag
} = settingsSlice.actions;
export default settingsSlice.reducer;