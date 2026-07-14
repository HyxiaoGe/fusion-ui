"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch } from "@/redux/hooks";
import { completeLogin } from "@/redux/slices/authSlice";
import { hasPendingSsoReturn } from "@/lib/auth/sso-probe";
import { useToast } from "@/components/ui/toast";

/**
 * 本次落到 /auth/callback 是不是「用户主动发起的交互式登录」。
 * 只有 URL 带 ?code（确有授权码要换）且非静默探测中转（探测会先记下 RETURN）时才算——
 * 据此仅在交互式登录时显示「正在完成授权」；登出裸回跳(无 code)/静默探测中转一律渲染中性态。
 */
function isInteractiveLogin(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const hasCode = new URLSearchParams(window.location.search).has("code");
    return hasCode && !hasPendingSsoReturn();
  } catch {
    return false;
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const processed = useRef(false);
  // SSR 与浏览器水合首帧统一渲染中性态；挂载后再读取 URL，避免服务端无 window、客户端有
  // ?code 时产生 hydration mismatch。来源判定仍须早于 completeLogin 消费 RETURN。
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    setInteractive(isInteractiveLogin());

    // completeLogin 内部：SDK 从 window.location 读 code/state 并校验 state、PKCE 换 token，
    // 成功后拉取 fusion profile；解析出的 redirectPath 已含静默/交互两种回跳路径。
    void dispatch(completeLogin())
      .unwrap()
      .then(({ redirectPath }) => {
        router.replace(redirectPath || "/");
      })
      .catch(() => {
        toast({ message: "登录失败，请重试", type: "error" });
        router.replace("/");
      });
  }, [dispatch, router, toast]);

  // 登出裸回跳 / 静默探测中转：中性加载态，不显示「正在完成授权」（用户没主动发起登录）。
  if (!interactive) {
    return (
      <div className="flex items-center justify-center h-screen w-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // 用户主动发起的交互式登录：显示「正在完成授权」。
  return (
    <div className="flex items-center justify-center h-screen w-full">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">正在完成授权，请稍候...</p>
      </div>
    </div>
  );
}
