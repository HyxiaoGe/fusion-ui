import React, { Suspense, lazy } from 'react';
import LoadingIndicator from '@/components/ui/loading-indicator';
import {
  preloadChatMessageList,
  preloadChatSidebar,
  preloadHomePage,
  preloadModelSelector,
} from './preloaders';

// 懒加载组件定义
export const LazyChatMessageList = lazy(preloadChatMessageList);
export const LazyChatSidebar = lazy(preloadChatSidebar);
export const LazyModelSelector = lazy(preloadModelSelector);
export const LazyHomePage = lazy(preloadHomePage);

// 通用懒加载包装器组件
interface LazyWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
}

export const LazyWrapper: React.FC<LazyWrapperProps> = ({ 
  children, 
  fallback,
  className 
}) => {
  const defaultFallback = (
    <div className={`flex items-center justify-center p-4 ${className || ''}`}>
      <LoadingIndicator size="sm" text="加载中..." />
    </div>
  );

  return (
    <Suspense fallback={fallback || defaultFallback}>
      {children}
    </Suspense>
  );
};

// 具体的懒加载组件包装器
export const ChatMessageListLazy: React.FC<any> = (props) => (
  <LazyWrapper>
    <LazyChatMessageList {...props} />
  </LazyWrapper>
);

export const ChatSidebarLazy: React.FC<any> = (props) => (
  <LazyWrapper>
    <LazyChatSidebar {...props} />
  </LazyWrapper>
);

export const ModelSelectorLazy: React.FC<any> = (props) => (
  <LazyWrapper className="h-8">
    <LazyModelSelector {...props} />
  </LazyWrapper>
);

export const HomePageLazy: React.FC<any> = (props) => (
  <LazyWrapper>
    <LazyHomePage {...props} />
  </LazyWrapper>
);
