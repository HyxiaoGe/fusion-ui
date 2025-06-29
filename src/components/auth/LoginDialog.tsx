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
import { API_CONFIG } from "@/lib/config";

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

  const handleGitHubLogin = () => {
    setIsGitHubLoading(true);
    window.location.href = `${API_CONFIG.BASE_URL}/api/auth/login/github`;
  };

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    window.location.href = `${API_CONFIG.BASE_URL}/api/auth/login/google`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>登录 / 注册</DialogTitle>
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