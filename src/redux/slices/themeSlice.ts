import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type ThemeState = {
    mode: 'light' | 'dark' | 'system'
};

const initialState: ThemeState = {
    mode: 'system'
};

const themeSlice = createSlice({
    name: 'theme',
    initialState,
    reducers: {
        setThemeMode: (state, action: PayloadAction<'light' | 'dark' | 'system'>) => {
            state.mode = action.payload
        },
    },
});

export const { setThemeMode } = themeSlice.actions;
export default themeSlice.reducer;