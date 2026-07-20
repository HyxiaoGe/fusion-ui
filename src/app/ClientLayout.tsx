'use client';

import { ToastProvider, setGlobalToast, useToast } from "@/components/ui/toast";
import { useEffect, useRef, useState } from "react";
import { initializeModels } from "@/lib/config/modelConfig";
import { useDispatch } from "react-redux";
import { updateModels, updateProviders } from "@/redux/slices/modelsSlice";
import dynamic from 'next/dynamic';
import { useAppDispatch, useAppSelector } from "@/redux/hooks";
import { selectIsAuthenticated } from "@/redux/selectors";

import toast, { Toaster } from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  adoptCommittedSsoSession,
  checkUserState,
  checkLiveness,
  fetchUserProfile,
  resolveSession,
} from "@/redux/slices/authSlice";
import { maybeSilentLogin } from "@/lib/auth/sso-probe";
import { subscribeSsoState } from "@/lib/auth/authService";
import { beginAuthSessionTransition } from "@/lib/auth/sessionTransition";
import {
  accountSessionSwitchCompleted,
  accountSessionSwitchStarted,
} from "@/redux/actions/authSessionActions";
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
  const router = useRouter();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const status = useAppSelector((state) => state.auth.status);
  const accountSwitchStatus = useAppSelector((state) => state.auth.accountSwitchStatus);
  const accountSwitchError = useAppSelector((state) => state.auth.accountSwitchError);
  const switchedAccountEmail = useAppSelector((state) => state.auth.switchedAccountEmail);
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [hasShownInitialLogin, setHasShownInitialLogin] = useState(false);
  const sdkSwitchObserved = useRef(false);
  
  // 导出函数供其他组件使用
  (globalThis as any).triggerLoginDialog = () => {
    setIsLoginDialogOpen(true);
  };

  useEffect(() => {
    return subscribeSsoState((sdkState) => {
      if (sdkState.status === 'synchronizing') {
        sdkSwitchObserved.current = true;
        // 服务端已经确认中央账号与本地账号不同；必须在换票完成前先阻断旧请求并清缓存。
        beginAuthSessionTransition();
        dispatch(accountSessionSwitchStarted());
        return;
      }
      if (sdkState.status === 'authenticated' && sdkState.user && sdkSwitchObserved.current) {
        sdkSwitchObserved.current = false;
        // 同源兄弟标签完成换票时，SDK localStorage 已更新；宿主也必须采用新 token/profile。
        void dispatch(adoptCommittedSsoSession({ email: sdkState.user.email ?? '' }));
      }
    });
  }, [dispatch]);

  useEffect(() => {
    // 只在登录态发生变化时重新检查，避免资料请求状态变化触发认证检查循环。
    dispatch(checkUserState());
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    // 如果状态被重置为idle，说明数据可能过期，需要刷新
    if (isAuthenticated && status === 'idle') {
      dispatch(fetchUserProfile());
    }
  }, [dispatch, isAuthenticated, status]);
  
  useEffect(() => {
    // 跨应用单点登出（SLO）落地窗口：别处登出后，本标签页手里的 access token 签名仍然有效、
    // 本地无从察觉，直到它过期。标签页重新聚焦 / 重新变为可见时做一次【只读】存活探测
    // （checkLiveness：取本地 token + 打查 denylist 的 /api/auth/me，被吊销则翻转未登录；
    // 绝不强制轮换 refresh token——强制轮换在慢隧道下会引发失同步被动登出）。另挂一个低频
    // 定时器兜底「长时间聚焦却空闲、不切标签也不发受保护请求」的页面（纯 SSE/阅读态）的盲区。
    // 仅在已登录态挂监听；切回标签页常同时触发 focus + visibilitychange，用最小间隔去抖成一次。
    if (!isAuthenticated) return;
    let lastAt = 0;
    const runLivenessProbe = () => {
      const now = Date.now();
      if (now - lastAt < 3000) return;
      lastAt = now;
      dispatch(checkLiveness());
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") runLivenessProbe();
    };
    window.addEventListener("focus", runLivenessProbe);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(runLivenessProbe, 5 * 60 * 1000);
    runLivenessProbe();
    return () => {
      window.removeEventListener("focus", runLivenessProbe);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [dispatch, isAuthenticated]);

  useEffect(() => {
    if (switchedAccountEmail === null) return;
    router.replace('/chat/new');
    toast.success(
      switchedAccountEmail
        ? t('auth.accountSwitch.completedWithEmail', { email: switchedAccountEmail })
        : t('auth.accountSwitch.completed'),
    );
    dispatch(accountSessionSwitchCompleted({ email: null }));
  }, [dispatch, router, switchedAccountEmail, t]);

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
        // 静默 SSO 恢复已发起（页面正跳走换码）：会话尚未定论，保持未定论 → 头像菜单显示中性占位，
        // 绝不在此刻露出「登录」按钮，否则恢复成功翻头像就成了「登录成功还闪一下登录按钮」。
        return;
      }
      // 没有发起静默恢复（本标签页已探测过 / 无 sessionStorage 等）：会话已定论为登出，
      // 解锁头像菜单的「登录」终态（在此之前一直是中性占位）。
      dispatch(resolveSession());
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
      {accountSwitchStatus !== 'stable' && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/85 px-6 backdrop-blur-sm"
          role="status"
          aria-live="assertive"
        >
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
            <p className="font-medium text-foreground">
              {accountSwitchStatus === 'blocked'
                ? t('auth.accountSwitch.blockedTitle')
                : t('auth.accountSwitch.syncingTitle')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {accountSwitchStatus === 'blocked'
                ? accountSwitchError || t('auth.accountSwitch.blockedDescription')
                : t('auth.accountSwitch.syncingDescription')}
            </p>
            {accountSwitchStatus === 'blocked' && (
              <button
                type="button"
                className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                onClick={() => dispatch(checkLiveness())}
              >
                {t('auth.accountSwitch.retry')}
              </button>
            )}
          </div>
        </div>
      )}
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
