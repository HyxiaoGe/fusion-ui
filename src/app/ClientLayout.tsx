'use client';

import { ToastProvider, setGlobalToast, useToast } from "@/components/ui/toast";
import { useEffect, useState } from "react";
import { initializeModels } from "@/lib/config/modelConfig";
import { useDispatch } from "react-redux";
import { updateModels } from "@/redux/slices/modelsSlice";
import dynamic from 'next/dynamic';
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { setSystemPrompt } from "@/redux/slices/chatSlice";
import { Toaster } from "react-hot-toast";
import { setToken } from "@/redux/slices/authSlice";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { FloatingLoginButton } from "@/components/auth/FloatingLoginButton";

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
        const models = await initializeModels();
        dispatch(updateModels(models));
      } catch (error) {
        console.error('模型配置加载失败:', error);
      }
    };
    
    loadModels();
  }, [dispatch]);
  
  return null;
}

const ClientLayout = ({ children }: { children: React.ReactNode }) => {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [showFloatingButton, setShowFloatingButton] = useState(false);

  useEffect(() => {
    // 应用加载时，从 localStorage 初始化 token
    const token = localStorage.getItem("auth_token");
    if (token) {
      dispatch(setToken(token));
    }
  }, [dispatch]);
  
  useEffect(() => {
    // 如果用户已登录，确保所有登录UI都是隐藏的
    if (isAuthenticated) {
      setIsLoginDialogOpen(false);
      setShowFloatingButton(false);
      return;
    }

    // 如果弹窗已打开，或悬浮按钮已显示，则不执行任何操作
    if (isLoginDialogOpen || showFloatingButton) {
      return;
    }

    // 仅在初次加载且没有任何登录UI时，自动弹出登录窗口
    const timer = setTimeout(() => {
      setIsLoginDialogOpen(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoginDialogOpen, showFloatingButton]);

  const handleDialogVisibilityChange = (open: boolean) => {
    setIsLoginDialogOpen(open);
    // 当对话框被用户关闭且用户未登录时，显示悬浮按钮
    if (!open && !isAuthenticated) {
      setShowFloatingButton(true);
    }
  };
  
  const handleFloatingButtonClick = () => {
    setIsLoginDialogOpen(true);
    setShowFloatingButton(false);
  };

  useEffect(() => {
    const fetchSystemPrompt = async () => {
      // ... existing code ...
    };

    fetchSystemPrompt();
  }, [dispatch]);

  return (
    <ToastProvider>
      <ToastInitializer />
      <ModelConfigInitializer />
      <div className="w-full h-screen overflow-hidden text-sm flex-1">
        {children}
      </div>
      <Toaster position="bottom-center" />
      <LoginDialog open={isLoginDialogOpen} onOpenChange={handleDialogVisibilityChange} />
      {showFloatingButton && <FloatingLoginButton onClick={handleFloatingButtonClick} />}
      
      {/* 只在开发环境显示性能监控 */}
      {process.env.NODE_ENV === 'development' && (
        <PerformanceMonitor />
      )}
    </ToastProvider>
  );
}

export default ClientLayout;