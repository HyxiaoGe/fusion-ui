"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAppDispatch } from "@/redux/hooks";
import { setToken, fetchUserProfile } from "@/redux/slices/authSlice";
import { exchangeAuthCode, storeAuthSession } from "@/lib/auth/authService";
import { useToast } from "@/components/ui/toast";

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      const code = searchParams?.get("code");
      const legacyToken = searchParams?.get("token");

      try {
        if (code) {
          const tokens = await exchangeAuthCode(code);
          if (cancelled) {
            return;
          }

          storeAuthSession(tokens);
          dispatch(setToken(tokens.access_token));
          await dispatch(fetchUserProfile());
          router.replace("/");
          return;
        }

        if (legacyToken) {
          dispatch(setToken(legacyToken));
          await dispatch(fetchUserProfile());
        }
      } catch {
        if (!cancelled) {
          toast({
            message: "登录失败，请重试",
            type: "error",
          });
        }
      }

      if (!cancelled) {
        router.replace("/");
      }
    };

    void completeAuth();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router, dispatch, toast]);

  return (
    <div className="flex items-center justify-center h-screen w-full">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">正在完成授权，请稍候...</p>
      </div>
    </div>
  );
} 
