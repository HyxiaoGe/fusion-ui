"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch } from "@/redux/hooks";
import { completeLogin } from "@/redux/slices/authSlice";
import { useToast } from "@/components/ui/toast";

export default function AuthCallbackPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

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

  return (
    <div className="flex items-center justify-center h-screen w-full">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">正在完成授权，请稍候...</p>
      </div>
    </div>
  );
}
