"use client";

import { Button } from "@/components/ui/button";
import { User } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FloatingLoginButtonProps {
  onClick: () => void;
}

export function FloatingLoginButton({ onClick }: FloatingLoginButtonProps) {
  return (
    <div className="fixed bottom-48 right-6 z-50 animate-fade-in">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              className="rounded-full h-14 w-14 shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
              aria-label="登录 / 注册"
              onClick={onClick}
            >
              <User className="h-6 w-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>登录 / 注册</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
} 