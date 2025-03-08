import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import themeReducer from './slices/themeSlice';
import chatReducer from './slices/chatSlice';
import modelsReducer from './slices/modelsSlice';
import fileUploadReducer from './slices/fileUploadSlice';
import promptTemplatesReducer from './slices/promptTemplatesSlice';
import settingsReducer from './slices/settingsSlice';
import persistMiddleware from './middleware/persistMiddleware';
import appReducer from './slices/appSlice';

export const store = configureStore({
    reducer: {
        theme: themeReducer,
        chat: chatReducer,
        models: modelsReducer,
        fileUpload: fileUploadReducer,
        promptTemplates: promptTemplatesReducer,
        settings: settingsReducer,
        app: appReducer
    },
    middleware: (getDefaultMiddleware) => 
        getDefaultMiddleware({
            serializableCheck: false,
        }).concat(persistMiddleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;