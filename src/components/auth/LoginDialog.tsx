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
import { Github, Mail } from "lucide-react";
import Link from "next/link";

export function LoginDialog({
  open,
  onOpenChange,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
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
          <Button asChild>
            <Link
              href="/api/auth/login/github"
              className="flex items-center justify-center gap-2"
            >
              <Github className="h-4 w-4" />
              使用 GitHub 登录
            </Link>
          </Button>
          <Button variant="outline" disabled>
            <Mail className="mr-2 h-4 w-4" />
            使用 Gmail 登录 (即将推出)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 