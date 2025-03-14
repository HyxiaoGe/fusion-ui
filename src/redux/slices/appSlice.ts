import { createSlice } from '@reduxjs/toolkit';

interface AppState {
  lastDatabaseSync: number;
}

const initialState: AppState = {
  lastDatabaseSync: Date.now(),
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    triggerDatabaseSync: (state) => {
      state.lastDatabaseSync = Date.now();
    },
  },
});

export const { triggerDatabaseSync } = appSlice.actions;
export default appSlice.reducer;