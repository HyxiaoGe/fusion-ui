import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import toastMiddleware from './middleware/toastMiddleware';
import appReducer from './slices/appSlice';
import chatReducer from './slices/chatSlice';
import fileUploadReducer from './slices/fileUploadSlice';
import modelsReducer from './slices/modelsSlice';
import promptTemplatesReducer from './slices/promptTemplatesSlice';
import searchReducer from './slices/searchSlice';
import settingsReducer from './slices/settingsSlice';
import themeReducer from './slices/themeSlice';

// 用于清理已同步标记的中间件（现在主要用于服务端同步）
const dbSyncMiddleware = (store: any) => (next: any) => (action: any) => {
  const result = next(action);
  
  // 检查是否有消息在使用updateMessageReasoning后被标记为shouldSyncToDb
  if (action.type === 'chat/updateMessageReasoning') {
    const state = store.getState();
    const { chatId, messageId } = action.payload;
    
    // 在下一个事件循环中清除标记(给足够时间让组件同步)
    setTimeout(() => {
      store.dispatch({
        type: 'chat/clearDbSyncFlag',
        payload: { chatId, messageId }
      });
    }, 2000); // 2秒后清除标记，确保组件有足够时间同步
  }
  
  return result;
};

export const store = configureStore({
    reducer: {
        theme: themeReducer,
        chat: chatReducer,
        models: modelsReducer,
        fileUpload: fileUploadReducer,
        promptTemplates: promptTemplatesReducer,
        settings: settingsReducer,
        app: appReducer,
        search: searchReducer,
    },
    middleware: (getDefaultMiddleware) => 
        getDefaultMiddleware({
            serializableCheck: false, // 在这里我们允许非序列化值，因为文件对象等可能不会被序列化
        }).concat(toastMiddleware, dbSyncMiddleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;