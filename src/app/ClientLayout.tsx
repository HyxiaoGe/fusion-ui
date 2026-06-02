'use client';

import { ToastProvider, setGlobalToast, useToast } from "@/components/ui/toast";
import { useEffect, useState } from "react";
import { initializeModels } from "@/lib/config/modelConfig";
import { useDispatch } from "react-redux";
import { updateModels, updateProviders } from "@/redux/slices/modelsSlice";
import dynamic from 'next/dynamic';
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { selectIsAuthenticated } from "@/redux/selectors";

import { Toaster } from "react-hot-toast";
import { checkUserState, fetchUserProfile, revalidateToken } from "@/redux/slices/authSlice";
import { maybeSilentLogin } from "@/lib/auth/sso-probe";
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
        const { models, providers } = await initializeModels();
        dispatch(updateModels(models));
        dispatch(updateProviders(providers));
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
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const status = useAppSelector((state) => state.auth.status);
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
    // 跨应用单点登出（SLO）落地窗口：别处登出后，本标签页手里的 access token 签名仍然有效、
    // 本地无从察觉，直到它过期。标签页重新聚焦 / 重新变为可见时，强制校验一次令牌
    // （revalidateToken 走 SDK refresh 做服务端往返，refresh token 被吊销则翻转为未登录）。
    // 仅在已登录态挂监听；切回标签页常同时触发 focus + visibilitychange，用最小间隔去抖成一次。
    if (!isAuthenticated) return;
    let lastAt = 0;
    const revalidate = () => {
      const now = Date.now();
      if (now - lastAt < 3000) return;
      lastAt = now;
      dispatch(revalidateToken());
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    // 如果用户已登录，关闭登录弹窗
    if (isAuthenticated) {
      setIsLoginDialogOpen(false);
      return;
    }

    // 只在首次访问且未登录时弹出登录窗口
    // 检查 localStorage 是否有 token，避免 SSR hydration 期间误弹
    if (!hasShownInitialLogin) {
      const hasStoredToken = typeof window !== 'undefined' && Boolean(localStorage.getItem('auth_token'));
      if (hasStoredToken) {
        // token 存在但 Redux 还没 hydrate，等一下再判断
        return;
      }
      // 无本地 token：先做一次性静默 SSO 探测（跨应用免登）。命中则页面正在跳走，
      // 不再弹登录框；未命中/已探测过/无 sessionStorage 时回落到原弹框逻辑。
      const path = window.location.pathname + window.location.search;
      if (maybeSilentLogin(path)) {
        return;
      }
      const timer = setTimeout(() => {
        setIsLoginDialogOpen(true);
        setHasShownInitialLogin(true);
      }, 1500);

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