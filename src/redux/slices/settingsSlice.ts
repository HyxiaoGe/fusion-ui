import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SettingsState {
  // 弹窗相关状态
  isSettingsDialogOpen: boolean;
  activeSettingsTab: string;
  // 其他设置项...
}

const initialState: SettingsState = {
  // 弹窗相关状态
  isSettingsDialogOpen: false,
  activeSettingsTab: 'general',
  // 其他设置的初始值...
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    // 弹窗相关的reducer
    setSettingsDialogOpen: (state, action: PayloadAction<boolean>) => {
      state.isSettingsDialogOpen = action.payload;
    },
    setActiveSettingsTab: (state, action: PayloadAction<string>) => {
      state.activeSettingsTab = action.payload;
    },
    openSettingsDialog: (state, action: PayloadAction<{ tab?: string }>) => {
      state.isSettingsDialogOpen = true;
      if (action.payload.tab) {
        state.activeSettingsTab = action.payload.tab;
      }
    },
    closeSettingsDialog: (state) => {
      state.isSettingsDialogOpen = false;
    },
    // 其他设置的reducer...
  },
});

export const {
  setSettingsDialogOpen,
  setActiveSettingsTab,
  openSettingsDialog,
  closeSettingsDialog,
} = settingsSlice.actions;
export default settingsSlice.reducer;