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
  restoreLocalSession,
  resumeSsoSession,
  settleSdkUnauthenticatedSession,
} from "@/redux/slices/authSlice";
import { canAutoResumeSession, maybeSilentLogin } from "@/lib/auth/sso-probe";
import { getStoredAccessToken, subscribeSsoState } from "@/lib/auth/authService";
import {
  beginAuthSessionTransition,
  isAuthSessionTransitionError,
  waitForAuthSessionStable,
} from "@/lib/auth/sessionTransition";
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

const INITIAL_LOCAL_RECOVERY_DELAYS_MS = [1000, 3000, 10000] as const;

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
    const abortController = new AbortController();

    const initializeAppModels = async () => {
      while (!abortController.signal.aborted) {
        try {
          const { models, providers } = await initializeModels();
          if (abortController.signal.aborted) return;
          dispatch(updateModels(models));
          dispatch(updateProviders(providers));
          return;
        } catch (error) {
          if (!isAuthSessionTransitionError(error)) {
            console.error('Failed to initialize models:', error);
            return;
          }
          // 账户切换会主动中止旧身份请求。这是预期控制流：等待新会话稳定后
          // 重新读取模型配置，不能把它上报成开发错误或让初始化永久失败。
          try {
            await waitForAuthSessionStable(abortController.signal);
          } catch {
            return;
          }
        }
      }
    };
    
    void initializeAppModels();
    return () => abortController.abort();
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
  const initialLocalRecoveryInFlight = useRef(false);
  
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
        return;
      }
      if (sdkState.status === 'unauthenticated') {
        sdkSwitchObserved.current = false;
        // 冷启动 refresh 返回 null 后还要继续尝试中央 SSO；此窗口不能提前把
        // sessionResolved 翻成 true，否则导航前会短暂露出「登录」终态。
        if (initialLocalRecoveryInFlight.current) return;
        // refresh/logout 的确定性清理会先落共享存储再发布状态；宿主同步重读后收敛 Redux，
        // 避免 SDK 已登出而页面仍保留旧头像和旧用户权限。
        void dispatch(settleSdkUnauthenticatedSession());
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
    // 已登录时做 SLO/换号对账；未登录时只做无跳转的中央会话恢复。切回标签页常同时触发
    // focus + visibilitychange，两条路径共用 3 秒去抖窗口。
    let lastAt = 0;
    const recoverUnauthenticatedSession = async () => {
      if (initialLocalRecoveryInFlight.current) return;
      initialLocalRecoveryInFlight.current = true;
      try {
        const hasStoredToken = getStoredAccessToken() !== null;
        if (hasStoredToken) {
          const localResult = await dispatch(restoreLocalSession({
            deferNoSessionResolution: true,
          })).unwrap();
          if (localResult === 'restored') return;
        }

        const centralResult = await dispatch(resumeSsoSession()).unwrap();
        if (centralResult === 'no_session') {
          dispatch(resolveSession());
        }
      } catch {
        // 本地票据仍由 SDK 保留；中央恢复也失败时不能让页面无限停在未定论 loading。
        // 收敛为可交互的登录终态，下一次 focus/定时探测仍会再次尝试恢复。
        dispatch(resolveSession());
      } finally {
        initialLocalRecoveryInFlight.current = false;
      }
    };

    const runSessionProbe = () => {
      const path = window.location.pathname + window.location.search;
      if (!isAuthenticated && !canAutoResumeSession(path)) return;
      const now = Date.now();
      if (now - lastAt < 3000) return;
      lastAt = now;
      if (isAuthenticated) {
        dispatch(checkLiveness());
        return;
      }
      void recoverUnauthenticatedSession();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") runSessionProbe();
    };
    window.addEventListener("focus", runSessionProbe);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(runSessionProbe, 5 * 60 * 1000);
    // 保留既有登录态挂载即对账行为；未登录首屏仍交给 maybeSilentLogin，避免双探测竞态。
    if (isAuthenticated) runSessionProbe();
    return () => {
      window.removeEventListener("focus", runSessionProbe);
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
    // 检查 SDK 权威会话是否仍有 token，避免 SSR hydration 期间误弹。
    if (!hasShownInitialLogin) {
      let cancelled = false;
      let loginTimer: ReturnType<typeof setTimeout> | null = null;
      let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

      const hasStoredToken = typeof window !== 'undefined' && getStoredAccessToken() !== null;

      const revealLoginTerminal = () => {
        if (cancelled) return;
        dispatch(resolveSession());
        if (loginTimer !== null) return;
        loginTimer = setTimeout(() => {
          setIsLoginDialogOpen(true);
          setHasShownInitialLogin(true);
        }, 1500);
      };

      const continueWithCentralSession = () => {
        if (cancelled) return;
        // 本地 SDK 已确定性无会话后，再做一次性静默 SSO 探测（跨应用免登）。
        const path = window.location.pathname + window.location.search;
        if (maybeSilentLogin(path)) {
          // 静默 SSO 恢复已发起（页面正跳走换码）：会话尚未定论，保持未定论 → 头像菜单显示中性占位。
          return;
        }
        // 本地 refresh 和中央 SSO 均未恢复：此时才把会话定论为登出。
        revealLoginTerminal();
      };

      const resumeCentralWithoutNavigation = async (attempt = 0) => {
        if (cancelled) return;
        initialLocalRecoveryInFlight.current = true;
        try {
          const result = await dispatch(resumeSsoSession()).unwrap();
          if (cancelled) {
            initialLocalRecoveryInFlight.current = false;
            return;
          }
          initialLocalRecoveryInFlight.current = false;
          if (result === 'no_session') {
            // auth-service 已明确响应且没有中央 Cookie，会话协议兼容才需要顶层 prompt=none。
            continueWithCentralSession();
          }
        } catch {
          const retryDelay = INITIAL_LOCAL_RECOVERY_DELAYS_MS[attempt];
          if (!cancelled && retryDelay !== undefined) {
            recoveryTimer = setTimeout(() => {
              recoveryTimer = null;
              void resumeCentralWithoutNavigation(attempt + 1);
            }, retryDelay);
          } else {
            initialLocalRecoveryInFlight.current = false;
            // auth/tunnel 持续不可用时留在 Fusion 内，进入可交互终态；不把浏览器导航到连接错误页。
            revealLoginTerminal();
          }
        }
      };

      const restoreOrProbe = async (attempt = 0) => {
        if (hasStoredToken) {
          initialLocalRecoveryInFlight.current = true;
          try {
            const result = await dispatch(restoreLocalSession({
              deferNoSessionResolution: true,
            })).unwrap();
            if (cancelled) {
              initialLocalRecoveryInFlight.current = false;
              return;
            }
            if (result === 'restored') {
              initialLocalRecoveryInFlight.current = false;
              return;
            }
            if (result === 'central_recovery_required') {
              void resumeCentralWithoutNavigation();
              return;
            }
            if (result === 'transient_failure') {
              const retryDelay = INITIAL_LOCAL_RECOVERY_DELAYS_MS[attempt];
              if (retryDelay !== undefined) {
                recoveryTimer = setTimeout(() => {
                  recoveryTimer = null;
                  void restoreOrProbe(attempt + 1);
                }, retryDelay);
              } else {
                initialLocalRecoveryInFlight.current = false;
                continueWithCentralSession();
              }
              return;
            }
            initialLocalRecoveryInFlight.current = false;
          } catch {
            const retryDelay = INITIAL_LOCAL_RECOVERY_DELAYS_MS[attempt];
            if (!cancelled && retryDelay !== undefined) {
              recoveryTimer = setTimeout(() => {
                recoveryTimer = null;
                void restoreOrProbe(attempt + 1);
              }, retryDelay);
            } else {
              initialLocalRecoveryInFlight.current = false;
              continueWithCentralSession();
            }
            // 未分类异常同样按瞬时失败处理：保留 SDK session，不得回落到登出或中央 SSO。
            return;
          }
        }
        continueWithCentralSession();
      };

      void restoreOrProbe();

      return () => {
        cancelled = true;
        initialLocalRecoveryInFlight.current = false;
        if (loginTimer !== null) clearTimeout(loginTimer);
        if (recoveryTimer !== null) clearTimeout(recoveryTimer);
      };
    }
  }, [dispatch, isAuthenticated, hasShownInitialLogin]);

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
