import React, { Suspense, lazy } from 'react';
import LoadingIndicator from '@/components/ui/loading-indicator';

// 懒加载组件定义
export const LazyChatMessageList = lazy(() => import('@/components/chat/ChatMessageList'));
export const LazyChatSidebar = lazy(() => import('@/components/chat/ChatSidebar'));
export const LazyModelSelector = lazy(() => import('@/components/models/ModelSelector'));
export const LazyRelatedDiscussions = lazy(() => import('@/components/search/RelatedDiscussions'));
export const LazyHomePage = lazy(() => import('@/components/home/HomePage'));
export const LazyFunctionCallDisplay = lazy(() => import('@/components/chat/FunctionCallDisplay'));

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

export const RelatedDiscussionsLazy: React.FC<any> = (props) => (
  <LazyWrapper>
    <LazyRelatedDiscussions {...props} />
  </LazyWrapper>
);

export const HomePageLazy: React.FC<any> = (props) => (
  <LazyWrapper>
    <LazyHomePage {...props} />
  </LazyWrapper>
);

export const FunctionCallDisplayLazy: React.FC<any> = (props) => (
  <LazyWrapper>
    <LazyFunctionCallDisplay {...props} />
  </LazyWrapper>
); 