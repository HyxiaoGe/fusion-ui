"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = searchParams.get("token");

    if (token) {
      // 将 token 存储到 localStorage
      localStorage.setItem("auth_token", token);
      
      // 重定向到设置页面，可以附加参数让设置页打开特定标签
      router.replace("/settings?tab=general&from=auth_callback");
    } else {
      // 如果没有 token，可能是个错误，重定向到首页或登录页
      router.replace("/");
    }
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center h-screen w-full">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">正在完成授权，请稍候...</p>
      </div>
    </div>
  );
} 