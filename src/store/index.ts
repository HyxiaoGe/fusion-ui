import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import chatReducer from './slices/chatSlice';
import settingsReducer from './slices/settingsSlice';
import modelsReducer from './slices/modelsSlice';

export const store = configureStore({
  reducer: {
    chat: chatReducer,
    settings: settingsReducer,
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