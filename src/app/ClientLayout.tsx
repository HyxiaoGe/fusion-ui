'use client';

import { ToastProvider, setGlobalToast, useToast } from "@/components/ui/toast";
import { useEffect } from "react";
import { initializeModels } from "@/lib/config/modelConfig";
import { useDispatch } from "react-redux";
import { updateModels } from "@/redux/slices/modelsSlice";
import dynamic from 'next/dynamic';

// 懒加载性能监控组件，只在开发环境启用
const PerformanceMonitor = dynamic(
  () => import('@/components/debug/PerformanceMonitor'),
  { 
    ssr: false,
    loading: () => null 
  }
);

function ToastInitializer() {
  const toastContext = useToast();
  
  useEffect(() => {
    setGlobalToast(toastContext);
  }, [toastContext]);
  
  return null;
}

function ModelConfigInitializer() {
  const dispatch = useDispatch();
  
  useEffect(() => {
    const loadModels = async () => {
      try {
        console.log('开始初始化模型配置...');
        const models = await initializeModels();
        console.log('模型配置加载完成:', models);
        dispatch(updateModels(models));
      } catch (error) {
        console.error('模型配置加载失败:', error);
      }
    };
    
    loadModels();
  }, [dispatch]);
  
  return null;
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ToastInitializer />
      <ModelConfigInitializer />
      {children}
      
      {/* 只在开发环境显示性能监控 */}
      {process.env.NODE_ENV === 'development' && (
        <PerformanceMonitor />
      )}
    </ToastProvider>
  );
}