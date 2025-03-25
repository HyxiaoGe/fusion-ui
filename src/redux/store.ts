import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import persistMiddleware from './middleware/persistMiddleware';
import toastMiddleware from './middleware/toastMiddleware';
import appReducer from './slices/appSlice';
import chatReducer from './slices/chatSlice';
import fileUploadReducer from './slices/fileUploadSlice';
import modelsReducer from './slices/modelsSlice';
import promptTemplatesReducer from './slices/promptTemplatesSlice';
import searchReducer from './slices/searchSlice';
import settingsReducer from './slices/settingsSlice';
import themeReducer from './slices/themeSlice';
export const store = configureStore({
    reducer: {
        theme: themeReducer,
        chat: chatReducer,
        models: modelsReducer,
        fileUpload: fileUploadReducer,
        promptTemplates: promptTemplatesReducer,
        settings: settingsReducer,
        app: appReducer,
        search: searchReducer
    },
    middleware: (getDefaultMiddleware) => 
        getDefaultMiddleware({
            serializableCheck: false,
        }).concat(persistMiddleware, toastMiddleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;