'use client';

import LoadingIndicator from '@/components/ui/loading-indicator';
import initializeStoreFromDB from '@/lib/db/initializeStore';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';

// 数据加载组件
const StoreInitializer = ({ children }: { children: React.ReactNode }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        // 只恢复本地设置，不在启动时把聊天记录回灌为真源
        await initializeStoreFromDB(store.dispatch, { includeChats: false });
        setIsLoaded(true);
      } catch (error) {
        console.error('初始化失败:', error);
        // 即使失败也设置为已加载，以便继续渲染应用
        setIsLoaded(true);
      }
    };

    loadData();
  }, []);

  // 显示加载状态或返回子组件
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <LoadingIndicator size="lg" text="初始化中..." />
        </div>
      </div>
    );
  }

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
