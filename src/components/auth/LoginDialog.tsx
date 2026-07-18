"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Github, KeyRound, Mail, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import {
  startSsoLogin,
  supportsEmailCodeLogin,
  type SsoProvider,
} from "@/lib/auth/authService";
import { isAuthConfigured } from "@/lib/auth/auth-sdk";
import "@/lib/i18n";
import { useTranslation } from "react-i18next";

export function LoginDialog({
  open,
  onOpenChange,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isEmailLoginAvailable, setIsEmailLoginAvailable] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const isAnyLoginLoading = isGitHubLoading || isGoogleLoading || isEmailLoading;

  useEffect(() => {
    let active = true;
    setIsEmailLoginAvailable(false);
    if (!open) {
      return () => {
        active = false;
      };
    }

    void supportsEmailCodeLogin()
      .then((available) => {
        if (active) setIsEmailLoginAvailable(available);
      })
      .catch(() => {
        if (active) setIsEmailLoginAvailable(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const resetLoginLoading = () => {
    setIsGitHubLoading(false);
    setIsGoogleLoading(false);
    setIsEmailLoading(false);
  };

  const startHostedLogin = (provider: SsoProvider) => {
    if (!isAuthConfigured()) {
      toast({
        message: "登录配置缺失，请稍后再试",
        type: "error",
      });
      resetLoginLoading();
      return;
    }

    // 所有登录方式均由 auth-service 托管；SDK 生成 PKCE + state 后顶层跳转到 /auth/authorize。
    void startSsoLogin(provider).catch(() => {
      toast({
        message: "登录失败，请重试",
        type: "error",
      });
      resetLoginLoading();
    });
  };

  const handleGitHubLogin = () => {
    setIsGitHubLoading(true);
    startHostedLogin("github");
  };

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    startHostedLogin("google");
  };

  const handleEmailLogin = () => {
    setIsEmailLoading(true);
    startHostedLogin("email");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>登录</DialogTitle>
          <DialogDescription>
            选择一种方式登录，以解锁全部功能。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col space-y-4 py-4">
          <Button onClick={handleGitHubLogin} disabled={isAnyLoginLoading}>
            {isGitHubLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Github className="mr-2 h-4 w-4" />
            )}
            使用 GitHub 登录
          </Button>
          <Button onClick={handleGoogleLogin} disabled={isAnyLoginLoading}>
            {isGoogleLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            使用 Google 登录
          </Button>
          {isEmailLoginAvailable && (
            <Button onClick={handleEmailLogin} disabled={isAnyLoginLoading}>
              {isEmailLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="mr-2 h-4 w-4" />
              )}
              {t("auth.emailCodeLogin")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
