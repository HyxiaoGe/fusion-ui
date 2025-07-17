'use client';

import { ToastProvider, setGlobalToast, useToast } from "@/components/ui/toast";
import { useEffect, useState } from "react";
import { initializeModels } from "@/lib/config/modelConfig";
import { useDispatch } from "react-redux";
import { updateModels } from "@/redux/slices/modelsSlice";
import dynamic from 'next/dynamic';
import { useAppDispatch, useAppSelector } from "@/redux/hooks";

import { Toaster } from "react-hot-toast";
import { setToken, checkUserState, fetchUserProfile } from "@/redux/slices/authSlice";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";

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

    const initializeAppModels = async () => {
      try {
        const models = await initializeModels();
        dispatch(updateModels(models));
      } catch (error) {
        console.error('Failed to initialize models:', error);
      }
    };
    
    initializeAppModels();
  }, [dispatch]);
  
  return null;
}

const ClientLayout = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useAppDispatch();
  const { isAuthenticated, status } = useAppSelector((state) => state.auth);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [hasShownInitialLogin, setHasShownInitialLogin] = useState(false);
  
  // 导出函数供其他组件使用
  (globalThis as any).triggerLoginDialog = () => {
    setIsLoginDialogOpen(true);
  };

  useEffect(() => {
    // 检查用户状态并判断是否需要刷新数据
    dispatch(checkUserState());
    
    // 如果状态被重置为idle，说明数据可能过期，需要刷新
    if (isAuthenticated && status === 'idle') {
      dispatch(fetchUserProfile());
    }
  }, [dispatch, isAuthenticated, status]);
  
  useEffect(() => {
    // 如果用户已登录，关闭登录弹窗
    if (isAuthenticated) {
      setIsLoginDialogOpen(false);
      return;
    }

    // 只在首次访问且未登录时弹出登录窗口
    if (!hasShownInitialLogin) {
    const timer = setTimeout(() => {
      setIsLoginDialogOpen(true);
        setHasShownInitialLogin(true); // 标记已显示过
    }, 1000);

    return () => clearTimeout(timer);
    }
  }, [isAuthenticated, hasShownInitialLogin]);

  const handleDialogVisibilityChange = (open: boolean) => {
    setIsLoginDialogOpen(open);
  };

  return (
    <ToastProvider>
      <ToastInitializer />
      <ModelConfigInitializer />
      <div className="w-full h-screen overflow-hidden text-sm flex-1">
        {children}
      </div>
      <Toaster position="bottom-center" />
      <LoginDialog open={isLoginDialogOpen} onOpenChange={handleDialogVisibilityChange} />
      <SettingsDialog />
      
      {/* 只在开发环境显示性能监控 */}
      {process.env.NODE_ENV === 'development' && (
        <PerformanceMonitor />
      )}
    </ToastProvider>
  );
};

export default ClientLayout;