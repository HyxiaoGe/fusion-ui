import { useCallback, useRef } from 'react';

// 自定义hook用于管理对话列表刷新
export const useChatListRefresh = () => {
  const refreshFunctionRef = useRef<(() => void) | null>(null);

  // 注册刷新函数
  const registerRefreshFunction = useCallback((refreshFn: () => void) => {
    refreshFunctionRef.current = refreshFn;
  }, []);

  // 触发刷新
  const triggerRefresh = useCallback(() => {
    if (refreshFunctionRef.current) {
      refreshFunctionRef.current();
    }
  }, []);

  return {
    registerRefreshFunction,
    triggerRefresh
  };
}; 