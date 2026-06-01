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
import { Github, Mail, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { startSsoLogin } from "@/lib/auth/authService";
import { isAuthConfigured } from "@/lib/auth/auth-sdk";

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
  const { toast } = useToast();

  const startOAuthLogin = (provider: "github" | "google") => {
    if (!isAuthConfigured()) {
      toast({
        message: "登录配置缺失，请稍后再试",
        type: "error",
      });
      setIsGitHubLoading(false);
      setIsGoogleLoading(false);
      return;
    }

    // SDK 生成 PKCE + state 后顶层跳转到 /auth/authorize；成功即离开本页。
    void startSsoLogin(provider).catch(() => {
      toast({
        message: "登录失败，请重试",
        type: "error",
      });
      setIsGitHubLoading(false);
      setIsGoogleLoading(false);
    });
  };

  const handleGitHubLogin = () => {
    setIsGitHubLoading(true);
    startOAuthLogin("github");
  };

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    startOAuthLogin("google");
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
          <Button onClick={handleGitHubLogin} disabled={isGitHubLoading || isGoogleLoading}>
            {isGitHubLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Github className="mr-2 h-4 w-4" />
            )}
            使用 GitHub 登录
          </Button>
          <Button onClick={handleGoogleLogin} disabled={isGoogleLoading || isGitHubLoading}>
            {isGoogleLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            使用 Google 登录
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 
