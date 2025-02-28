import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import themeReducer from './slices/themeSlice';
import chatReducer from './slices/chatSlice';
import modelsReducer from './slices/modelsSlice';

export const store = configureStore({
    reducer: {
        theme: themeReducer,
        chat: chatReducer,
        models: modelsReducer,
    },
    middleware: (getDefaultMiddleware) => 
        getDefaultMiddleware({
            serializableCheck: false,
        }),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;