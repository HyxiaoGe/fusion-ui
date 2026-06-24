'use client';

import initializeStoreFromDB from '@/lib/db/initializeStore';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';

// 数据加载组件
const StoreInitializer = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    const loadData = async () => {
      try {
        // 只恢复本地设置，不在启动时把聊天记录回灌为真源
        await initializeStoreFromDB(store.dispatch, { includeChats: false });
      } catch (error) {
        console.error('初始化失败:', error);
      }
    };

    loadData();
  }, []);

  return <>{children}</>;
};

// 主提供器组件
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <StoreInitializer>{children}</StoreInitializer>
    </Provider>
  );
}
