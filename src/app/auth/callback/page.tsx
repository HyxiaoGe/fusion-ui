"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch } from "@/redux/hooks";
import { setToken } from "@/redux/slices/authSlice";

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const dispatch = useAppDispatch();

  useEffect(() => {
    const token = searchParams?.get("token");

    if (token) {
      // 分发 action 来更新全局状态并存储 token
      dispatch(setToken(token));
      
      // 重定向到设置页面
      router.replace("/");
    } else {
      // 如果没有 token，重定向到首页
      router.replace("/");
    }
  }, [searchParams, router, dispatch]);

  return (
    <div className="flex items-center justify-center h-screen w-full">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">正在完成授权，请稍候...</p>
      </div>
    </div>
  );
} 