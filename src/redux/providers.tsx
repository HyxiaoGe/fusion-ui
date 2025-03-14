'use client';

import LoadingIndicator from '@/components/ui/loading-indicator';
import initializeStoreFromDB from '@/lib/db/initializeStore';
import { useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { useAppDispatch } from './hooks';
import { store } from './store';

// 数据加载组件
const StoreInitializer = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useAppDispatch();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeStoreFromDB(dispatch);
        setIsLoaded(true);
      } catch (error) {
        console.error('初始化存储失败:', error);
        // 即使失败也设置为已加载，以便继续渲染应用
        setIsLoaded(true);
      }
    };

    loadData();
  }, [dispatch]);

  // 显示加载状态或返回子组件
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <LoadingIndicator size="lg" text="加载数据中..." />
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